import { create } from 'zustand'
import { defaultItems, defaultRoom, makeEmptyRoom, presetLayouts } from './data'
import { migrateDoc } from './migrate'
import { getStorage, summarize, type RoomStorage } from './storage'
import { useStore } from './store'
import type { Door, Item, Opening, Room, RoomDoc, RoomSummary } from './types'

/*
 * The room library: a list of saved room documents (one per real room or
 * renovation idea), which one is open in the planner, and autosave while it is.
 */

export type LibraryStatus = 'idle' | 'loading' | 'saved' | 'saving' | 'dirty' | 'error'

export interface CreateInput {
  name: string
  group?: string
  w?: number
  d?: number
  h?: number
  /** start from Mila's example room instead of an empty one */
  fromExample?: boolean
}

interface LibraryState {
  rooms: RoomSummary[]
  /** distinct non-empty group names, sorted */
  groups: string[]
  currentId: string | null
  status: LibraryStatus
  error: string | null
  /** human-readable place where the rooms are kept, from the storage backend */
  location: string

  /** Test hook / override: use a different storage backend. */
  configure: (opts: { storage?: RoomStorage | null }) => void
  /** First call on app start: refresh the list, seed the example, open a shared link. */
  start: () => Promise<void>
  refresh: () => Promise<void>
  create: (input: CreateInput) => Promise<string>
  open: (id: string) => Promise<void>
  close: () => Promise<void>
  duplicate: (id: string) => Promise<string | null>
  rename: (id: string, name: string) => Promise<void>
  setGroup: (id: string, group: string) => Promise<void>
  setNotes: (id: string, notes: string) => Promise<void>
  remove: (id: string) => Promise<void>
  exportDoc: (id: string) => Promise<void>
  importDoc: () => Promise<string | null>
  saveNow: () => Promise<void>
}

export const SEEDED_KEY = 'room-planner.seeded'
export const AUTOSAVE_MS = 700

/* ---------- helpers ---------- */

export const newId = () => `room-${Math.random().toString(36).slice(2, 10)}`
const now = () => new Date().toISOString()

let storageOverride: RoomStorage | null = null
function storage(): Promise<RoomStorage> {
  return storageOverride ? Promise.resolve(storageOverride) : getStorage()
}

function flagGet(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
function flagSet(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* private mode etc. */ }
}

function groupsOf(rooms: RoomSummary[]): string[] {
  return [...new Set(rooms.map((r) => r.group).filter(Boolean))].sort((a, b) => a.localeCompare(b))
}

function applyPlacements(items: Item[], placements: Record<string, Partial<Item>>): Item[] {
  return items.map((it) => (placements[it.id] ? { ...it, ...placements[it.id] } : it))
}

/** Mila's room with layout A applied, as a fresh document. */
export function exampleDoc(name = defaultRoom.name, group = 'Examples'): RoomDoc {
  const ts = now()
  return migrateDoc({
    id: newId(),
    name,
    group,
    notes: '',
    createdAt: ts,
    updatedAt: ts,
    room: { ...defaultRoom, name },
    items: applyPlacements(defaultItems, presetLayouts[0].placements).map((i) => ({ ...i })),
    layouts: presetLayouts.map((l) => ({ ...l, placements: { ...l.placements } })),
  })!
}

function emptyDoc(input: CreateInput): RoomDoc {
  const ts = now()
  return migrateDoc({
    id: newId(),
    name: input.name,
    group: input.group ?? '',
    notes: '',
    createdAt: ts,
    updatedAt: ts,
    room: makeEmptyRoom(input.name, input.w ?? 300, input.d ?? 400, input.h ?? 260),
    items: [],
    layouts: [],
  })!
}

/**
 * Openings of a room regardless of whether it stores them as single fields
 * (window/door/radiator) or as arrays (windows/doors/radiators).
 */
