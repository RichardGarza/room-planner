import { describe, expect, it } from 'vitest'
import { runChecks } from '../checks'
import { defaultRoom, makeEmptyRoom } from '../data'
import { closetClearance, closetClearanceDepth, closetOpeningRect, closetRecessRect, intersects, rectOf } from '../geometry'
import { migrateRoom } from '../migrate'
import { findFreeSpot } from '../placement'
import { forestsRoom } from '../seeds'
import { sanitizeRoom, useStore } from '../store'
import { suggestLayouts } from '../suggest'
import type { Closet, Item, Room } from '../types'

const closet = (over: Partial<Closet> = {}): Closet => ({ id: 'c1', wall: 'right', offset: 100, width: 160, depth: 60, doors: 'bifold', ...over })
const room = (over: Partial<Room> = {}): Room => ({ ...makeEmptyRoom('t', 300, 400), ...over })
const item = (over: Partial<Item> = {}): Item => ({
  id: 'dresser', name: 'Dresser', kind: 'dresser', w: 100, d: 45, h: 80, x: 250, y: 180, rot: 90, color: '#fff', inRoom: true, ...over,
})
const texts = (r: Room, items: Item[]) => runChecks(r, items).map((c) => `${c.level}: ${c.text}`)

describe('closet geometry', () => {
  it('puts the opening on the wall line and the recess outside the room', () => {
    const r = room()
    expect(closetOpeningRect(r, closet())).toEqual({ x0: 300, y0: 100, x1: 300, y1: 260 })
    expect(closetRecessRect(r, closet())).toEqual({ x0: 300, y0: 100, x1: 360, y1: 260 })
    expect(closetRecessRect(r, closet({ wall: 'top', offset: 20, width: 100, depth: 50 }))).toEqual({ x0: 20, y0: -50, x1: 120, y1: 0 })
    expect(closetRecessRect(r, closet({ wall: 'bottom', offset: 20, width: 100, depth: 50 }))).toEqual({ x0: 20, y0: 400, x1: 120, y1: 450 })
    expect(closetRecessRect(r, closet({ wall: 'left', offset: 20, width: 100, depth: 50 }))).toEqual({ x0: -50, y0: 20, x1: 0, y1: 120 })
  })

  it('needs a different clearance in front for each kind of door', () => {
    expect(closetClearanceDepth(closet({ doors: 'none' }))).toBe(40)
    expect(closetClearanceDepth(closet({ doors: 'sliding' }))).toBe(40)
    expect(closetClearanceDepth(closet({ doors: 'bifold', width: 160 }))).toBe(55)
    expect(closetClearanceDepth(closet({ doors: 'hinged', width: 160 }))).toBe(90)
    const r = room()
    expect(closetClearance(r, closet({ doors: 'hinged' })).rect).toEqual({ x0: 210, y0: 100, x1: 300, y1: 260 })
    expect(closetClearance(r, closet({ doors: 'bifold' })).rect).toEqual({ x0: 245, y0: 100, x1: 300, y1: 260 })
    expect(closetClearance(r, closet({ doors: 'sliding' })).rect).toEqual({ x0: 260, y0: 100, x1: 300, y1: 260 })
    expect(closetClearance(r, closet({ doors: 'none', wall: 'top' })).rect).toEqual({ x0: 100, y0: 0, x1: 260, y1: 40 })
  })

  it('is bad to block doors that swing or fold, only a warning to stand in front of an open or sliding closet', () => {
    const r = room()
    expect(closetClearance(r, closet({ doors: 'hinged' })).level).toBe('bad')
    expect(closetClearance(r, closet({ doors: 'bifold' })).level).toBe('bad')
    expect(closetClearance(r, closet({ doors: 'sliding' })).level).toBe('warn')
    expect(closetClearance(r, closet({ doors: 'none' })).level).toBe('warn')
    expect(closetClearance(r, closet({ doors: 'bifold' })).text('Dresser')).toBe('Dresser blocks the closet doors')
    expect(closetClearance(r, closet({ doors: 'bifold' })).text('Dresser', 'closet 2')).toBe('Dresser blocks the doors of closet 2')
    expect(closetClearance(r, closet({ doors: 'none' })).text('Dresser')).toBe('Dresser is in front of the closet')
  })
})

