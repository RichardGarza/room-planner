import { useEffect, useMemo, useState } from 'react'
import { getStorage } from '../storage'
import { timeAgo, useLibrary } from '../library'
import { migrateDoc } from '../migrate'
import type { Item, Room, RoomDoc, RoomSummary } from '../types'
import { PlanThumb } from './PlanThumb'

const NO_GROUP = 'No group'

/** Home screen: every saved room, grouped, with a thumbnail and a small menu. */
export function Library() {
  const rooms = useLibrary((s) => s.rooms)
  const groups = useLibrary((s) => s.groups)
  const status = useLibrary((s) => s.status)
  const error = useLibrary((s) => s.error)
  const location = useLibrary((s) => s.location)
  const importDoc = useLibrary((s) => s.importDoc)
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rooms
    return rooms.filter((r) => r.name.toLowerCase().includes(q) || r.group.toLowerCase().includes(q))
  }, [rooms, query])

  const sections = useMemo(() => {
    const byGroup = new Map<string, RoomSummary[]>()
    for (const r of filtered) {
      const key = r.group || NO_GROUP
      byGroup.set(key, [...(byGroup.get(key) ?? []), r])
    }
    const names = [...byGroup.keys()].filter((g) => g !== NO_GROUP).sort((a, b) => a.localeCompare(b))
    if (byGroup.has(NO_GROUP)) names.push(NO_GROUP)
    return names.map((g) => ({
      name: g,
      rooms: (byGroup.get(g) ?? []).slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    }))
  }, [filtered])

  const loading = status === 'loading' && rooms.length === 0

  return (
    <div className="library">
      <header className="lib-head">
        <div className="lib-title">
          <span className="logo">R</span>
          <div>
            <h1>Room Planner</h1>
            <p className="muted">Rooms are saved in {location || '…'}</p>
          </div>
        </div>
        <div className="lib-tools">
          <input
            className="text lib-search"
            type="search"
            placeholder="Search rooms or groups"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search rooms"
          />
          <button className="chip ghost" onClick={() => void importDoc()}>Import JSON</button>
          <button className="chip solid pink-btn" onClick={() => setCreating((c) => !c)}>{creating ? 'Cancel' : '+ New room'}</button>
        </div>
      </header>

      {creating && <NewRoomPanel groups={groups} onDone={() => setCreating(false)} />}

      {error && (
        <div className="lib-error" role="alert">
          <span>{error}</span>
          <button className="chip ghost" onClick={() => useLibrary.setState({ error: null, status: 'idle' })}>Dismiss</button>
        </div>
      )}

      {loading ? (
        <p className="lib-empty muted">Loading your rooms…</p>
      ) : rooms.length === 0 ? (
        <div className="lib-empty">
          <h2>No rooms yet</h2>
          <p className="muted">
            A room is a real space you want to furnish: measure it, add its windows and doors, then try layouts in 2D and 3D.
            Everything you change is saved automatically, so you can come back to it when you renovate.
          </p>
          <button className="chip solid pink-btn" onClick={() => setCreating(true)}>Create your first room</button>
        </div>
      ) : filtered.length === 0 ? (
        <p className="lib-empty muted">Nothing matches “{query}”.</p>
      ) : (
        sections.map((sec) => (
          <section key={sec.name} className="lib-group">
            <h4>
              {sec.name} <span className="count">{sec.rooms.length}</span>
            </h4>
            <div className="lib-grid">
              {sec.rooms.map((r) => <RoomCard key={r.id} summary={r} groups={groups} />)}
            </div>
          </section>
        ))
      )}
    </div>
  )
}

/* ---------- new room ---------- */

function NewRoomPanel({ groups, onDone }: { groups: string[]; onDone: () => void }) {
  const create = useLibrary((s) => s.create)
  const [name, setName] = useState('')
  const [group, setGroup] = useState('')
  const [w, setW] = useState(300)
  const [d, setD] = useState(400)
  const [h, setH] = useState(260)
  const [fromExample, setFromExample] = useState(false)
  const [busy, setBusy] = useState(false)
  const valid = name.trim().length > 0

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    await create({ name, group, w, d, h, fromExample })
    setBusy(false)
    onDone()
  }

  return (
    <form className="card lib-new" onSubmit={submit}>
      <h4>New room</h4>
      <div className="lib-new-grid">
        <label className="field wide">
          Name
          <input className="text name" autoFocus required placeholder="e.g. Mila's room" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          Group
          <input className="text" list="lib-groups" placeholder="e.g. Home, Cabin, 2027 renovation" value={group} onChange={(e) => setGroup(e.target.value)} />
          <datalist id="lib-groups">
            {groups.map((g) => <option key={g} value={g} />)}
          </datalist>
        </label>
        <div className="dims-grid">
          <label>Width (cm)<input type="number" min={150} max={1200} value={w} disabled={fromExample} onChange={(e) => setW(Number(e.target.value))} /></label>
          <label>Depth (cm)<input type="number" min={150} max={1200} value={d} disabled={fromExample} onChange={(e) => setD(Number(e.target.value))} /></label>
          <label>Height (cm)<input type="number" min={200} max={400} value={h} disabled={fromExample} onChange={(e) => setH(Number(e.target.value))} /></label>
        </div>
        <label className="lib-check">
          <input type="checkbox" checked={fromExample} onChange={(e) => setFromExample(e.target.checked)} />
          Start from the example room (Mila's room with its furniture and layouts)
        </label>
      </div>
      <div className="row">
        <button className="chip solid pink-btn" type="submit" disabled={!valid || busy}>Create</button>
        <button className="chip ghost" type="button" onClick={onDone}>Cancel</button>
      </div>
    </form>
  )
}

