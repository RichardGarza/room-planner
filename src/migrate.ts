import { defaultRoom } from './data'
import type { Room, RoomDoc } from './types'

export const DOC_VERSION = 1

/**
 * Bring a room from any older saved shape up to the current one.
 * Fills in anything missing from the defaults so old documents keep loading.
 */
export function migrateRoom(raw: unknown): Room {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Room>
  return { ...defaultRoom, ...r }
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
