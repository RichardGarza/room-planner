import { create } from 'zustand'
import { defaultItems, defaultRoom, presetLayouts } from './data'
import { clamp, footprint, wallLength } from './geometry'
import type { Item, ItemPlacement, Layout, Room, Rot } from './types'

export type ViewMode = 'outside' | 'walk'
export type OutsideAngle = 'corner' | 'above' | 'window' | 'door'
export type WalkPreset = 'door' | 'window'

export interface WalkPose { x: number; y: number; yaw: number; pitch: number }

interface Settings {
  daytime: boolean
  doorAngle: number // degrees, 0..90
  blinds: number // 0..100 (% closed)
  bedding: boolean
  walkHeight: 'adult' | 'child'
  quality: 'best' | 'fast'
}

export interface NewItemSpec {
  name: string
  kind: Item['kind']
  w: number
  d: number
  h: number
  color: string
  note?: string
}

interface State extends Settings {
  room: Room
  items: Item[]
  selectedId: string | null
  activeLayoutId: string | null
  savedLayouts: Layout[]
  view: ViewMode
  outsideAngle: OutsideAngle
  walkPose: WalkPose
  history: Item[][]
  future: Item[][]

  select: (id: string | null) => void
  moveItem: (id: string, x: number, y: number) => void
  /** Drag helper: dropping below the room parks the item, dropping inside puts it back. */
  dragTo: (id: string, x: number, y: number) => void
  /** Push the current items onto the undo stack (call before a drag starts). */
  snapshot: () => void
  rotateItem: (id: string, delta: 90 | -90 | 180) => void
  resizeItem: (id: string, size: Partial<Pick<Item, 'w' | 'd' | 'h'>>) => void
  updateItem: (id: string, patch: Partial<Pick<Item, 'name' | 'color' | 'kind' | 'note'>>) => void
  /** Adds an item (at the given centre, else the room centre) and returns its id. */
  addItem: (spec: NewItemSpec, at?: { x: number; y: number }) => string
  removeItem: (id: string) => void
  toggleInRoom: (id: string) => void
  setRoom: (patch: Partial<Room>) => void
  applyLayout: (layout: Layout) => void
  saveLayout: (name: string) => void
  deleteLayout: (id: string) => void
  undo: () => void
  redo: () => void
  setView: (v: ViewMode) => void
  setOutsideAngle: (a: OutsideAngle) => void
  setWalkPose: (p: Partial<WalkPose>) => void
  walkTo: (preset: WalkPreset) => void
  setSetting: <K extends keyof Settings>(k: K, v: Settings[K]) => void
  shareUrl: () => string
}

const SAVED_KEY = 'room-planner.savedLayouts'

function loadSaved(): Layout[] {
  try {
    const raw = localStorage.getItem(SAVED_KEY)
    return raw ? (JSON.parse(raw) as Layout[]) : []
  } catch {
    return []
  }
}

function persistSaved(layouts: Layout[]) {
  try { localStorage.setItem(SAVED_KEY, JSON.stringify(layouts)) } catch { /* ignore */ }
}

function applyPlacements(items: Item[], placements: Record<string, ItemPlacement>): Item[] {
  return items.map((it) => (placements[it.id] ? { ...it, ...placements[it.id] } : it))
}

/** Items that are out of the room sit in a parking strip below the plan. */
export const PARK_Y = 90
export function park(room: Room, items: Item[]): Item[] {
  let slot = 0
  return items.map((it) => {
    if (it.inRoom) return it
    if (it.y > room.d + 15) return it
    const { fw } = footprint(it)
    const x = 20 + slot * 70 + fw / 2
    slot += 1
    return { ...it, x, y: room.d + PARK_Y }
  })
}

function placementsOf(items: Item[]): Record<string, ItemPlacement> {
  return Object.fromEntries(items.map((i) => [i.id, { x: i.x, y: i.y, rot: i.rot, inRoom: i.inRoom }]))
}

function clampToRoom(room: Room, item: Item, x: number, y: number) {
  const { fw, fd } = footprint(item)
  return { x: clamp(x, fw / 2, room.w - fw / 2), y: clamp(y, fd / 2, room.d - fd / 2) }
}

function fitAll(room: Room, items: Item[]): Item[] {
  return park(room, items.map((i) => (i.inRoom ? { ...i, ...clampToRoom(room, i, i.x, i.y) } : i)))
}