/* ---------- room card ---------- */

type CardMode = null | 'menu' | 'rename' | 'group' | 'delete'

function RoomCard({ summary, groups }: { summary: RoomSummary; groups: string[] }) {
  const open = useLibrary((s) => s.open)
  const rename = useLibrary((s) => s.rename)
  const setGroup = useLibrary((s) => s.setGroup)
  const duplicate = useLibrary((s) => s.duplicate)
  const exportDoc = useLibrary((s) => s.exportDoc)
  const remove = useLibrary((s) => s.remove)
  const [mode, setMode] = useState<CardMode>(null)
  const [draft, setDraft] = useState('')
  const preview = useDocPreview(summary.id, summary.updatedAt)

  const stop = (e: React.SyntheticEvent) => e.stopPropagation()
  const startRename = () => { setDraft(summary.name); setMode('rename') }
  const startGroup = () => { setDraft(summary.group); setMode('group') }

  const commitRename = async () => {
    const n = draft.trim()
    setMode(null)
    if (n && n !== summary.name) await rename(summary.id, n)
  }
  const commitGroup = async () => {
    const g = draft.trim()
    setMode(null)
    if (g !== summary.group) await setGroup(summary.id, g)
  }

  return (
    <article
      className="lib-card"
      onClick={() => { if (!mode) void open(summary.id) }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' && !mode) void open(summary.id) }}
    >
      <div className="lib-thumb">
        {preview ? (
          <PlanThumb room={preview.room} items={preview.items} size={200} />
        ) : (
          <div className="lib-thumb-blank" style={{ aspectRatio: `${summary.w} / ${summary.d}` }} />
        )}
      </div>
      <div className="lib-card-body" onClick={stop}>
        {mode === 'rename' ? (
          <form className="lib-inline" onSubmit={(e) => { e.preventDefault(); void commitRename() }}>
            <input className="text name" autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => void commitRename()} onKeyDown={(e) => { if (e.key === 'Escape') setMode(null) }} />
          </form>
        ) : mode === 'group' ? (
          <form className="lib-inline" onSubmit={(e) => { e.preventDefault(); void commitGroup() }}>
            <input className="text" autoFocus list={`groups-${summary.id}`} placeholder="Group name (empty for none)" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => void commitGroup()} onKeyDown={(e) => { if (e.key === 'Escape') setMode(null) }} />
            <datalist id={`groups-${summary.id}`}>
              {groups.map((g) => <option key={g} value={g} />)}
            </datalist>
          </form>
        ) : mode === 'delete' ? (
          <div className="lib-inline lib-confirm">
            <span>Delete “{summary.name}”?</span>
            <button className="chip danger" onClick={() => { setMode(null); void remove(summary.id) }}>Delete</button>
            <button className="chip ghost" onClick={() => setMode(null)}>Keep</button>
          </div>
        ) : (
          <>
            <div className="lib-card-title">
              <h3 onClick={() => void open(summary.id)}>{summary.name}</h3>
              <button className="icon lib-more" title="More" aria-label="More" onClick={() => setMode(mode === 'menu' ? null : 'menu')}>⋯</button>
            </div>
            <div className="lib-meta">{summary.w} × {summary.d} cm · {summary.itemCount} item{summary.itemCount === 1 ? '' : 's'}</div>
            <div className="lib-meta muted">edited {timeAgo(summary.updatedAt)}</div>
          </>
        )}
        {mode === 'menu' && (
          <div className="lib-menu" onMouseLeave={() => setMode(null)}>
            <button onClick={() => void open(summary.id)}>Open</button>
            <button onClick={startRename}>Rename</button>
            <button onClick={startGroup}>Move to group…</button>
            <button onClick={() => { setMode(null); void duplicate(summary.id) }}>Duplicate</button>
            <button onClick={() => { setMode(null); void exportDoc(summary.id) }}>Export JSON</button>
            <button className="danger" onClick={() => setMode('delete')}>Delete</button>
          </div>
        )}
      </div>
    </article>
  )
}

/** Loads the document behind a card (for its thumbnail); reloads when it was edited. */
function useDocPreview(id: string, updatedAt: string): Pick<RoomDoc, 'room' | 'items'> | null {
  const [doc, setDoc] = useState<{ room: Room; items: Item[] } | null>(null)
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const s = await getStorage()
        const raw = await s.load(id)
        const d = raw ? migrateDoc(raw) : null
        if (alive && d) setDoc({ room: d.room, items: d.items })
      } catch {
        /* thumbnail is optional */
      }
    })()
    return () => { alive = false }
  }, [id, updatedAt])
  return doc
}
