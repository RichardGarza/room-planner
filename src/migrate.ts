import { defaultRoom } from './data'
import type { Door, Opening, Radiator, Room, RoomDoc, Wall } from './types'

export const DOC_VERSION = 2

const WALLS: Wall[] = ['top', 'bottom', 'left', 'right']

function freeId(prefix: string, used: Set<string>): string {
  for (let n = 1; ; n++) {
    const id = `${prefix}${n}`
    if (!used.has(id)) return id
  }
}

/** Next free id with the given prefix ("w1", "w2", …) that none of `existing` uses. */
export function nextOpeningId(prefix: string, existing: { id: string }[]): string {
  return freeId(prefix, new Set(existing.map((o) => o.id)))
}

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
const wallOf = (v: unknown, fallback: Wall): Wall => (WALLS.includes(v as Wall) ? (v as Wall) : fallback)
const idOf = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null)

type Unkeyed<T> = Omit<T, 'id'> & { id: string | null }

function fixWindow(raw: unknown, base: Opening): Unkeyed<Opening> {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<Opening>
  return {
    id: idOf(o.id),
    wall: wallOf(o.wall, base.wall),
    offset: num(o.offset, base.offset),
    width: num(o.width, base.width),
    height: num(o.height, base.height),
    sill: num(o.sill, base.sill),
  }
}

function fixDoor(raw: unknown, base: Door): Unkeyed<Door> {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<Door>
  return {
    ...fixWindow(raw, base),
    sill: 0,
    hinge: o.hinge === 'left' || o.hinge === 'right' ? o.hinge : base.hinge,
    swing: o.swing === 'out' ? 'out' : 'in',
  }
}

function fixRadiator(raw: unknown, base: Radiator): Unkeyed<Radiator> {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<Radiator>
  return {
    id: idOf(o.id),
    wall: wallOf(o.wall, base.wall),
    offset: num(o.offset, base.offset),
    width: num(o.width, base.width),
    depth: num(o.depth, base.depth),
    height: num(o.height, base.height),
  }
}

/** Give every entry a unique id, keeping the ones that are already there (first one wins on a duplicate). */
function withIds<T extends { id: string | null }>(list: T[], prefix: string): (T & { id: string })[] {
  const used = new Set<string>()
  const kept = list.map((entry) => {
    if (!entry.id || used.has(entry.id)) return null
    used.add(entry.id)
    return entry.id
  })
  return list.map((entry, i) => {
    const id = kept[i] ?? freeId(prefix, used)
    used.add(id)
    return { ...entry, id }
  })
}

/**
 * Bring a room from any older saved shape up to the current one.
 * Older rooms had a single `window`, `door` and `radiator`; they become one-entry arrays.
 * Missing ids are generated, a missing door swing becomes "in", a radiator of width 0 is dropped,
 * and anything else missing is filled from the defaults so old documents keep loading.
 */
export function migrateRoom(raw: unknown): Room {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const baseWin = defaultRoom.windows[0]
  const baseDoor = defaultRoom.doors[0]
  const baseRad = defaultRoom.radiators[0]

  // A room that carries no opening fields at all gets the default set; one that has some keeps what it has.
  const bare = !['windows', 'window', 'doors', 'door', 'radiators', 'radiator'].some((k) => k in r)
  const winRaw: unknown[] = Array.isArray(r.windows) ? r.windows : r.window ? [r.window] : bare ? defaultRoom.windows : []
  const doorRaw: unknown[] = Array.isArray(r.doors) ? r.doors : r.door ? [r.door] : bare ? defaultRoom.doors : []
  const radRaw: unknown[] = Array.isArray(r.radiators) ? r.radiators : r.radiator ? [r.radiator] : bare ? defaultRoom.radiators : []

  const windows = withIds(winRaw.map((o) => fixWindow(o, baseWin)), 'w')
  const doors = withIds(doorRaw.map((o) => fixDoor(o, baseDoor)), 'd')
  const radiators = withIds(radRaw.map((o) => fixRadiator(o, baseRad)), 'r').filter((o) => o.width > 0)

  const colors = (r.wallColors && typeof r.wallColors === 'object' ? r.wallColors : {}) as Partial<Room['wallColors']>
  return {
    name: typeof r.name === 'string' ? r.name : defaultRoom.name,
    subtitle: typeof r.subtitle === 'string' ? r.subtitle : defaultRoom.subtitle,
    w: num(r.w, defaultRoom.w),
    d: num(r.d, defaultRoom.d),
    h: num(r.h, defaultRoom.h),
    windows,
    doors,
    radiators,
    wallColors: { ...defaultRoom.wallColors, ...colors },
    floorColor: typeof r.floorColor === 'string' ? r.floorColor : defaultRoom.floorColor,
  }
}

/** Same for a whole stored document. Returns null if it is not a room document at all. */
export function migrateDoc(raw: unknown): RoomDoc | null {
  if (!raw || typeof raw !== 'object') return null
  const d = raw as Partial<RoomDoc>
  if (!d.room || !Array.isArray(d.items)) return null
  return {
    id: d.id ?? `room-${Math.random().toString(36).slice(2, 10)}`,
    name: d.name ?? 'Untitled room',
    group: d.group ?? '',
    notes: d.notes ?? '',
    createdAt: d.createdAt ?? new Date().toISOString(),
    updatedAt: d.updatedAt ?? new Date().toISOString(),
    room: migrateRoom(d.room),
    items: d.items,
    layouts: d.layouts ?? [],
    settings: { daytime: true, doorAngle: 70, blinds: 40, bedding: true, walkHeight: 'adult', quality: 'best', ...(d.settings ?? {}) },
    version: DOC_VERSION,
  }
}
