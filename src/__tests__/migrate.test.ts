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
    expect(migrateDoc({ room: 'walls', items: [] })).toBeNull()
  })
})

describe('migrateDoc validation', () => {
  const good = { id: 'bed', name: 'Bed', kind: 'bed', w: 140, d: 200, h: 50, x: 100, y: 120, rot: 90, color: '#fcc', inRoom: true, note: 'n' }

  it('keeps a well-formed item exactly', () => {
    const doc = migrateDoc({ id: 'x', name: 'Doc', room: legacy, items: [good] })!
    expect(doc.items).toEqual([good])
  })

  it('repairs an item that is only an id (the crash-on-open case)', () => {
    const doc = migrateDoc({ id: 'x', name: 'Doc', room: legacy, items: [{ id: 'x' }] })!
    expect(doc.items).toHaveLength(1)
    const it = doc.items[0]
    expect(it.id).toBe('x')
    expect(it.name).toBe('Box')
    expect(it.kind).toBe('box')
    expect([it.w, it.d, it.h, it.x, it.y, it.rot].every(Number.isFinite)).toBe(true)
    // lands in the middle of the room
    expect(it.x).toBe(160)
    expect(it.y).toBe(205)
    expect(it.rot).toBe(0)
    expect(it.inRoom).toBe(true)
    expect(typeof it.color).toBe('string')
    expect('note' in it).toBe(false)
  })

  it('coerces and clamps the fields of a broken item', () => {
    const doc = migrateDoc({
      id: 'x', name: 'Doc', room: legacy,
      items: [{ id: 'a', name: 7, kind: 'spaceship', w: NaN, d: 9999, h: -3, x: 'left', y: 99999, rot: '90', color: 12, inRoom: 'yes', note: 4 }],
    })!
    expect(doc.items[0]).toEqual({ id: 'a', name: 'Box', kind: 'box', w: 60, d: 600, h: 1, x: 160, y: 5000, rot: 0, color: '#c9c2b8', inRoom: true })
    // Infinity is not a position either: it falls back to the room centre
    expect(migrateDoc({ id: 'x', name: 'Doc', room: legacy, items: [{ id: 'a', y: Infinity }] })!.items[0].y).toBe(205)
  })

  it('keeps the locked flag through a round trip (a saved, shared or imported room keeps its locks)', () => {
    const doc = migrateDoc({ id: 'x', name: 'Doc', room: legacy, items: [{ ...good, locked: true }, { ...good, id: 'b' }, { ...good, id: 'c', locked: 'yes' }] })!
    expect(doc.items[0]).toEqual({ ...good, locked: true })
    expect('locked' in doc.items[1]).toBe(false)
    // anything but a real true is not a lock
    expect('locked' in doc.items[2]).toBe(false)
    // and again through JSON, the way storage and share links carry it
    const again = migrateDoc(JSON.parse(JSON.stringify(doc)))!
    expect(again.items.map((i) => i.locked ?? false)).toEqual([true, false, false])
  })

  it('keeps any finite rotation (free rotation) and normalises it to 0..360', () => {
    const doc = migrateDoc({ id: 'x', name: 'Doc', room: legacy, items: [{ ...good, rot: 37.5 }, { ...good, id: 'b', rot: -90 }, { ...good, id: 'c', rot: 450 }] })!
    expect(doc.items.map((i) => i.rot)).toEqual([37.5, 270, 90])
  })

  it('drops what is not an object, gives missing and duplicate ids fresh ones', () => {
    const doc = migrateDoc({ id: 'x', name: 'Doc', room: legacy, items: [good, null, 'bed', 5, { ...good, id: 'bed' }, { ...good, id: '' }, { ...good, id: undefined }] })!
    expect(doc.items.map((i) => i.id)).toEqual(['bed', 'item-1', 'item-2', 'item-3'])
  })

  it('validates layouts: string id and name, a placements object, broken placements dropped', () => {
    const layouts = [
      { id: 'A', name: 'A', description: 'one', recommended: true, placements: { bed: { x: 1, y: 2, rot: 90, inRoom: true }, desk: { x: 'a', y: 2 }, chair: null, rug: { x: 3, y: 4 } } },
      { id: 'A', name: 'dup', placements: {} },
      { id: 'B', placements: {} },
      { id: 'C', name: 'C' },
      { id: 'D', name: 'D', placements: [1, 2] },
      { id: 'E', name: 'E', placements: {}, items: [{ id: 'q' }, 'junk'] },
      'nope',
      null,
    ]
    const doc = migrateDoc({ id: 'x', name: 'Doc', room: legacy, items: [], layouts })!
    expect(doc.layouts.map((l) => l.id)).toEqual(['A', 'E'])
    expect(doc.layouts[0]).toEqual({
      id: 'A', name: 'A', description: 'one', recommended: true,
      placements: { bed: { x: 1, y: 2, rot: 90, inRoom: true }, rug: { x: 3, y: 4, rot: 0, inRoom: true } },
    })
    expect(doc.layouts[1].description).toBe('')
    expect(doc.layouts[1].items).toHaveLength(1)
    expect(doc.layouts[1].items![0].id).toBe('q')
    expect(migrateDoc({ id: 'x', name: 'Doc', room: legacy, items: [], layouts: 'none' })!.layouts).toEqual([])
  })

  it('coerces the metadata to strings and validates the settings', () => {
    const doc = migrateDoc({ id: 7, name: null, group: 3, notes: {}, createdAt: 12, updatedAt: false, room: legacy, items: [], settings: { daytime: 'no', doorAngle: 900, blinds: -5, walkHeight: 'giant', quality: 'fast' } })!
    expect(doc.id).toMatch(/^room-/)
    expect(doc.name).toBe('Untitled room')
    expect(doc.group).toBe('')
    expect(doc.notes).toBe('')
    expect(typeof doc.createdAt).toBe('string')
    expect(Number.isNaN(Date.parse(doc.createdAt))).toBe(false)
    expect(typeof doc.updatedAt).toBe('string')
    expect(doc.settings).toEqual({ daytime: true, doorAngle: 90, blinds: 0, bedding: true, walkHeight: 'adult', quality: 'fast', lookSensitivity: 1 })
    const kept = migrateDoc({ id: 'k', name: 'K', group: 'G', notes: 'N', createdAt: 'c', updatedAt: 'u', room: legacy, items: [] })!
    expect(kept).toMatchObject({ id: 'k', name: 'K', group: 'G', notes: 'N', createdAt: 'c', updatedAt: 'u' })
  })
})
