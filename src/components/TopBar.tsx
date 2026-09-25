import { useEffect, useState } from 'react'
import { presetLayouts } from '../data'
import { useLibrary } from '../library'
import { useStore } from '../store'

export function TopBar() {
  const room = useStore((s) => s.room)
  const items = useStore((s) => s.items)
  const savedLayouts = useStore((s) => s.savedLayouts)
  const activeLayoutId = useStore((s) => s.activeLayoutId)
  const applyLayout = useStore((s) => s.applyLayout)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)
  const canUndo = useStore((s) => s.history.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  const shareUrl = useStore((s) => s.shareUrl)
  const currentId = useLibrary((s) => s.currentId)
  const summary = useLibrary((s) => s.rooms.find((r) => r.id === s.currentId))
  const status = useLibrary((s) => s.status)
  const error = useLibrary((s) => s.error)
  const close = useLibrary((s) => s.close)
  const rename = useLibrary((s) => s.rename)
  const [toast, setToast] = useState<string | null>(null)
  const [help, setHelp] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(room.name)

  useEffect(() => { if (!editing) setDraft(room.name) }, [room.name, editing])

  // The A/B/C/Now presets describe Mila's furniture; other rooms flip between their own saved versions.
  const isExample = items.some((i) => i.id in presetLayouts[0].placements)
  const tabs = isExample ? presetLayouts : savedLayouts

  const commitName = () => {
    setEditing(false)
    const n = draft.trim()
    if (currentId && n && n !== room.name) void rename(currentId, n)
  }

  const share = async () => {
    const url = shareUrl()
    try {
      await navigator.clipboard.writeText(url)
      setToast('Link copied')
    } catch {
      history.replaceState(null, '', url)
      setToast('Link is in the address bar')
    }
    setTimeout(() => setToast(null), 1800)
  }

  const saveText =
    status === 'saving' ? 'Saving…'
    : status === 'dirty' ? 'Unsaved changes'
    : status === 'error' ? (error ?? 'Could not save')
    : 'Saved'

  return (
    <header className="topbar">
      <div className="brand">
        <button className="back" onClick={() => void close()} title="Back to your rooms">‹ Rooms</button>
        <span className="logo">R</span>
        <div>
          <div className="room-name-row">
            {editing ? (
              <input
                className="room-name-input"
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitName}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitName()
                  if (e.key === 'Escape') { setDraft(room.name); setEditing(false) }
                }}
                aria-label="Room name"
              />
            ) : (
              <div className="room-name editable" title="Click to rename" onClick={() => setEditing(true)}>{room.name}</div>
            )}
            {summary?.group && <span className="group-chip">{summary.group}</span>}
          </div>
          <div className="room-sub">{room.w} × {room.d} cm{room.subtitle ? ` · ${room.subtitle}` : ''}</div>
        </div>
      </div>
      <div className="tabs-wrap">
        <nav className="tabs">
          {tabs.length === 0 ? (
            <span className="tab empty">Save a layout in the sidebar to flip between versions</span>
          ) : (
            tabs.map((l) => (
              <button key={l.id} className={`tab${l.id === activeLayoutId ? ' on' : ''}`} onClick={() => applyLayout(l)}>
                {l.name}
                {l.recommended && <span className="badge">Recommended</span>}
              </button>
            ))
          )}
        </nav>
        <span className={`save-state ${status}`} title={error ?? undefined}>{saveText}</span>
      </div>
      <div className="actions">
        <button className="icon" onClick={undo} disabled={!canUndo} title="Undo (⌘Z)">↶</button>
        <button className="icon" onClick={redo} disabled={!canRedo} title="Redo (⇧⌘Z)">↷</button>
        <button className="share" onClick={share}>⇪ Share</button>
        <button className="icon" onClick={() => setHelp((h) => !h)} title="Help">?</button>
        {toast && <span className="toast">{toast}</span>}
        {help && (
          <div className="help" onClick={() => setHelp(false)}>
            <b>How to use</b>
            <ul>
              <li>Drag furniture on the plan or in the 3D view.</li>
              <li><kbd>R</kbd> rotates the selected item, <kbd>⇧R</kbd> the other way.</li>
              <li><kbd>⌫</kbd> takes it out of the room, <kbd>Esc</kbd> deselects.</li>
              <li>Walk mode: drag to look around, <kbd>W A S D</kbd> or arrows to move.</li>
              <li>Changes save by themselves; <kbd>⌘S</kbd> saves right away.</li>
              <li>Share copies a link that holds your exact layout.</li>
            </ul>
          </div>
        )}
      </div>
    </header>
  )
}