/** Keep openings on their wall after the room or the opening changes. */
function sanitizeRoom(room: Room): Room {
  const w = clamp(Math.round(room.w), 150, 1200)
  const d = clamp(Math.round(room.d), 150, 1200)
  const h = clamp(Math.round(room.h), 200, 400)
  const r = { ...room, w, d, h }
  const fixOpening = <T extends { wall: Room['window']['wall']; offset: number; width: number }>(o: T): T => {
    const len = wallLength(r, o.wall)
    const width = clamp(Math.round(o.width), 30, len)
    return { ...o, width, offset: clamp(Math.round(o.offset), 0, len - width) }
  }
  const window = fixOpening(r.window)
  const winH = clamp(Math.round(window.height), 30, h - 10)
  const door = fixOpening(r.door)
  return {
    ...r,
    window: { ...window, height: winH, sill: clamp(Math.round(window.sill), 0, h - winH) },
    door: { ...door, height: clamp(Math.round(door.height), 150, h - 5), sill: 0 },
    radiator: fixOpening(r.radiator),
  }
}

function walkStart(room: Room, preset: WalkPreset): WalkPose {
  // stand just inside the opening, facing away from it
  const o = preset === 'door' ? room.door : room.window
  const t = o.offset + o.width / 2
  // stand past the swing of the door leaf so it is not filling the view
  const inset = preset === 'door' ? Math.min(o.width + 20, room.d / 3) : 45
  switch (o.wall) {
    case 'top': return { x: t, y: inset, yaw: Math.PI, pitch: -0.05 }
    case 'bottom': return { x: t, y: room.d - inset, yaw: 0, pitch: -0.05 }
    case 'left': return { x: inset, y: t, yaw: -Math.PI / 2, pitch: -0.05 }
    case 'right': return { x: room.w - inset, y: t, yaw: Math.PI / 2, pitch: -0.05 }
  }
}

/* ---------- URL sharing ---------- */
interface Shared { room: Room; items: Item[]; s: Partial<Settings> }

