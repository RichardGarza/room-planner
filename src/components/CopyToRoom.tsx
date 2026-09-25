import { useEffect, useMemo, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { create } from 'zustand'
import { useLibrary, type CopyMode, type CopyResult } from '../library'
import type { Item, RoomSummary } from '../types'
import './copy.css'

/*
 * "Copy to another room…" in the selection card: an inline panel that picks one of the other
 * saved rooms, copies or moves the selected item there, and then reports where it landed.
 */

const TOAST_MS = 6000
const NO_GROUP = 'No group'

interface Toast extends CopyResult {
  mode: CopyMode
  targetId: string
  key: number
}

/*
 * The "Copied to…" toast outlives the selection card (a move deselects the item, which unmounts the
 * card), so it lives in a tiny store: the card shows it inline while mounted, otherwise a floating
 * host at the bottom right of the window does.
 */
interface ToastState {
  toast: Toast | null
  /** how many inline hosts are mounted; the floating host only shows when this is 0 */
  inline: number
  show: (t: Omit<Toast, 'key'>) => void
  hide: () => void
  mount: (delta: number) => void
}

let timer: ReturnType<typeof setTimeout> | null = null

export const useCopyToast = create<ToastState>((set) => ({
  toast: null,
  inline: 0,
  show: (t) => {
    if (timer) clearTimeout(timer)
    set({ toast: { ...t, key: Date.now() } })
    timer = setTimeout(() => { timer = null; set({ toast: null }) }, TOAST_MS)
    ensureFloatingHost()
  },
  hide: () => {
    if (timer) clearTimeout(timer)
    timer = null
    set({ toast: null })
  },
  mount: (delta) => set((s) => ({ inline: s.inline + delta })),
}))

let floating: Root | null = null
function ensureFloatingHost() {
  if (floating || typeof document === 'undefined') return
  const el = document.createElement('div')
  el.className = 'copy-toast-host'
  document.body.appendChild(el)
  floating = createRoot(el)
  floating.render(<FloatingToast />)
}

function FloatingToast() {
  const toast = useCopyToast((s) => s.toast)
  const inline = useCopyToast((s) => s.inline)
  if (!toast || inline > 0) return null
  return (
    <div className="copy-toast floating" role="status" key={toast.key}>
      <ToastBody toast={toast} />
    </div>
  )
}

function ToastBody({ toast }: { toast: Toast }) {
  const hide = useCopyToast((s) => s.hide)
  const verb = toast.mode === 'move' ? 'Moved' : 'Copied'
  const outcome = toast.placed
    ? `placed ${toast.where ?? 'on a free spot'}`
    : 'it did not fit, so it is parked beside the plan'
  const openTarget = async () => {
    hide()
    const lib = useLibrary.getState()
    await lib.close() // flushes the autosave of the room we are leaving
    await lib.open(toast.targetId)
  }
  return (
    <>
      <span className="copy-toast-text">
        {verb} to <b>{toast.targetName}</b> — {outcome}.
      </span>
      <button className="copy-toast-link" onClick={() => void openTarget()}>Open {toast.targetName}</button>
      <button className="x" onClick={hide} title="Dismiss" aria-label="Dismiss">×</button>
    </>
  )
}

interface Section { name: string; rooms: RoomSummary[] }

/** The other rooms by group (alphabetical, ungrouped last), newest first inside a group — as the library lists them. */
function groupRooms(rooms: RoomSummary[]): Section[] {
  const byGroup = new Map<string, RoomSummary[]>()
  for (const r of rooms) {
    const key = r.group || NO_GROUP
    byGroup.set(key, [...(byGroup.get(key) ?? []), r])
  }
  const names = [...byGroup.keys()].filter((g) => g !== NO_GROUP).sort((a, b) => a.localeCompare(b))
  if (byGroup.has(NO_GROUP)) names.push(NO_GROUP)
  return names.map((name) => ({
    name,
    rooms: (byGroup.get(name) ?? []).slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  }))
}

export function CopyToRoom({ item }: { item: Item }) {
  const rooms = useLibrary((s) => s.rooms)
  const currentId = useLibrary((s) => s.currentId)
  const copyItemToRoom = useLibrary((s) => s.copyItemToRoom)
  const toast = useCopyToast((s) => s.toast)
  const mount = useCopyToast((s) => s.mount)
  const show = useCopyToast((s) => s.show)
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<CopyMode>('copy')
  const [picked, setPicked] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // while this is mounted the toast shows here, not in the floating host
  useEffect(() => {
    mount(1)
    return () => mount(-1)
  }, [mount])

  // the card is reused when another item is selected: close the panel for the new one
  const [prevId, setPrevId] = useState(item.id)
  if (prevId !== item.id) {
    setPrevId(item.id)
    setOpen(false)
    setError(null)
  }

  const sections = useMemo(() => groupRooms(rooms.filter((r) => r.id !== currentId)), [rooms, currentId])
  const none = sections.length === 0
  const targetId = sections.some((g) => g.rooms.some((r) => r.id === picked)) ? picked : (sections[0]?.rooms[0]?.id ?? '')

  const go = async () => {
    if (!targetId || busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await copyItemToRoom(item.id, targetId, mode)
      show({ ...result, mode, targetId })
      setOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        className="chip ghost copy-btn"
        disabled={none}
        title={none ? 'Save another room first' : undefined}
        aria-expanded={open}
        onClick={() => { setOpen((o) => !o); setError(null) }}
      >
        Copy to another room…
      </button>
      {none && <span className="copy-hint muted small">no other rooms yet</span>}
      {open && !none && (
        <div className="copy-panel">
          <label className="field">
            Room
            <select value={targetId} onChange={(e) => setPicked(e.target.value)} aria-label="Room to copy to">
              {sections.map((g) => (
                <optgroup key={g.name} label={g.name}>
                  {g.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          <div className="copy-actions">
            <div className="seg sub" role="group" aria-label="Copy or move">
              <button className={mode === 'copy' ? 'on' : ''} aria-pressed={mode === 'copy'} onClick={() => setMode('copy')}>Copy</button>
              <button className={mode === 'move' ? 'on' : ''} aria-pressed={mode === 'move'} onClick={() => setMode('move')}>Move</button>
            </div>
            <button className="chip solid copy-btn" disabled={busy} onClick={() => void go()}>{busy ? 'Working…' : 'Go'}</button>
            <button className="chip ghost" onClick={() => setOpen(false)}>Cancel</button>
          </div>
          {error && <p className="copy-error" role="alert">{error}</p>}
        </div>
      )}
      {toast && (
        <div className="copy-toast" role="status" key={toast.key}>
          <ToastBody toast={toast} />
        </div>
      )}
    </>
  )
}