describe('closet checks', () => {
  it('flags a dresser in front of bi-fold doors as bad and in front of an open closet as a warning', () => {
    // the dresser stands against the right wall inside the closet's span: 45 cm deep, 55 cm needed for the bi-fold
    const dresser = item({ x: 300 - 45 / 2, y: 180 })
    expect(texts(room({ closets: [closet({ doors: 'bifold' })] }), [dresser])).toContain('bad: Dresser blocks the closet doors')
    expect(texts(room({ closets: [closet({ doors: 'hinged' })] }), [dresser])).toContain('bad: Dresser blocks the closet doors')
    expect(texts(room({ closets: [closet({ doors: 'none' })] }), [dresser])).toContain('warn: Dresser is in front of the closet')
    expect(texts(room({ closets: [closet({ doors: 'sliding' })] }), [dresser])).toContain('warn: Dresser is in front of the closet')
  })

  it('says nothing when the floor in front is free, and names closets when there are several', () => {
    const away = item({ x: 150, y: 180 })
    expect(texts(room({ closets: [closet({ doors: 'hinged' })] }), [away]).some((t) => /closet/.test(t))).toBe(false)
    const two = room({ closets: [closet({ wall: 'top', offset: 20, width: 100 }), closet({ id: 'c2', doors: 'none' })] })
    expect(texts(two, [item({ x: 280, y: 180 })])).toContain('warn: Dresser is in front of closet 2')
    // a rug in front of the closet is fine
    expect(texts(room({ closets: [closet()] }), [item({ kind: 'rug', x: 280, y: 180 })]).some((t) => /closet/.test(t))).toBe(false)
  })
})

describe('migrateRoom and sanitizeRoom with closets', () => {
  it('adds closets: [] to a room without any and gives closets ids', () => {
    const { closets: _drop, ...without } = defaultRoom
    expect(migrateRoom(without).closets).toEqual([])
    const migrated = migrateRoom({ ...defaultRoom, closets: [{ wall: 'left', offset: 10, width: 120, depth: 55, doors: 'sliding' }, { id: 'c1', wall: 'top', offset: 0, width: 90, depth: 60, doors: 'nope' }] })
    expect(migrated.closets).toEqual([
      { id: 'c2', wall: 'left', offset: 10, width: 120, depth: 55, doors: 'sliding' },
      { id: 'c1', wall: 'top', offset: 0, width: 90, depth: 60, doors: 'bifold' },
    ])
    expect(migrateRoom(defaultRoom)).toEqual(defaultRoom)
  })

  it('clamps a closet onto its wall and its depth to 30–120', () => {
    const r = sanitizeRoom(room({ closets: [closet({ offset: 380, width: 160, depth: 200 }), closet({ id: 'c2', wall: 'top', offset: -20, width: 500, depth: 5, height: 500 })] }))
    expect(r.closets[0]).toMatchObject({ offset: 240, width: 160, depth: 120 })
    expect(r.closets[1]).toMatchObject({ offset: 0, width: 300, depth: 30, height: 255 })
  })
})

