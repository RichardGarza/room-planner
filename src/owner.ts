import { create } from 'zustand'

const KEY = 'room-planner.owner'

function load(): { name: string; asked: boolean } {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw === null) return { name: '', asked: false }
    return { name: raw, asked: true }
  } catch {
    return { name: '', asked: true }
  }
}

interface OwnerState {
  /** the person's first name; empty when skipped */
  name: string
  /** whether the first-run question has been answered or skipped */
  asked: boolean
  setName: (name: string) => void
  skip: () => void
}

/** Whose planner this is: "Richard's Room Planner" on the home page. */
export const useOwner = create<OwnerState>((set) => ({
  ...load(),
  setName: (name) => {
    const clean = name.trim().slice(0, 40)
    try { localStorage.setItem(KEY, clean) } catch { /* ignore */ }
    set({ name: clean, asked: true })
  },
  skip: () => {
    try { localStorage.setItem(KEY, '') } catch { /* ignore */ }
    set({ name: '', asked: true })
  },
}))

/** "Richard's Room Planner", "Chris' Room Planner", or plain "Room Planner". */
export function plannerTitle(name: string) {
  const n = name.trim()
  if (!n) return 'Room Planner'
  return `${n}${/s$/i.test(n) ? '’' : '’s'} Room Planner`
}
