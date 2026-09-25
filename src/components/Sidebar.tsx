import { useMemo, useState } from 'react'
import type { ItemKind, Room, Wall } from '../types'
import { runChecks } from '../checks'
import { presetLayouts } from '../data'
import { catalog, categories } from '../catalog'
import { footprint, rectOf } from '../geometry'
import { findFreeSpot, isRugKind } from '../placement'
import { useStore, type NewItemSpec } from '../store'
import type { Check } from '../types'

export function Sidebar() {
  const room = useStore((s) => s.room)
  const items = useStore((s) => s.items)
  const activeLayoutId = useStore((s) => s.activeLayoutId)
  const savedLayouts = useStore((s) => s.savedLayouts)
  const selectedId = useStore((s) => s.selectedId)
  const checks = useMemo(() => runChecks(room, items), [room, items])
  const layout = [...presetLayouts, ...savedLayouts].find((l) => l.id === activeLayoutId)
  const selected = items.find((i) => i.id === selectedId)
  const problems = checks.filter((c) => c.level !== 'ok')
  const good = checks.filter((c) => c.level === 'ok')

  return (
    <aside className="sidebar">
      <section className="card">
        <h4>Layout</h4>
        <h3>{layout ? layout.name : 'Your version'}</h3>
        <p className="muted">{layout ? layout.description : 'You have moved things around. Save it below to keep it.'}</p>
        {!layout && <p className="pink small">✎ Changed. This is your own version.</p>}
        <ul className="notes">
          {good.map((c, i) => <CheckLine key={i} c={c} />)}
        </ul>
      </section>

      {selected && <SelectionCard id={selected.id} />}

      <section className="card">
        <h4>Checks ({problems.length})</h4>
        {problems.length === 0 ? (
          <p className="ok-text">✓ Nothing in the way. Everything fits.</p>
        ) : (
          <ul className="notes">
            {problems.map((c, i) => <CheckLine key={i} c={c} />)}
          </ul>
        )}
      </section>

      <FurniturePalette />
      <RoomCard />
      <DisplaySettings />
      <SavedLayouts />

      <p className="footnote">
        Sizes are taken from photos and the IKEA catalogue (about ±2 cm). Measure the room with a tape before ordering.
      </p>
    </aside>
  )
}

function CheckLine({ c }: { c: Check }) {
  const select = useStore((s) => s.select)
  const icon = c.level === 'ok' ? '✓' : c.level === 'warn' ? '!' : '✕'
  return (
    <li className={`note ${c.level}`} onClick={() => c.itemIds[0] && select(c.itemIds[0])} role={c.itemIds.length ? 'button' : undefined}>
      <span className="note-icon">{icon}</span>
      <span>{c.text}</span>
    </li>
  )
}

