import { useState } from 'react'
import { presetLayouts } from '../data'
import { useStore } from '../store'

export function TopBar() {
  const room = useStore((s) => s.room)
  const activeLayoutId = useStore((s) => s.activeLayoutId)
  const applyLayout = useStore((s) => s.applyLayout)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)
  const canUndo = useStore((s) => s.history.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  const shareUrl = useStore((s) => s.shareUrl)
  const [toast, setToast] = useState<string | null>(null)
  const [help, setHelp] = useState(false)

  const share = async () => {
    const url = shareUrl()
    history.replaceState(null, '', url)
    try {
      await navigator.clipboard.writeText(url)
      setToast('Link copied')
    } catch {
      setToast('Link is in the address bar')
    }
    setTimeout(() => setToast(null), 1800)
  }

  return (
    <header className="topbar">
      <div className="brand">
        <span className="logo">R</span>
        <div>
          <div className="room-name">{room.name}</div>
          <div className="room-sub">{room.w} × {room.d} cm · {room.subtitle}</div>
        </div>
      </div>
      <nav className="tabs">
        {presetLayouts.map((l) => (
          <button key={l.id} className={`tab${l.id === activeLayoutId ? ' on' : ''}`} onClick={() => applyLayout(l)}>
            {l.name}
            {l.recommended && <span className="badge">Recommended</span>}
          </button>
        ))}
      </nav>
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
              <li>Share copies a link that holds your exact layout.</li>
            </ul>
          </div>
        )}
      </div>
    </header>
  )
}