describe('store: closets as openings', () => {
  it('adds a closet on a wall without overlapping doors or windows, opposite the door when possible', () => {
    const s = useStore.getState()
    s.setRoom(makeEmptyRoom('t', 300, 400))
    const id = s.addOpening('closet')
    let r = useStore.getState().room
    const c = r.closets.find((x) => x.id === id)!
    expect(c).toMatchObject({ width: 150, depth: 60, doors: 'bifold' })
    // the door is on the front wall; the window on the back wall leaves no 150 cm run there, so a side wall it is
    expect(['top', 'left', 'right']).toContain(c.wall)
    for (const o of [...r.windows, ...r.doors]) {
      if (o.wall !== c.wall) continue
      expect(c.offset >= o.offset + o.width || c.offset + c.width <= o.offset).toBe(true)
    }
    const len = c.wall === 'top' || c.wall === 'bottom' ? r.w : r.d
    expect(c.offset).toBeGreaterThanOrEqual(0)
    expect(c.offset + c.width).toBeLessThanOrEqual(len)

    s.updateOpening('closet', id, { doors: 'sliding', depth: 500 })
    r = useStore.getState().room
    expect(r.closets.find((x) => x.id === id)).toMatchObject({ doors: 'sliding', depth: 120 })

    // a second closet does not land on the first
    const id2 = s.addOpening('closet')
    r = useStore.getState().room
    const c2 = r.closets.find((x) => x.id === id2)!
    const c1 = r.closets.find((x) => x.id === id)!
    if (c1.wall === c2.wall) expect(c2.offset >= c1.offset + c1.width || c2.offset + c2.width <= c1.offset).toBe(true)

    s.removeOpening('closet', id)
    s.removeOpening('closet', id2)
    expect(useStore.getState().room.closets).toEqual([])
    s.setRoom(defaultRoom)
  })

  it('puts the closet opposite the door when that wall has room', () => {
    const s = useStore.getState()
    s.setRoom({ ...makeEmptyRoom('t', 300, 400), windows: [] })
    const id = s.addOpening('closet')
    expect(useStore.getState().room.closets.find((x) => x.id === id)?.wall).toBe('top')
    s.setRoom(defaultRoom)
  })
})

describe('placement and suggestions keep the closet clear', () => {
  it('findFreeSpot keeps a new piece out of the closet clearance', () => {
    const r = room({ closets: [closet({ wall: 'right', offset: 0, width: 400, doors: 'hinged' })] })
    // the whole right wall is a hinged closet: 210 cm in front of it must stay free
    for (let i = 0; i < 6; i++) {
      const spot = findFreeSpot(r, [], 100, 45, { h: 80 })
      const it: Item = { ...item(), x: spot.x, y: spot.y, rot: spot.rot }
      expect(intersects(rectOf(it), closetClearance(r, r.closets[0]).rect)).toBe(false)
    }
    const spot = findFreeSpot(r, [], 100, 45, { h: 80 })
    expect(rectOf({ ...item(), ...spot }).x1).toBeLessThanOrEqual(90)
  })

  it('suggestLayouts leaves the closet doors free', () => {
    const r = room({ closets: [closet({ doors: 'hinged' })] })
    const items: Item[] = [
      { ...item({ id: 'bed', name: 'Bed', kind: 'bed', w: 150, d: 210, h: 95 }) },
      item({ id: 'dresser' }),
      item({ id: 'desk', name: 'Desk', kind: 'desk', w: 100, d: 50, h: 75 }),
    ]
    const layouts = suggestLayouts(r, items)
    expect(layouts.length).toBeGreaterThan(0)
    for (const l of layouts) {
      const placed = items.map((i) => ({ ...i, ...l.placements[i.id] }))
      expect(runChecks(r, placed).filter((c) => /closet/.test(c.text))).toEqual([])
    }
  })
})

describe("Forest's Room closet", () => {
  it('has a bi-fold closet on the right wall that nothing blocks', () => {
    const doc = forestsRoom()
    expect(doc.room.closets).toHaveLength(1)
    expect(doc.room.closets[0]).toMatchObject({ wall: 'right', offset: 147, depth: 61, doors: 'bifold' })
    expect(doc.room.closets[0].offset + doc.room.closets[0].width).toBeLessThanOrEqual(doc.room.d)
    const checks = runChecks(doc.room, doc.items)
    expect(checks.filter((c) => /closet/.test(c.text))).toEqual([])
  })
})
