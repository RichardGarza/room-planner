import { describe, expect, it } from 'vitest'
import { defaultRoom, makeEmptyRoom } from '../data'
import { migrateDoc, migrateRoom, nextOpeningId } from '../migrate'
import type { Room } from '../types'

const legacy = {
  name: 'Old room',
  subtitle: '',
  w: 320,
  d: 410,
  h: 250,
  window: { wall: 'left', offset: 40, width: 110, height: 120, sill: 85 },
  door: { wall: 'bottom', offset: 30, width: 90, height: 200, sill: 0, hinge: 'left' },
  radiator: { wall: 'left', offset: 50, width: 90, depth: 8, height: 55 },
  wallColors: { left: '#fff', right: '#fff', top: '#fff', bottom: '#fff' },
  floorColor: '#864',
}

describe('migrateRoom', () => {
  it('converts the old singular window/door/radiator into arrays with ids and a swing', () => {
    const room = migrateRoom(legacy)
    expect(room.windows).toEqual([{ id: 'w1', wall: 'left', offset: 40, width: 110, height: 120, sill: 85 }])
    expect(room.doors).toEqual([{ id: 'd1', wall: 'bottom', offset: 30, width: 90, height: 200, sill: 0, hinge: 'left', swing: 'in' }])
    expect(room.radiators).toEqual([{ id: 'r1', wall: 'left', offset: 50, width: 90, depth: 8, height: 55 }])
    expect(room.w).toBe(320)
    expect(room.name).toBe('Old room')
    expect((room as unknown as Record<string, unknown>).window).toBeUndefined()
  })

  it('drops a legacy radiator of width 0 (the "no radiator" convention)', () => {
    const room = migrateRoom({ ...legacy, radiator: { ...legacy.radiator, width: 0 } })
    expect(room.radiators).toEqual([])
  })

  it('keeps a room that is already in the new shape unchanged', () => {
    expect(migrateRoom(defaultRoom)).toEqual(defaultRoom)
    const empty = makeEmptyRoom('Empty')
    expect(migrateRoom(empty)).toEqual(empty)
  })

  it('fills in missing ids and swings on a new-shape room, keeping existing ids', () => {
    const raw = {
      ...defaultRoom,
      windows: [{ wall: 'top', offset: 10, width: 60, height: 100, sill: 90 }, { id: 'w1', wall: 'right', offset: 10, width: 60, height: 100, sill: 90 }],
      doors: [{ id: 'main', wall: 'bottom', offset: 10, width: 80, height: 205, sill: 0, hinge: 'right' }],
      radiators: [{ wall: 'top', offset: 10, width: 60, depth: 10, height: 60 }],
    }
    const room = migrateRoom(raw)
    expect(room.windows.map((w) => w.id)).toEqual(['w2', 'w1'])
    expect(room.doors[0]).toMatchObject({ id: 'main', swing: 'in' })
    expect(room.radiators[0].id).toBe('r1')
  })

  it('falls back to the defaults for garbage', () => {
    expect(migrateRoom(null)).toEqual(defaultRoom)
    expect(migrateRoom({ w: 'wide' }).w).toBe(defaultRoom.w)
  })

  it('hands out the next free id', () => {
    expect(nextOpeningId('w', [])).toBe('w1')
    expect(nextOpeningId('w', [{ id: 'w1' }, { id: 'w3' }])).toBe('w2')
  })
})

describe('migrateDoc', () => {
  it('migrates the room inside a document', () => {
    const doc = migrateDoc({ id: 'x', name: 'Doc', room: legacy, items: [] })
    expect(doc?.room.doors[0].swing).toBe('in')
    expect(doc?.version).toBe(2)
    const room: Room = doc!.room
    expect(room.windows).toHaveLength(1)
  })

  it('rejects things that are not documents', () => {
    expect(migrateDoc({ items: [] })).toBeNull()
    expect(migrateDoc('nope')).toBeNull()
  })
})