function readHash(): Shared | null {
  try {
    const h = location.hash.replace(/^#/, '')
    if (!h) return null
    const parsed = JSON.parse(decodeURIComponent(atob(h))) as Shared
    if (!parsed.room || !Array.isArray(parsed.items)) return null
    return parsed
  } catch {
    return null
  }
}

function initialState(): { room: Room; items: Item[]; layoutId: string | null; settings: Partial<Settings> } {
  const shared = readHash()
  const A = presetLayouts[0]
  if (!shared) return { room: defaultRoom, items: park(defaultRoom, applyPlacements(defaultItems, A.placements)), layoutId: A.id, settings: {} }
  const room = sanitizeRoom({ ...defaultRoom, ...shared.room })
  return { room, items: fitAll(room, shared.items), layoutId: null, settings: shared.s ?? {} }
}

const init = initialState()

const pushHistory = (s: State) => ({ history: [...s.history.slice(-49), s.items], future: [] as Item[][] })

export const useStore = create<State>((set, get) => ({
  room: init.room,
  items: init.items,
  selectedId: null,
  activeLayoutId: init.layoutId,
  savedLayouts: loadSaved(),
  view: 'outside',
  outsideAngle: 'corner',
  walkPose: walkStart(init.room, 'door'),
  history: [],
  future: [],
  daytime: true,
  doorAngle: 70,
  blinds: 40,
  bedding: true,
  walkHeight: 'adult',
  quality: 'best',
  ...init.settings,

  select: (id) => set({ selectedId: id }),

  moveItem: (id, x, y) =>
    set((s) => {
      const it = s.items.find((i) => i.id === id)
      if (!it) return s
      const pos = it.inRoom ? clampToRoom(s.room, it, x, y) : { x, y }
      const items = s.items.map((i) => (i.id === id ? { ...i, x: Math.round(pos.x), y: Math.round(pos.y) } : i))
      return { items, activeLayoutId: null }
    }),

  dragTo: (id, x, y) =>
    set((s) => {
      const it = s.items.find((i) => i.id === id)
      if (!it) return s
      const inRoom = y <= s.room.d + 15
      const pos = inRoom ? clampToRoom(s.room, it, x, y) : { x: clamp(x, 0, s.room.w), y: clamp(y, s.room.d + 30, s.room.d + 150) }
      const items = s.items.map((i) => (i.id === id ? { ...i, inRoom, x: Math.round(pos.x), y: Math.round(pos.y) } : i))
      return { items, activeLayoutId: null }
    }),

  snapshot: () => set((s) => pushHistory(s)),

  rotateItem: (id, delta) =>
    set((s) => {
      const items = s.items.map((i) => {
        if (i.id !== id) return i
        const rot = (((i.rot + delta) % 360) + 360) % 360 as Rot
        const next = { ...i, rot }
        return { ...next, ...(i.inRoom ? clampToRoom(s.room, next, i.x, i.y) : {}) }
      })
      return { items, activeLayoutId: null, ...pushHistory(s) }
    }),

  resizeItem: (id, size) =>
    set((s) => {
      const items = s.items.map((i) => {
        if (i.id !== id) return i
        const next = { ...i, ...size }
        return { ...next, ...(i.inRoom ? clampToRoom(s.room, next, i.x, i.y) : {}) }
      })
      return { items, activeLayoutId: null, ...pushHistory(s) }
    }),

  updateItem: (id, patch) =>
    set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)), activeLayoutId: null, ...pushHistory(s) })),

  addItem: (spec, at) => {
    const id = `item-${Math.random().toString(36).slice(2, 8)}`
    set((s) => {
      const item: Item = {
        id,
        name: spec.name.trim() || 'New item',
        kind: spec.kind,
        w: clamp(Math.round(spec.w) || 60, 5, 600),
        d: clamp(Math.round(spec.d) || 60, 5, 600),
        h: clamp(Math.round(spec.h) || 60, 1, 400),
        x: at?.x ?? s.room.w / 2,
        y: at?.y ?? s.room.d / 2,
        rot: 0,
        color: spec.color,
        inRoom: true,
        note: spec.note,
      }
      const placed = { ...item, ...clampToRoom(s.room, item, item.x, item.y) }
      return { items: [...s.items, placed], selectedId: id, activeLayoutId: null, ...pushHistory(s) }
    })
    return id
  },

  removeItem: (id) =>
    set((s) => ({ items: s.items.filter((i) => i.id !== id), selectedId: s.selectedId === id ? null : s.selectedId, activeLayoutId: null, ...pushHistory(s) })),

  toggleInRoom: (id) =>
    set((s) => {
      const items = s.items.map((i) => {
        if (i.id !== id) return i
        const inRoom = !i.inRoom
        const next = { ...i, inRoom }
        return inRoom ? { ...next, ...clampToRoom(s.room, next, i.x, Math.min(i.y, s.room.d)) } : next
      })
      return { items: park(s.room, items), activeLayoutId: null, ...pushHistory(s) }
    }),

  setRoom: (patch) =>
    set((s) => {
      const room = sanitizeRoom({ ...s.room, ...patch })
      return { room, items: fitAll(room, s.items), activeLayoutId: null, walkPose: walkStart(room, 'door') }
    }),

  applyLayout: (layout) =>
    set((s) => ({
      items: layout.items ? fitAll(s.room, layout.items) : park(s.room, applyPlacements(s.items, layout.placements)),
      activeLayoutId: layout.id,
      selectedId: null,
      ...pushHistory(s),
    })),

  saveLayout: (name) =>
    set((s) => {
      const id = `saved-${Date.now()}`
      const layout: Layout = {
        id,
        name: name.trim() || `Layout ${s.savedLayouts.length + 1}`,
        description: 'Saved by you.',
        placements: placementsOf(s.items),
        items: s.items.map((i) => ({ ...i })),
      }
      const savedLayouts = [...s.savedLayouts, layout]
      persistSaved(savedLayouts)
      return { savedLayouts, activeLayoutId: id }
    }),

  deleteLayout: (id) =>
    set((s) => {
      const savedLayouts = s.savedLayouts.filter((l) => l.id !== id)
      persistSaved(savedLayouts)
      return { savedLayouts, activeLayoutId: s.activeLayoutId === id ? null : s.activeLayoutId }
    }),

  undo: () =>
    set((s) => {
      const prev = s.history[s.history.length - 1]
      if (!prev) return s
      return { items: prev, history: s.history.slice(0, -1), future: [s.items, ...s.future], activeLayoutId: null }
    }),

  redo: () =>
    set((s) => {
      const next = s.future[0]
      if (!next) return s
      return { items: next, future: s.future.slice(1), history: [...s.history, s.items], activeLayoutId: null }
    }),

  setView: (view) => set({ view }),
  setOutsideAngle: (outsideAngle) => set({ outsideAngle, view: 'outside' }),
  setWalkPose: (p) => set((s) => ({ walkPose: { ...s.walkPose, ...p } })),
  walkTo: (preset) => set((s) => ({ walkPose: walkStart(s.room, preset), view: 'walk' })),
  setSetting: (k, v) => set({ [k]: v } as Pick<Settings, typeof k>),

  shareUrl: () => {
    const s = get()
    const shared: Shared = {
      room: s.room,
      items: s.items,
      s: { daytime: s.daytime, doorAngle: s.doorAngle, blinds: s.blinds, bedding: s.bedding, walkHeight: s.walkHeight },
    }
    const hash = btoa(encodeURIComponent(JSON.stringify(shared)))
    return `${location.origin}${location.pathname}#${hash}`
  },
}))
