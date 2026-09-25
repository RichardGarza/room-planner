import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { presetLayouts } from '../data'
import { useLibrary } from '../library'
import { useStore } from '../store'
import type { Layout } from '../types'
import './suggest.css'

const HINT_KEY = 'room-planner.hint.suggestions'

function hintDismissed() {
  try { return localStorage.getItem(HINT_KEY) === '1' } catch { return false }
}

export function TopBar() {
  const room = useStore((s) => s.room)
  const items = useStore((s) => s.items)
  const savedLayouts = useStore((s) => s.savedLayouts)
  const suggestions = useStore((s) => s.suggestions)
  const suggestionsStale = useStore((s) => s.suggestionsStale)
  const generateSuggestions = useStore((s) => s.generateSuggestions)
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
  const [thinking, setThinking] = useState(false)
  const [noResult, setNoResult] = useState(false)
  const [showHint, setShowHint] = useState(() => !hintDismissed())
  const [arrowLeft, setArrowLeft] = useState<number | null>(null)
  const labelRef = useRef<HTMLSpanElement>(null)
  const hintRef = useRef<HTMLDivElement>(null)

  useEffect(() => { if (!editing) setDraft(room.name) }, [room.name, editing])

  // The A/B/C/Now presets describe Mila's furniture; other rooms get suggestions worked out from their own pieces.
  const isExample = items.some((i) => i.id in presetLayouts[0].placements)
  const suggested: Layout[] = isExample ? presetLayouts : suggestions
  // the example room's document carries the presets as its own layouts: do not list them twice
  const yours = savedLayouts.filter((l) => !suggested.some((s) => s.id === l.id))

  // keep the hint's arrow under the "Suggested layouts" label
  useLayoutEffect(() => {
    if (!showHint) return
    const place = () => {
      const l = labelRef.current?.getBoundingClientRect()
      const h = hintRef.current?.getBoundingClientRect()
      if (l && h) setArrowLeft(l.left + l.width / 2 - h.left)
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [showHint, suggested.length, yours.length, thinking])

  const dismissHint = () => {
    setShowHint(false)
    try { localStorage.setItem(HINT_KEY, '1') } catch { /* private mode: the hint just comes back next time */ }
  }

  const suggest = () => {
    if (thinking) return
    setThinking(true)
    setNoResult(false)
    // synchronous, but let the "Thinking…" label paint first
    setTimeout(() => {
      generateSuggestions()
      setNoResult(useStore.getState().suggestions.length === 0)
      setThinking(false)
    }, 30)
  }

  const tab = (l: Layout) => (
    <button key={l.id} className={`tab${l.id === activeLayoutId ? ' on' : ''}`} title={`${l.name} — ${l.description}`} onClick={() => applyLayout(l)}>
      <span className="tab-text">{l.name}</span>
      {l.recommended && <span className="badge">Recommended</span>}
    </button>
  )

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
    <>
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
        <div className="tab-groups">
          <div className="tab-group">
            <span ref={labelRef} className="tab-label suggested" title="Ready-made arrangements of your furniture — click one, then tweak it">✨ Suggested layouts</span>
            <nav className="tabs">
              {suggested.length > 0 ? (
                <>
                  {suggested.map(tab)}
                  {!isExample && suggestionsStale && (
                    <button className="tab refresh" onClick={suggest} disabled={thinking} title="The furniture or the room changed — work out fresh suggestions">
                      {thinking ? 'Thinking…' : '↻ Refresh'}
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button className="tab suggest-btn" onClick={suggest} disabled={thinking || items.length === 0} title={items.length === 0 ? 'Add some furniture first' : 'Work out a few good arrangements of your furniture'}>
                    {thinking ? 'Thinking…' : '✨ Suggest layouts'}
                  </button>
                  {noResult && <span className="tab empty">Add a bed or another big piece first</span>}
                </>
              )}
            </nav>
          </div>
          <span className="tab-divider" aria-hidden="true" />
          <div className="tab-group">
            <span className="tab-label">Your layouts</span>
            <nav className="tabs">
              {yours.length === 0 ? (
                <span className="tab empty" title="Arrange the room, then save it under “My layouts” in the sidebar">None saved yet</span>
              ) : (
                yours.map(tab)
              )}
            </nav>
          </div>
        </div>
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
              <li><kbd>F</kbd> toggles 2D / 3D focus; drag the divider for any split.</li>
              <li>Changes save by themselves; <kbd>⌘S</kbd> saves right away.</li>
              <li>Share copies a link that holds your exact layout.</li>
            </ul>
          </div>
        )}
      </div>
    </header>
    {showHint && (
      <div ref={hintRef} className="suggest-hint" role="note">
        {arrowLeft !== null && <i className="suggest-hint-arrow" style={{ left: arrowLeft }} />}
        <span className="suggest-hint-text">
          {suggested.length > 0
            ? 'New here? Those are suggested layouts — we placed your furniture three ways. Click one, then drag things around.'
            : 'New here? ✨ Suggest layouts places your furniture a few good ways. Click it, pick one, then drag things around.'}
        </span>
        <button className="suggest-hint-close" onClick={dismissHint}>Got it</button>
      </div>
    )}
    </>
  )
}