function SelectionCard({ id }: { id: string }) {
  const item = useStore((s) => s.items.find((i) => i.id === id))!
  const room = useStore((s) => s.room)
  const rotateItem = useStore((s) => s.rotateItem)
  const resizeItem = useStore((s) => s.resizeItem)
  const updateItem = useStore((s) => s.updateItem)
  const removeItem = useStore((s) => s.removeItem)
  const toggleInRoom = useStore((s) => s.toggleInRoom)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const r = rectOf(item)
  const { fw, fd } = footprint(item)
  const num = (v: number) => Math.round(v)

  return (
    <section className="card selection">
      <h4>Selected</h4>
      <div className="sel-head">
        <input type="color" className="swatch-input" value={item.color} onChange={(e) => updateItem(item.id, { color: e.target.value })} title="Colour" />
        <input className="text name" value={item.name} onChange={(e) => updateItem(item.id, { name: e.target.value })} />
      </div>
      {item.note && <p className="muted small">{item.note}</p>}
      <div className="row">
        <button className="chip" onClick={() => rotateItem(item.id, -90)} title="Rotate left">↺ 90°</button>
        <button className="chip" onClick={() => rotateItem(item.id, 90)} title="Rotate right">↻ 90°</button>
        <button className="chip" onClick={() => rotateItem(item.id, 180)} title="Turn around">⇄ 180°</button>
      </div>
      <div className="dims-grid">
        <label>Width (cm)<input type="number" value={item.w} min={5} max={600} onChange={(e) => resizeItem(item.id, { w: +e.target.value || item.w })} /></label>
        <label>Depth (cm)<input type="number" value={item.d} min={5} max={600} onChange={(e) => resizeItem(item.id, { d: +e.target.value || item.d })} /></label>
        <label>Height (cm)<input type="number" value={item.h} min={1} max={400} onChange={(e) => resizeItem(item.id, { h: +e.target.value || item.h })} /></label>
      </div>
      <label className="field">
        Type
        <select value={item.kind} onChange={(e) => updateItem(item.id, { kind: e.target.value as ItemKind })}>
          {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
        </select>
      </label>
      {item.inRoom ? (
        <p className="muted small">
          Footprint {num(fw)} × {num(fd)} cm · {num(r.x0)} cm from the left wall, {num(room.w - r.x1)} cm from the right wall, {num(r.y0)} cm from the back wall · turned {item.rot}°
        </p>
      ) : (
        <p className="muted small">This item is out of the room.</p>
      )}
      <div className="row">
        <button className="chip ghost" onClick={() => toggleInRoom(item.id)}>
          {item.inRoom ? 'Take out of the room' : 'Put back in the room'}
        </button>
        {confirmDelete ? (
          <>
            <button className="chip danger" onClick={() => removeItem(item.id)}>Yes, delete</button>
            <button className="chip ghost" onClick={() => setConfirmDelete(false)}>Keep</button>
          </>
        ) : (
          <button className="chip ghost" onClick={() => setConfirmDelete(true)}>Delete</button>
        )}
      </div>
    </section>
  )
}

const KINDS: { id: ItemKind; label: string }[] = [
  { id: 'bed', label: 'Bed' },
  { id: 'chair', label: 'Chair' },
  { id: 'desk', label: 'Desk' },
  { id: 'table', label: 'Table' },
  { id: 'sofa', label: 'Sofa / armchair' },
  { id: 'shelf', label: 'Shelf' },
  { id: 'bookcase', label: 'Bookcase' },
  { id: 'dresser', label: 'Dresser' },
  { id: 'nightstand', label: 'Nightstand' },
  { id: 'wardrobe', label: 'Wardrobe' },
  { id: 'rug', label: 'Round rug' },
  { id: 'rugRect', label: 'Rectangular rug' },
  { id: 'box', label: 'Plain box' },
]

const WALLS: { id: Wall; label: string }[] = [
  { id: 'top', label: 'Back wall' },
  { id: 'bottom', label: 'Front wall' },
  { id: 'left', label: 'Left wall' },
  { id: 'right', label: 'Right wall' },
]

/** Adds a new item at a free spot (against a wall when possible) and turns its back to that wall. */
function placeNew(spec: NewItemSpec) {
  const s = useStore.getState()
  const spot = findFreeSpot(s.room, s.items, spec.w, spec.d, { h: spec.h, prefer: isRugKind(spec.kind) ? 'centre' : 'wall' })
  const id = s.addItem(spec, spot)
  if (spot.rot) s.rotateItem(id, spot.rot === 270 ? -90 : spot.rot)
  // addItem clamps the unturned footprint into the room first, so put it back on the exact spot
  s.moveItem(id, spot.x, spot.y)
  return id
}

function FurniturePalette() {
  const [open, setOpen] = useState(true)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')
  const [customOpen, setCustomOpen] = useState(false)
  const [spec, setSpec] = useState<NewItemSpec>({ name: '', kind: 'box', w: 80, d: 40, h: 75, color: '#f7f4ef' })
  const upd = <K extends keyof NewItemSpec>(k: K, v: NewItemSpec[K]) => setSpec((p) => ({ ...p, [k]: v }))

  const q = query.trim().toLowerCase()
  const visible = catalog.filter((p) => (category === 'All' || p.category === category) && (!q || p.name.toLowerCase().includes(q)))
  const groups = categories.map((c) => ({ c, presets: visible.filter((p) => p.category === c) })).filter((g) => g.presets.length > 0)

  return (
    <section className="card">
      <button className="card-toggle" onClick={() => setOpen((o) => !o)}>
        <h4>Add furniture</h4>
        <span className="chev">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="palette">
          <input className="text palette-search" type="search" placeholder="Search, e.g. wardrobe" value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="palette-cats">
            {['All', ...categories].map((c) => (
              <button key={c} className={`chip${category === c ? ' on' : ''}`} onClick={() => setCategory(c)}>{c}</button>
            ))}
          </div>
          <ul className="palette-list">
            {groups.length === 0 && <li className="palette-empty muted small">Nothing matches "{query.trim()}". Try the custom size below.</li>}
            {groups.map((g) => (
              <li key={g.c}>
                {groups.length > 1 && <div className="palette-group">{g.c}</div>}
                <ul>
                  {g.presets.map((p) => (
                    <li key={p.id}>
                      <button
                        className="palette-row"
                        title={p.note ?? `Add ${p.name}`}
                        onClick={() => placeNew({ name: p.name, kind: p.kind, w: p.w, d: p.d, h: p.h, color: p.color, note: p.note })}
                      >
                        <span className="swatch" style={{ background: p.color }} />
                        <span className="palette-name">{p.name}</span>
                        <span className="palette-dims">{p.w}×{p.d}×{p.h}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          <p className="muted small">Click a row to add it. New things land against a free wall, clear of the door. Select one and press Delete to take it out.</p>
          <button className="palette-custom-toggle" onClick={() => setCustomOpen((o) => !o)}>
            <span className="chev">{customOpen ? '▾' : '▸'}</span> Custom size…
          </button>
          {customOpen && (
            <form
              className="palette-custom"
              onSubmit={(e) => { e.preventDefault(); placeNew(spec); setSpec((p) => ({ ...p, name: '' })) }}
            >
              <div className="row">
                <input className="text" placeholder="Name, e.g. Toy chest" value={spec.name} onChange={(e) => upd('name', e.target.value)} />
                <input type="color" className="swatch-input" value={spec.color} onChange={(e) => upd('color', e.target.value)} title="Colour" />
              </div>
              <label className="field">
                Type
                <select value={spec.kind} onChange={(e) => upd('kind', e.target.value as ItemKind)}>
                  {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
                </select>
              </label>
              <div className="dims-grid">
                <label>Width (cm)<input type="number" value={spec.w} min={5} max={600} onChange={(e) => upd('w', +e.target.value)} /></label>
                <label>Depth (cm)<input type="number" value={spec.d} min={5} max={600} onChange={(e) => upd('d', +e.target.value)} /></label>
                <label>Height (cm)<input type="number" value={spec.h} min={1} max={400} onChange={(e) => upd('h', +e.target.value)} /></label>
              </div>
              <div className="row">
                <button className="chip solid" type="submit">Add to the room</button>
              </div>
            </form>
          )}
        </div>
      )}
    </section>
  )
}

function RoomCard() {
  const room = useStore((s) => s.room)
  const setRoom = useStore((s) => s.setRoom)
  const [open, setOpen] = useState(false)
  const n = (v: string, fallback: number) => (v === '' ? fallback : +v)
  const patchOpening = <K extends 'window' | 'door' | 'radiator'>(key: K, patch: Partial<Room[K]>) => setRoom({ [key]: { ...room[key], ...patch } } as Partial<Room>)
  return (
    <section className="card">
      <button className="card-toggle" onClick={() => setOpen((o) => !o)}>
        <h4>Room</h4>
        <span className="muted small">{room.w} × {room.d} × {room.h} cm</span>
        <span className="chev">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="room-form">
          <div className="row">
            <input className="text" value={room.name} onChange={(e) => setRoom({ name: e.target.value })} placeholder="Room name" />
          </div>
          <div className="row">
            <input className="text" value={room.subtitle} onChange={(e) => setRoom({ subtitle: e.target.value })} placeholder="Subtitle, e.g. New bed 140 × 200" />
          </div>
          <div className="dims-grid">
            <label>Width (cm)<input type="number" value={room.w} min={150} max={1200} onChange={(e) => setRoom({ w: n(e.target.value, room.w) })} /></label>
            <label>Depth (cm)<input type="number" value={room.d} min={150} max={1200} onChange={(e) => setRoom({ d: n(e.target.value, room.d) })} /></label>
            <label>Height (cm)<input type="number" value={room.h} min={200} max={400} onChange={(e) => setRoom({ h: n(e.target.value, room.h) })} /></label>
          </div>
          <p className="muted small">Width runs left to right on the plan, depth from the back wall to the front wall.</p>

          <h5>Window</h5>
          <div className="dims-grid four">
            <label>Wall<select value={room.window.wall} onChange={(e) => patchOpening('window', { wall: e.target.value as Wall })}>{WALLS.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}</select></label>
            <label>From corner<input type="number" value={room.window.offset} min={0} onChange={(e) => patchOpening('window', { offset: n(e.target.value, room.window.offset) })} /></label>
            <label>Width<input type="number" value={room.window.width} min={30} onChange={(e) => patchOpening('window', { width: n(e.target.value, room.window.width) })} /></label>
            <label>Height<input type="number" value={room.window.height} min={30} onChange={(e) => patchOpening('window', { height: n(e.target.value, room.window.height) })} /></label>
            <label>Sill height<input type="number" value={room.window.sill} min={0} onChange={(e) => patchOpening('window', { sill: n(e.target.value, room.window.sill) })} /></label>
          </div>

          <h5>Door</h5>
          <div className="dims-grid four">
            <label>Wall<select value={room.door.wall} onChange={(e) => patchOpening('door', { wall: e.target.value as Wall })}>{WALLS.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}</select></label>
            <label>From corner<input type="number" value={room.door.offset} min={0} onChange={(e) => patchOpening('door', { offset: n(e.target.value, room.door.offset) })} /></label>
            <label>Width<input type="number" value={room.door.width} min={30} onChange={(e) => patchOpening('door', { width: n(e.target.value, room.door.width) })} /></label>
            <label>Height<input type="number" value={room.door.height} min={150} onChange={(e) => patchOpening('door', { height: n(e.target.value, room.door.height) })} /></label>
            <label>Hinge<select value={room.door.hinge} onChange={(e) => patchOpening('door', { hinge: e.target.value as 'left' | 'right' })}><option value="left">Near corner</option><option value="right">Far corner</option></select></label>
          </div>
          <p className="muted small">"From corner" is measured from the left end of a back or front wall, or from the back end of a side wall.</p>

          <h5>Radiator</h5>
          <div className="dims-grid four">
            <label>Wall<select value={room.radiator.wall} onChange={(e) => patchOpening('radiator', { wall: e.target.value as Wall })}>{WALLS.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}</select></label>
            <label>From corner<input type="number" value={room.radiator.offset} min={0} onChange={(e) => patchOpening('radiator', { offset: n(e.target.value, room.radiator.offset) })} /></label>
            <label>Width<input type="number" value={room.radiator.width} min={0} onChange={(e) => patchOpening('radiator', { width: n(e.target.value, room.radiator.width) })} /></label>
            <label>Height<input type="number" value={room.radiator.height} min={0} onChange={(e) => patchOpening('radiator', { height: n(e.target.value, room.radiator.height) })} /></label>
          </div>

          <h5>Colours</h5>
          <div className="colors">
            {WALLS.map((w) => (
              <label key={w.id}><input type="color" className="swatch-input" value={room.wallColors[w.id]} onChange={(e) => setRoom({ wallColors: { ...room.wallColors, [w.id]: e.target.value } })} />{w.label}</label>
            ))}
            <label><input type="color" className="swatch-input" value={room.floorColor} onChange={(e) => setRoom({ floorColor: e.target.value })} />Floor</label>
          </div>
        </div>
      )}
    </section>
  )
}

function DisplaySettings() {
  const doorAngle = useStore((s) => s.doorAngle)
  const blinds = useStore((s) => s.blinds)
  const bedding = useStore((s) => s.bedding)
  const walkHeight = useStore((s) => s.walkHeight)
  const quality = useStore((s) => s.quality)
  const set = useStore((s) => s.setSetting)
  return (
    <section className="card">
      <h4>Display settings</h4>
      <div className="setting">
        <span>Room door</span>
        <input type="range" min={0} max={90} value={doorAngle} onChange={(e) => set('doorAngle', +e.target.value)} />
        <b>{doorAngle}°</b>
      </div>
      <div className="setting">
        <span>Blinds</span>
        <input type="range" min={0} max={100} value={blinds} onChange={(e) => set('blinds', +e.target.value)} />
        <b>{blinds}%</b>
      </div>
      <div className="setting wide">
        <span>Bedding on the bed</span>
        <button className={`toggle${bedding ? ' on' : ''}`} onClick={() => set('bedding', !bedding)} aria-pressed={bedding}><i /></button>
      </div>
      <div className="setting wide">
        <span>Eye height when walking</span>
        <div className="seg">
          <button className={walkHeight === 'adult' ? 'on' : ''} onClick={() => set('walkHeight', 'adult')}>Adult</button>
          <button className={walkHeight === 'child' ? 'on' : ''} onClick={() => set('walkHeight', 'child')}>Child</button>
        </div>
      </div>
      <div className="setting wide">
        <span>3D quality</span>
        <div className="seg">
          <button className={quality === 'best' ? 'on' : ''} onClick={() => set('quality', 'best')}>Best</button>
          <button className={quality === 'fast' ? 'on' : ''} onClick={() => set('quality', 'fast')}>Fast</button>
        </div>
      </div>
    </section>
  )
}

function SavedLayouts() {
  const saved = useStore((s) => s.savedLayouts)
  const activeLayoutId = useStore((s) => s.activeLayoutId)
  const saveLayout = useStore((s) => s.saveLayout)
  const deleteLayout = useStore((s) => s.deleteLayout)
  const applyLayout = useStore((s) => s.applyLayout)
  const [name, setName] = useState('')
  return (
    <section className="card">
      <h4>My layouts</h4>
      <form
        className="row"
        onSubmit={(e) => { e.preventDefault(); saveLayout(name); setName('') }}
      >
        <input className="text" placeholder="e.g. Grandma's version" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="chip solid" type="submit">Save</button>
      </form>
      {saved.length === 0 ? (
        <p className="muted small">Nothing saved yet.</p>
      ) : (
        <ul className="saved">
          {saved.map((l) => (
            <li key={l.id} className={l.id === activeLayoutId ? 'on' : ''}>
              <button className="link" onClick={() => applyLayout(l)}>{l.name}</button>
              <button className="x" onClick={() => deleteLayout(l.id)} title="Delete">×</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
