import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { create } from 'zustand'

/*
 * The draggable divider between the floor plan and the 3D scene, and the "focus" it snaps to.
 * The plan's share of the width is kept as a ratio in localStorage so it survives a reload.
 */

export const SPLIT_KEY = 'room-planner.split'
/** Plan ≈ 28% of the plan+scene width: about 320 px on a 1440 px window, as before. */
export const DEFAULT_RATIO = 0.28
/** "Focus 2D": the plan takes most of the width and its SVG scales up. */
export const FOCUS_2D_RATIO = 0.62
export const MIN_PLAN_PX = 260
export const MIN_SCENE_PX = 360
/** The divider's hit area is 8 px wide; with its margins it keeps the 12 px gap the panes had. */
const GAP_PX = 12

export type Focus = '2d' | '3d'

/** Which focus a ratio counts as: whichever snap point it is nearer to. */
export const focusOf = (ratio: number): Focus => (ratio >= (DEFAULT_RATIO + FOCUS_2D_RATIO) / 2 ? '2d' : '3d')

function loadRatio(): number {
  try {
    const v = parseFloat(localStorage.getItem(SPLIT_KEY) ?? '')
    if (Number.isFinite(v) && v >= 0.05 && v <= 0.95) return v
  } catch {
    /* private mode, no storage */
  }
  return DEFAULT_RATIO
}

function saveRatio(ratio: number) {
  try {
    localStorage.setItem(SPLIT_KEY, String(Math.round(ratio * 1000) / 1000))
  } catch {
    /* ignore */
  }
}

interface SplitState {
  ratio: number
  focus: Focus
  setRatio: (ratio: number) => void
  setFocus: (focus: Focus) => void
  toggleFocus: () => void
  reset: () => void
}

export const useSplit = create<SplitState>((set, get) => {
  const initial = loadRatio()
  return {
    ratio: initial,
    focus: focusOf(initial),
    setRatio: (r) => {
      const ratio = Math.min(0.95, Math.max(0.05, r))
      saveRatio(ratio)
      set({ ratio, focus: focusOf(ratio) })
    },
    setFocus: (focus) => get().setRatio(focus === '2d' ? FOCUS_2D_RATIO : DEFAULT_RATIO),
    toggleFocus: () => get().setFocus(get().focus === '2d' ? '3d' : '2d'),
    reset: () => get().setRatio(DEFAULT_RATIO),
  }
})

/** Keep the plan at least MIN_PLAN_PX and the scene at least MIN_SCENE_PX wide (focus.css enforces the same). */
function clampPlanPx(px: number, total: number) {
  const max = Math.max(MIN_PLAN_PX, total - GAP_PX - MIN_SCENE_PX)
  return Math.min(max, Math.max(MIN_PLAN_PX, px))
}

interface Props {
  left: ReactNode
  right: ReactNode
  leftClassName?: string
  rightClassName?: string
}

/**
 * Two panes side by side with a draggable divider. Drag to resize, double-click to reset,
 * arrow keys nudge it when the divider has focus.
 */
export function SplitPane({ left, right, leftClassName = '', rightClassName = '' }: Props) {
  const ratio = useSplit((s) => s.ratio)
  const setRatio = useSplit((s) => s.setRatio)
  const reset = useSplit((s) => s.reset)
  const ref = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)

  /** Ratio for a plan width in px, clamped to the pane minimums. */
  const ratioForPx = (px: number): number | null => {
    const box = ref.current?.getBoundingClientRect()
    if (!box || box.width <= 0) return null
    return clampPlanPx(px, box.width) / box.width
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragging(true)
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    const box = ref.current?.getBoundingClientRect()
    if (!box) return
    const r = ratioForPx(e.clientX - box.left - GAP_PX / 2)
    if (r !== null) setRatio(r)
  }
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    setDragging(false)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 0.1 : 0.02
    const box = ref.current?.getBoundingClientRect()
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      const next = ratio + (e.key === 'ArrowLeft' ? -step : step)
      const r = box ? ratioForPx(next * box.width) : null
      setRatio(r ?? next)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      reset()
    }
  }

  const pct = ratio * 100
  return (
    <div ref={ref} className={dragging ? 'split dragging' : 'split'}>
      <section className={`split-a ${leftClassName}`.trim()} style={{ width: `${pct}%` }}>{left}</section>
      <div
        className="split-divider"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the floor plan"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={5}
        aria-valuemax={95}
        tabIndex={0}
        title="Drag to resize · double-click to reset"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={reset}
        onKeyDown={onKeyDown}
      >
        <span className="split-handle" aria-hidden="true" />
      </div>
      <section className={`split-b ${rightClassName}`.trim()}>{right}</section>
    </div>
  )
}