export function roomOpenings(room: Room): { windows: Opening[]; doors: Door[] } {
  const r = room as Room & { windows?: Opening[]; doors?: Door[] }
  const windows = Array.isArray(r.windows) ? r.windows : r.window ? [r.window] : []
  const doors = Array.isArray(r.doors) ? r.doors : r.door ? [r.door] : []
  return { windows, doors }
}

/** The shape a Share link carries in the URL hash (same as store.ts shareUrl). */
interface Shared { room: Room; items: Item[]; s?: Partial<RoomDoc['settings']> }

export function decodeShareHash(hash: string): Shared | null {
  try {
    const h = hash.replace(/^#/, '')
    if (!h) return null
    const parsed = JSON.parse(decodeURIComponent(atob(h))) as Shared
    if (!parsed || !parsed.room || !Array.isArray(parsed.items)) return null
    return parsed
  } catch {
    return null
  }
}

/** Relative time for the library cards, e.g. "just now", "3 hours ago", "2 days ago". */
export function timeAgo(iso: string, from = Date.now()): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const s = Math.max(0, Math.round((from - t) / 1000))
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`
  const d = Math.round(h / 24)
  if (d < 30) return `${d} day${d === 1 ? '' : 's'} ago`
  const mo = Math.round(d / 30)
  if (mo < 12) return `${mo} month${mo === 1 ? '' : 's'} ago`
  const y = Math.round(d / 365)
  return `${y} year${y === 1 ? '' : 's'} ago`
}

/* ---------- autosave plumbing (module-level, one open room at a time) ---------- */

/** Metadata of the open document; the planner store holds room/items/layouts/settings. */
let current: Omit<RoomDoc, 'room' | 'items' | 'layouts' | 'settings'> | null = null
let unsubscribe: (() => void) | null = null
let timer: ReturnType<typeof setTimeout> | null = null
/** bumps on every change; a save only reports "saved" if nothing changed meanwhile */
let changeSeq = 0
let inFlight: Promise<void> | null = null
/** start() runs once even if React mounts the app twice (StrictMode) */
let started: Promise<void> | null = null

function clearTimer() {
  if (timer) clearTimeout(timer)
  timer = null
}

function buildDoc(): RoomDoc | null {
  if (!current) return null
  return { ...current, ...useStore.getState().docState(), updatedAt: now() }
}

function errorText(e: unknown) {
  return e instanceof Error ? e.message : String(e)
}

export const useLibrary = create<LibraryState>((set, get) => {
  const setRooms = (rooms: RoomSummary[]) => set({ rooms, groups: groupsOf(rooms) })

  const patchSummary = (id: string, patch: Partial<RoomSummary>) =>
    setRooms(get().rooms.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  const upsertSummary = (doc: RoomDoc) =>
    setRooms([...get().rooms.filter((r) => r.id !== doc.id), summarize(doc)])

  /** Save the open document right now. Serialised so two saves never overlap. */
  const flush = async (): Promise<void> => {
    clearTimer()
    if (inFlight) await inFlight
    const doc = buildDoc()
    if (!doc || !current) return
    const seq = changeSeq
    set({ status: 'saving', error: null })
    const p = (async () => {
      try {
        const s = await storage()
        await s.save(doc)
        if (current && current.id === doc.id) {
          current = { ...current, updatedAt: doc.updatedAt }
          upsertSummary(doc)
          if (changeSeq === seq) set({ status: 'saved', error: null })
        }
      } catch (e) {
        set({ status: 'error', error: `Could not save: ${errorText(e)}` })
      }
    })()
    inFlight = p
    await p
    if (inFlight === p) inFlight = null
  }

  const markDirty = () => {
    changeSeq += 1
    set({ status: 'dirty' })
    clearTimer()
    timer = setTimeout(() => { void flush() }, AUTOSAVE_MS)
  }

  const watchPlanner = () => {
    unsubscribe?.()
    unsubscribe = useStore.subscribe((s, prev) => {
      if (
        s.room !== prev.room ||
        s.items !== prev.items ||
        s.savedLayouts !== prev.savedLayouts ||
        s.daytime !== prev.daytime ||
        s.doorAngle !== prev.doorAngle ||
        s.blinds !== prev.blinds ||
        s.bedding !== prev.bedding ||
        s.walkHeight !== prev.walkHeight ||
        s.quality !== prev.quality
      ) {
        markDirty()
      }
    })
  }

  const openDoc = (doc: RoomDoc) => {
    unsubscribe?.()
    unsubscribe = null
    clearTimer()
    const { room: _room, items: _items, layouts: _layouts, settings: _settings, ...meta } = doc
    current = meta
    useStore.getState().hydrate(doc)
    watchPlanner()
    set({ currentId: doc.id, status: 'saved', error: null })
  }

  const loadDoc = async (id: string): Promise<RoomDoc | null> => {
    if (current && current.id === id) return buildDoc()
    const s = await storage()
    const raw = await s.load(id)
    return raw ? migrateDoc(raw) : null
  }

  /** A Share link in the URL becomes a document of its own, then the hash is cleared. */
  const openShared = async () => {
    if (typeof location === 'undefined') return
    const shared = decodeShareHash(location.hash)
    if (!shared) return
    const ts = now()
    const doc = migrateDoc({
      id: newId(),
      name: 'Shared room',
      group: 'Shared',
      createdAt: ts,
      updatedAt: ts,
      room: shared.room,
      items: shared.items,
      layouts: [],
      settings: shared.s ?? {},
    })
    if (!doc) return
    try {
      const s = await storage()
      await s.save(doc)
      upsertSummary(doc)
      if (typeof history !== 'undefined') history.replaceState(null, '', location.pathname + location.search)
      openDoc(doc)
    } catch (e) {
      set({ status: 'error', error: `Could not open the shared room: ${errorText(e)}` })
    }
  }

  return {
    rooms: [],
    groups: [],
    currentId: null,
    status: 'loading',
    error: null,
    location: '',

    configure: ({ storage: s }) => {
      storageOverride = s ?? null
    },

    start: () => {
      if (!started) started = get().refresh().then(openShared)
      return started
    },

    refresh: async () => {
      if (!get().currentId) set({ status: 'loading' })
      try {
        const s = await storage()
        let list = await s.list()
        if (list.length === 0 && !flagGet(SEEDED_KEY)) {
          flagSet(SEEDED_KEY, '1')
          await s.save(exampleDoc())
          list = await s.list()
        }
        setRooms(list)
        set({ location: s.location, error: null, ...(get().currentId ? {} : { status: 'idle' as const }) })
      } catch (e) {
        set({ status: 'error', error: `Could not read the room list: ${errorText(e)}` })
      }
    },

    create: async (input) => {
      const name = input.name.trim() || 'Untitled room'
      const doc = input.fromExample ? exampleDoc(name, input.group?.trim() ?? '') : emptyDoc({ ...input, name, group: input.group?.trim() ?? '' })
      await get().close()
      try {
        const s = await storage()
        await s.save(doc)
        upsertSummary(doc)
        openDoc(doc)
      } catch (e) {
        set({ status: 'error', error: `Could not create the room: ${errorText(e)}` })
      }
      return doc.id
    },

    open: async (id) => {
      if (get().currentId === id) return
      await get().close()
      set({ status: 'loading', error: null })
      try {
        const doc = await loadDoc(id)
        if (!doc) {
          set({ status: 'error', error: 'That room could not be found.' })
          await get().refresh()
          return
        }
        openDoc(doc)
      } catch (e) {
        set({ status: 'error', error: `Could not open the room: ${errorText(e)}` })
      }
    },

    close: async () => {
      if (!current) return
      const st = get().status
      if (timer || st === 'dirty' || st === 'saving') await flush()
      else if (inFlight) await inFlight
      unsubscribe?.()
      unsubscribe = null
      clearTimer()
      current = null
      set({ currentId: null, status: 'idle', error: null })
      await get().refresh()
    },

    duplicate: async (id) => {
      try {
        if (current && current.id === id) await flush()
        const src = await loadDoc(id)
        if (!src) return null
        const ts = now()
        const copy: RoomDoc = { ...src, id: newId(), name: `${src.name} (copy)`, createdAt: ts, updatedAt: ts }
        const s = await storage()
        await s.save(copy)
        upsertSummary(copy)
        return copy.id
      } catch (e) {
        set({ status: 'error', error: `Could not duplicate: ${errorText(e)}` })
        return null
      }
    },

    rename: async (id, name) => {
      const n = name.trim()
      if (!n) return
      if (current && current.id === id) {
        current = { ...current, name: n }
        patchSummary(id, { name: n })
        const st = useStore.getState()
        useStore.setState({ room: { ...st.room, name: n } })
        await flush()
        return
      }
      try {
        const doc = await loadDoc(id)
        if (!doc) return
        const next: RoomDoc = { ...doc, name: n, room: { ...doc.room, name: n }, updatedAt: now() }
        const s = await storage()
        await s.save(next)
        upsertSummary(next)
      } catch (e) {
        set({ status: 'error', error: `Could not rename: ${errorText(e)}` })
      }
    },

    setGroup: async (id, group) => {
      const g = group.trim()
      if (current && current.id === id) {
        current = { ...current, group: g }
        patchSummary(id, { group: g })
        await flush()
        return
      }
      try {
        const doc = await loadDoc(id)
        if (!doc) return
        const next: RoomDoc = { ...doc, group: g, updatedAt: now() }
        const s = await storage()
        await s.save(next)
        upsertSummary(next)
      } catch (e) {
        set({ status: 'error', error: `Could not move the room: ${errorText(e)}` })
      }
    },

    setNotes: async (id, notes) => {
      if (current && current.id === id) {
        current = { ...current, notes }
        await flush()
        return
      }
      try {
        const doc = await loadDoc(id)
        if (!doc) return
        const s = await storage()
        await s.save({ ...doc, notes, updatedAt: now() })
      } catch (e) {
        set({ status: 'error', error: `Could not save the notes: ${errorText(e)}` })
      }
    },

    remove: async (id) => {
      if (current && current.id === id) {
        unsubscribe?.()
        unsubscribe = null
        clearTimer()
        if (inFlight) await inFlight
        current = null
        set({ currentId: null, status: 'idle' })
      }
      try {
        const s = await storage()
        await s.remove(id)
        setRooms(get().rooms.filter((r) => r.id !== id))
      } catch (e) {
        set({ status: 'error', error: `Could not delete: ${errorText(e)}` })
      }
    },

    exportDoc: async (id) => {
      try {
        if (current && current.id === id) await flush()
        const doc = await loadDoc(id)
        if (!doc) return
        const s = await storage()
        if (!s.exportDoc) {
          set({ error: 'Export is not available here.' })
          return
        }
        await s.exportDoc(doc)
      } catch (e) {
        set({ status: 'error', error: `Could not export: ${errorText(e)}` })
      }
    },

    importDoc: async () => {
      try {
        const s = await storage()
        if (!s.importDoc) {
          set({ error: 'Import is not available here.' })
          return null
        }
        const raw = await s.importDoc()
        if (raw === null) return null
        const doc = migrateDoc(raw)
        if (!doc) {
          set({ error: 'That file is not a Room Planner room.' })
          return null
        }
        // keep the id unless it collides with a room already in the library
        const taken = get().rooms.some((r) => r.id === doc.id) || (current && current.id === doc.id)
        const imported: RoomDoc = { ...doc, id: taken ? newId() : doc.id, updatedAt: now() }
        await get().close()
        await s.save(imported)
        upsertSummary(imported)
        openDoc(imported)
        return imported.id
      } catch (e) {
        set({ status: 'error', error: `Could not import: ${errorText(e)}` })
        return null
      }
    },

    saveNow: async () => {
      if (!current) return
      await flush()
    },
  }
})
