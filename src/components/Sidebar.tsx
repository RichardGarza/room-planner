import { useMemo, useState } from 'react'
import type { Door, ItemKind, Opening, Radiator, Wall } from '../types'
import { runChecks } from '../checks'
import { presetLayouts } from '../data'
import { catalog, categories } from '../catalog'
import { footprint, rectOf } from '../geometry'
import { findFreeSpot, isRugKind } from '../placement'
import { useStore, type NewItemSpec } from '../store'
import { ClosetRows } from './ClosetRows'
import type { Check } from '../types'
import { formatLength, formatRoomDims, formatSize, useUnits } from '../units'
import { LengthInput } from './LengthInput'

export function Sidebar() {
  const room = useStore((s) => s.room)
  const items = useStore((s) => s.items)
  const activeLayoutId = useStore((s) => s.activeLayoutId)
  const savedLayouts = useStore((s) => s.savedLayouts)
  const suggestions = useStore((s) => s.suggestions)
  const selectedId = useStore((s) => s.selectedId)
  const unit = useUnits((s) => s.unit)
  // the check texts carry lengths, so they are worked out again when the unit changes
  const checks = useMemo(() => runChecks(room, items, { len: (cm) => formatLength(cm, { unit }) }), [room, items, unit])
  const layout = [...presetLayouts, ...suggestions, ...savedLayouts].find((l) => l.id === activeLayoutId)
  const isSuggestion = !!layout && suggestions.includes(layout)
  const isSaved = !!layout && savedLayouts.includes(layout)
  const title = !layout ? 'Your version' : isSuggestion ? `Suggestion ${layout.name}` : isSaved ? `Your layout · ${layout.name}` : layout.name
  const selected = items.find((i) => i.id === selectedId)
  const problems = checks.filter((c) => c.level !== 'ok')
  const good = checks.filter((c) => c.level === 'ok')

  return (
    <aside className="sidebar">
      <section className="card">
        <h4>Layout</h4>
        <h3>{title}</h3>
        <p className="muted">{layout ? layout.description : 'You have moved things around. Save it below to keep it.'}</p>
        {!layout && <p className="pink small">✎ Changed. This is your own version.</p>}
        {suggestions.length > 0 && <p className="muted small suggest-note">Scored by the checks below — the recommended one had the fewest problems.</p>}
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
        Sizes are taken from photos and the IKEA catalogue (about ±{formatLength(2, { unit })}). Measure the room with a tape before ordering.
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
  const unit = useUnits((s) => s.unit)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const r = rectOf(item)
  const { fw, fd } = footprint(item)
  const len = (v: number) => formatLength(v, { unit })

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
        <label>Width ({unit})<LengthInput value={item.w} min={5} max={600} onCommit={(w) => resizeItem(item.id, { w })} /></label>
        <label>Depth ({unit})<LengthInput value={item.d} min={5} max={600} onCommit={(d) => resizeItem(item.id, { d })} /></label>
        <label>Height ({unit})<LengthInput value={item.h} min={1} max={400} onCommit={(h) => resizeItem(item.id, { h })} /></label>
      </div>
      <label className="field">
        Type
        <select value={item.kind} onChange={(e) => updateItem(item.id, { kind: e.target.value as ItemKind })}>
          {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
        </select>
      </label>
      {item.inRoom ? (
        <p className="muted small">
          Footprint {formatSize(fw, fd, undefined, { unit })} · {len(r.x0)} from the left wall, {len(room.w - r.x1)} from the right wall, {len(r.y0)} from the back wall · turned {item.rot}°
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
  const unit = useUnits((s) => s.unit)
  const upd = <K extends keyof NewItemSpec>(k: K, v: NewItemSpec[K]) => setSpec((p) => ({ ...p, [k]: v }))

  const q = query.trim().toLowerCase()
  const visible = catalog.filter((p) => (category === 'All' || p.category === category) && (!q || p.name.toLowerCase().includes(q)))
  const groups = categories.map((c) => ({ c, presets: visible.filter((p) => p.category === c) })).filter((g) => g.presets.length > 0)

  return (
    <section className="card">
      <button className="card-toggle" onClick={() => setOpen((o) => !o)}>
        <h4>Add furniture</h4>
        <span className="muted small" title="Sizes are width × depth × height">w × d × h in {unit === 'in' ? 'inches' : 'cm'}</span>
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
                        <span className="palette-dims">{formatSize(p.w, p.d, p.h, { unit, bare: true, compact: true })}</span>
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
                <label>Width ({unit})<LengthInput value={spec.w} min={5} max={600} onCommit={(w) => upd('w', w)} /></label>
                <label>Depth ({unit})<LengthInput value={spec.d} min={5} max={600} onCommit={(d) => upd('d', d)} /></label>
                <label>Height ({unit})<LengthInput value={spec.h} min={1} max={400} onCommit={(h) => upd('h', h)} /></label>
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

/** Header line for one window / door / radiator row, with its remove button. */
function OpeningHead({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <h5 style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      {label}
      <button className="x" onClick={onRemove} title={`Remove ${label.toLowerCase()}`} aria-label={`Remove ${label.toLowerCase()}`}>×</button>
    </h5>
  )
}

function WallSelect({ value, onChange }: { value: Wall; onChange: (w: Wall) => void }) {
  return (
    <label>
      Wall
      <select value={value} onChange={(e) => onChange(e.target.value as Wall)}>
        {WALLS.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
      </select>
    </label>
  )
}

function WindowRows() {
  const windows = useStore((s) => s.room.windows)
  const updateOpening = useStore((s) => s.updateOpening)
  const removeOpening = useStore((s) => s.removeOpening)
  return (
    <>
      {windows.map((w, i) => {
        const patch = (p: Partial<Opening>) => updateOpening('window', w.id, p)
        return (
          <div key={w.id}>
            <OpeningHead label={windows.length > 1 ? `Window ${i + 1}` : 'Window'} onRemove={() => removeOpening('window', w.id)} />
            <div className="dims-grid four">
              <WallSelect value={w.wall} onChange={(wall) => patch({ wall })} />
              <label>From corner<LengthInput value={w.offset} min={0} max={1200} onCommit={(offset) => patch({ offset })} /></label>
              <label>Width<LengthInput value={w.width} min={30} max={1200} onCommit={(width) => patch({ width })} /></label>
              <label>Height<LengthInput value={w.height} min={30} max={400} onCommit={(height) => patch({ height })} /></label>
              <label>Sill height<LengthInput value={w.sill} min={0} max={300} onCommit={(sill) => patch({ sill })} /></label>
            </div>
          </div>
        )
      })}
    </>
  )
}

function DoorRows() {
  const doors = useStore((s) => s.room.doors)
  const updateOpening = useStore((s) => s.updateOpening)
  const removeOpening = useStore((s) => s.removeOpening)
  return (
    <>
      {doors.map((d, i) => {
        const patch = (p: Partial<Door>) => updateOpening('door', d.id, p)
        return (
          <div key={d.id}>
            <OpeningHead label={doors.length > 1 ? `Door ${i + 1}` : 'Door'} onRemove={() => removeOpening('door', d.id)} />
            <div className="dims-grid four">
              <WallSelect value={d.wall} onChange={(wall) => patch({ wall })} />
              <label>From corner<LengthInput value={d.offset} min={0} max={1200} onCommit={(offset) => patch({ offset })} /></label>
              <label>Width<LengthInput value={d.width} min={30} max={400} onCommit={(width) => patch({ width })} /></label>
              <label>Height<LengthInput value={d.height} min={150} max={400} onCommit={(height) => patch({ height })} /></label>
              <label>Hinge<select value={d.hinge} onChange={(e) => patch({ hinge: e.target.value as Door['hinge'] })}><option value="left">Near corner</option><option value="right">Far corner</option></select></label>
              <label>Swing<select value={d.swing} onChange={(e) => patch({ swing: e.target.value as Door['swing'] })}><option value="in">Into the room</option><option value="out">Out of the room</option></select></label>
            </div>
          </div>
        )
      })}
    </>
  )
}

function RadiatorRows() {
  const radiators = useStore((s) => s.room.radiators)
  const updateOpening = useStore((s) => s.updateOpening)
  const removeOpening = useStore((s) => s.removeOpening)
  return (
    <>
      {radiators.map((r, i) => {
        const patch = (p: Partial<Radiator>) => updateOpening('radiator', r.id, p)
        return (
          <div key={r.id}>
            <OpeningHead label={radiators.length > 1 ? `Radiator ${i + 1}` : 'Radiator'} onRemove={() => removeOpening('radiator', r.id)} />
            <div className="dims-grid four">
              <WallSelect value={r.wall} onChange={(wall) => patch({ wall })} />
              <label>From corner<LengthInput value={r.offset} min={0} max={1200} onCommit={(offset) => patch({ offset })} /></label>
              <label>Width<LengthInput value={r.width} min={20} max={400} onCommit={(width) => patch({ width })} /></label>
              <label>Height<LengthInput value={r.height} min={20} max={300} onCommit={(height) => patch({ height })} /></label>
            </div>
          </div>
        )
      })}
    </>
  )
}

function RoomCard() {
  const room = useStore((s) => s.room)
  const setRoom = useStore((s) => s.setRoom)
  const addOpening = useStore((s) => s.addOpening)
  const unit = useUnits((s) => s.unit)
  const [open, setOpen] = useState(false)
  return (
    <section className="card">
      <button className="card-toggle" onClick={() => setOpen((o) => !o)}>
        <h4>Room</h4>
        <span className="muted small">{formatRoomDims(room.w, room.d, room.h, { unit })}</span>
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
            <label>Width ({unit})<LengthInput value={room.w} min={150} max={1200} onCommit={(w) => setRoom({ w })} /></label>
            <label>Depth ({unit})<LengthInput value={room.d} min={150} max={1200} onCommit={(d) => setRoom({ d })} /></label>
            <label>Height ({unit})<LengthInput value={room.h} min={200} max={400} onCommit={(h) => setRoom({ h })} /></label>
          </div>
          <p className="muted small">Width runs left to right on the plan, depth from the back wall to the front wall.</p>

          <h5>Windows</h5>
          {room.windows.length === 0 && <p className="muted small">No windows.</p>}
          <WindowRows />
          <div className="row"><button className="chip ghost" onClick={() => addOpening('window')}>+ Add window</button></div>

          <h5>Doors</h5>
          {room.doors.length === 0 && <p className="muted small">No doors.</p>}
          <DoorRows />
          <div className="row"><button className="chip ghost" onClick={() => addOpening('door')}>+ Add door</button></div>
          <p className="muted small">"From corner" is measured from the left end of a back or front wall, or from the back end of a side wall. "Near corner" puts the hinge at that end.</p>

          <h5>Radiators</h5>
          {room.radiators.length === 0 && <p className="muted small">No radiators.</p>}
          <RadiatorRows />
          <div className="row"><button className="chip ghost" onClick={() => addOpening('radiator')}>+ Add radiator</button></div>

          <ClosetRows />

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
