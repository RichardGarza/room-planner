import { create } from 'zustand'

/*
 * Remembered open/closed state for the side panel and its cards. Both live in localStorage so a
 * reload brings the panel back the way it was left; nothing here touches the room document.
 */

export const SIDEBAR_KEY = 'room-planner.sidebar'
export const CARDS_KEY = 'room-planner.cards'

export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

function browserStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/** Parse a stored card map: only `{ id: boolean }` entries count, anything else is ignored. */
export function parseFlags(raw: string | null | undefined): Record<string, boolean> {
  if (!raw) return {}
  try {
    const v: unknown = JSON.parse(raw)
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
    const out: Record<string, boolean> = {}
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) if (typeof val === 'boolean') out[k] = val
    return out
  } catch {
    return {}
  }
}

export function loadFlags(key: string, storage: StorageLike | null = browserStorage()): Record<string, boolean> {
  try {
    return parseFlags(storage?.getItem(key))
  } catch {
    return {}
  }
}

export function saveFlags(key: string, flags: Record<string, boolean>, storage: StorageLike | null = browserStorage()) {
  try {
    storage?.setItem(key, JSON.stringify(flags))
  } catch {
    /* private mode: the state just does not survive a reload */
  }
}

/** The stored side-panel state: "open" unless it was explicitly collapsed. */
export function parseSidebar(raw: string | null | undefined): boolean {
  return raw !== 'collapsed'
}

export function loadSidebar(storage: StorageLike | null = browserStorage()): boolean {
  try {
    return parseSidebar(storage?.getItem(SIDEBAR_KEY))
  } catch {
    return true
  }
}

export function saveSidebar(open: boolean, storage: StorageLike | null = browserStorage()) {
  try {
    storage?.setItem(SIDEBAR_KEY, open ? 'open' : 'collapsed')
  } catch {
    /* ignore */
  }
}

/** Whether a card is open: its remembered state, else the default it was given. */
export function cardOpen(flags: Record<string, boolean>, id: string, defaultOpen = true): boolean {
  return flags[id] ?? defaultOpen
}

interface CardsState {
  open: Record<string, boolean>
  setOpen: (id: string, open: boolean) => void
  toggle: (id: string, defaultOpen?: boolean) => void
}

/** Open/closed state per card id, remembered in localStorage. */
export const useCards = create<CardsState>((set, get) => ({
  open: loadFlags(CARDS_KEY),
  setOpen: (id, open) => {
    if (get().open[id] === open) return
    const next = { ...get().open, [id]: open }
    saveFlags(CARDS_KEY, next)
    set({ open: next })
  },
  toggle: (id, defaultOpen = true) => get().setOpen(id, !cardOpen(get().open, id, defaultOpen)),
}))

interface SidebarState {
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
}

/** Whether the right-hand panel is shown, remembered in localStorage. */
export const useSidebar = create<SidebarState>((set, get) => ({
  open: loadSidebar(),
  setOpen: (open) => {
    saveSidebar(open)
    set({ open })
  },
  toggle: () => get().setOpen(!get().open),
}))
