import { describe, expect, it } from 'vitest'
import { runChecks } from '../checks'
import { defaultRoom } from '../data'
import {
  doorClearanceFor,
  footprint,
  intersects,
  isAxisAligned,
  itemsIntersect,
  normalizeRot,
  pointInPolygon,
  polygonBounds,
  polygonIntersectsRect,
  polygonOf,
  polygonsIntersect,
  rectOf,
  rectToPolygon,
  snap90,
} from '../geometry'
import { findFreeSpot } from '../placement'
import { useStore } from '../store'
import type { Door, Item, Room } from '../types'

const box = (over: Partial<Item>): Item => ({
  id: 'box', name: 'Box', kind: 'box', w: 100, d: 100, h: 80, x: 200, y: 200, rot: 0, color: '#fff', inRoom: true, ...over,
})

/** a bare 400 × 400 room with no openings */
const bare: Room = { ...defaultRoom, w: 400, d: 400, windows: [], doors: [], radiators: [], closets: [] }

const S2 = Math.SQRT2

describe('normalising angles', () => {
  it('brings any angle into [0, 360)', () => {
    expect(normalizeRot(0)).toBe(0)
    expect(normalizeRot(360)).toBe(0)
    expect(normalizeRot(-90)).toBe(270)
    expect(normalizeRot(450)).toBe(90)
    expect(normalizeRot(-0.001)).toBe(0)
    expect(normalizeRot(359.999)).toBe(0)
    expect(normalizeRot(37)).toBe(37)
    expect(normalizeRot(NaN)).toBe(0)
  })

  it('knows the axis-aligned angles and the nearest quarter turn', () => {
    expect([0, 90, 180, 270, 360, -90].every(isAxisAligned)).toBe(true)
    expect([1, 45, 89.5, 137].some(isAxisAligned)).toBe(false)
    expect(snap90(37)).toBe(0)
    expect(snap90(50)).toBe(90)
    expect(snap90(-40)).toBe(0)
    expect(snap90(224)).toBe(180)
    expect(snap90(226)).toBe(270)
    expect(snap90(350)).toBe(0)
  })
})

describe('footprint at any angle', () => {
  it('still swaps exactly at quarter turns', () => {
    expect(footprint({ w: 100, d: 50, rot: 0 })).toEqual({ fw: 100, fd: 50 })
    expect(footprint({ w: 100, d: 50, rot: 90 })).toEqual({ fw: 50, fd: 100 })
    expect(footprint({ w: 100, d: 50, rot: 180 })).toEqual({ fw: 100, fd: 50 })
    expect(footprint({ w: 100, d: 50, rot: 270 })).toEqual({ fw: 50, fd: 100 })
  })

  it('returns the bounding box of the turned box at 45°', () => {
    const { fw, fd } = footprint({ w: 100, d: 100, rot: 45 })
    expect(fw).toBeCloseTo(100 * S2, 6)
    expect(fd).toBeCloseTo(100 * S2, 6)
    const r = footprint({ w: 200, d: 100, rot: 45 })
    expect(r.fw).toBeCloseTo((200 + 100) / S2, 6)
    expect(r.fd).toBeCloseTo((200 + 100) / S2, 6)
  })

  it('uses |w cos θ| + |d sin θ| in general', () => {
    const th = (30 * Math.PI) / 180
    const { fw, fd } = footprint({ w: 120, d: 60, rot: 30 })
    expect(fw).toBeCloseTo(120 * Math.cos(th) + 60 * Math.sin(th), 6)
    expect(fd).toBeCloseTo(120 * Math.sin(th) + 60 * Math.cos(th), 6)
    // symmetric angles give the same box
    expect(footprint({ w: 120, d: 60, rot: 210 }).fw).toBeCloseTo(fw, 6)
    expect(footprint({ w: 120, d: 60, rot: -30 }).fd).toBeCloseTo(fd, 6)
  })
})

describe('polygonOf', () => {
  it('gives the rect corners for an axis-aligned item, exactly', () => {
    const it = box({ w: 100, d: 50, x: 200, y: 100 })
    expect(polygonOf(it)).toEqual([[150, 75], [250, 75], [250, 125], [150, 125]])
    const turned = box({ w: 100, d: 50, x: 200, y: 100, rot: 90 })
    expect(polygonOf(turned)).toEqual([[225, 50], [225, 150], [175, 150], [175, 50]])
    expect(polygonBounds(polygonOf(turned))).toEqual(rectOf(turned))
  })

  it('turns the corners clockwise on the plan and its bounds match the footprint', () => {
    const it = box({ w: 100, d: 100, x: 200, y: 200, rot: 45 })
    const poly = polygonOf(it)
    // the top-left corner (−50, −50) turns to straight above the centre
    expect(poly[0][0]).toBeCloseTo(200, 6)
    expect(poly[0][1]).toBeCloseTo(200 - 50 * S2, 6)
    // the top-right corner (50, −50) turns to the right of the centre
    expect(poly[1][0]).toBeCloseTo(200 + 50 * S2, 6)
    expect(poly[1][1]).toBeCloseTo(200, 6)
    const b = polygonBounds(poly), r = rectOf(it)
    for (const k of ['x0', 'y0', 'x1', 'y1'] as const) expect(b[k]).toBeCloseTo(r[k], 6)
  })
})

describe('itemsIntersect', () => {
  it('matches the rect test for two square items', () => {
    const a = box({ x: 200, y: 200 })
    expect(itemsIntersect(a, box({ id: 'b', x: 260, y: 200 }))).toBe(true)
    expect(itemsIntersect(a, box({ id: 'b', x: 300, y: 200 }))).toBe(false)
    expect(itemsIntersect(a, box({ id: 'b', x: 300, y: 200, rot: 180 }))).toBe(false)
  })

  it('does not flag two 45° items whose boxes overlap but whose outlines do not', () => {
    // 100 × 100 at 45°: a diamond with corners 70.7 from the centre; boxes span 141 × 141.
    // b sits diagonally down-right: the boxes overlap by 41 cm each way, the diamonds are 41 cm apart
    const a = box({ id: 'a', x: 200, y: 200, rot: 45 })
    const b = box({ id: 'b', x: 300, y: 300, rot: 45 })
    expect(intersects(rectOf(a), rectOf(b))).toBe(true)
    expect(itemsIntersect(a, b)).toBe(false)
    // moved to 50√2 each way their edges lie on the same line: touching, not overlapping
    const c = box({ id: 'c', x: 200 + 50 * S2, y: 200 + 50 * S2, rot: 45 })
    expect(itemsIntersect(a, c)).toBe(false)
    // pull it in by 1 cm and they overlap
    const d = box({ id: 'd', x: 200 + 50 * S2 - 1, y: 200 + 50 * S2 - 1, rot: 45 })
    expect(itemsIntersect(a, d)).toBe(true)
  })

  it('a diamond nestled against the corner of a square is clear, the same boxes are not', () => {
    const square = box({ id: 'sq', x: 100, y: 100 })
    // the diamond's upper-left edge passes 1 cm from the square's bottom-right corner (150, 150)
    const diamond = box({ id: 'di', x: 150 + 25 * S2 + 1, y: 150 + 25 * S2 + 1, rot: 45 })
    expect(itemsIntersect(square, diamond)).toBe(false)
    // bounding boxes: the diamond's box reaches back to x = 116, well into the square's box
    expect(rectOf(diamond).x0).toBeLessThan(rectOf(square).x1 - 30)
    // overlapping outlines are still caught
    expect(itemsIntersect(square, box({ id: 'in', x: 170, y: 170, rot: 45 }))).toBe(true)
  })

  it('treats edges touching within the tolerance as clear', () => {
    const a = box({ id: 'a', x: 200, y: 200, rot: 30 })
    // b is a's neighbour along a's turned x axis: touching edges, no overlap
    const dx = 100 * Math.cos(Math.PI / 6), dy = 100 * Math.sin(Math.PI / 6)
    expect(itemsIntersect(a, box({ id: 'b', x: 200 + dx, y: 200 + dy, rot: 30 }))).toBe(false)
    expect(itemsIntersect(a, box({ id: 'b', x: 200 + dx * 0.996, y: 200 + dy * 0.996, rot: 30 }))).toBe(false)
    expect(itemsIntersect(a, box({ id: 'b', x: 200 + dx * 0.98, y: 200 + dy * 0.98, rot: 30 }))).toBe(true)
  })
})

describe('polygonIntersectsRect and pointInPolygon', () => {
  it('is exact for a turned outline against a wall strip', () => {
    // a window strip on the left half of the back wall
    const strip = { x0: 0, y0: 0, x1: 150, y1: 20 }
    // a diamond whose top corner pokes 5 cm into the strip's rows but 50 cm to the right of it: its box reaches in
    const clear = polygonOf(box({ x: 200, y: 15 + 50 * S2, rot: 45 }))
    expect(intersects(polygonBounds(clear), strip)).toBe(true)
    expect(polygonIntersectsRect(clear, strip)).toBe(false)
    const hit = polygonOf(box({ x: 140, y: 15 + 50 * S2, rot: 45 }))
    expect(polygonIntersectsRect(hit, strip)).toBe(true)
    // square items behave like the rect test
    expect(polygonIntersectsRect(polygonOf(box({ x: 100, y: 70 })), strip)).toBe(false)
    expect(polygonIntersectsRect(polygonOf(box({ x: 100, y: 60 })), strip)).toBe(true)
    expect(polygonsIntersect(rectToPolygon(strip), rectToPolygon({ x0: 0, y0: 20, x1: 100, y1: 40 }))).toBe(false)
  })

  it('knows which points lie inside a turned outline', () => {
    const poly = polygonOf(box({ x: 200, y: 200, rot: 45 }))
    expect(pointInPolygon(200, 200, poly)).toBe(true)
    expect(pointInPolygon(200, 200 - 60, poly)).toBe(true)
    // inside the bounding box but outside the diamond
    expect(pointInPolygon(200 - 60, 200 - 60, poly)).toBe(false)
    // a point on the outline does not count
    expect(pointInPolygon(200, 200 - 50 * S2, poly)).toBe(false)
    // works whichever way the polygon winds
    expect(pointInPolygon(200, 200, [...poly].reverse())).toBe(true)
  })
})

describe('checks with turned items', () => {
  it('does not report an overlap for two diamonds whose boxes overlap', () => {
    const a = box({ id: 'a', x: 150, y: 150, rot: 45 })
    const b = box({ id: 'b', x: 250, y: 250, rot: 45 })
    expect(intersects(rectOf(a), rectOf(b))).toBe(true)
    const texts = runChecks(bare, [a, b]).map((c) => c.text)
    expect(texts.some((t) => /overlaps/.test(t))).toBe(false)
    const close = runChecks(bare, [a, { ...b, x: 215, y: 215 }]).map((c) => c.text)
    expect(close.some((t) => /overlaps/.test(t))).toBe(true)
  })

  it('judges through-wall by the turned corners', () => {
    // a diamond of 100 × 100 needs 70.7 cm from its centre to a wall
    const inside = box({ x: 75, y: 200, rot: 45 })
    expect(runChecks(bare, [inside]).some((c) => /through a wall/.test(c.text))).toBe(false)
    const through = box({ x: 65, y: 200, rot: 45 })
    expect(runChecks(bare, [through]).some((c) => /through a wall/.test(c.text))).toBe(true)
    // a square that would fit as a square but not once turned
    expect(runChecks(bare, [box({ x: 55, y: 200 })]).some((c) => /through a wall/.test(c.text))).toBe(false)
    expect(runChecks(bare, [box({ x: 55, y: 200, rot: 30 })]).some((c) => /through a wall/.test(c.text))).toBe(true)
  })

  it('door clearance samples the leaf against the turned outline', () => {
    // door on the front wall, hinge on the left, leaf sweeping into the room
    const door: Door = { id: 'd', wall: 'bottom', offset: 100, width: 80, height: 205, sill: 0, hinge: 'left', swing: 'in' }
    const room: Room = { ...bare, doors: [door] }
    // the leaf sweeps the quarter disc around (100, 400) with radius 80.
    // a diamond centred at (200, 320): its box reaches x = 129, y = 250..390, inside the sweep; its left corner is at x = 129 only at y = 320
    const diamond = box({ x: 200 + 8, y: 320, rot: 45 })
    const sq = box({ x: 200 + 8, y: 320 })
    expect(doorClearanceFor(room, door, [sq]).maxAngle).toBeLessThan(90)
    expect(doorClearanceFor(room, door, [diamond]).maxAngle).toBe(90)
    // moved into the sweep the diamond does block the door
    expect(doorClearanceFor(room, door, [box({ x: 150, y: 340, rot: 45 })]).maxAngle).toBeLessThan(90)
  })

  it('doorway and closet clearance use the outline too', () => {
    const outDoor: Door = { id: 'd', wall: 'bottom', offset: 100, width: 80, height: 205, sill: 0, hinge: 'left', swing: 'out' }
    const room: Room = { ...bare, doors: [outDoor], closets: [{ id: 'c', wall: 'right', offset: 50, width: 100, depth: 60, doors: 'sliding' }] }
    // the doorway strip is x 100..180, y 360..400; a diamond just beside it whose box reaches in
    const beside = box({ x: 180 + 50 * S2 - 20, y: 400 - 50 * S2 - 4, rot: 45 })
    expect(rectOf(beside).x0).toBeLessThan(180)
    expect(rectOf(beside).y1).toBeGreaterThan(360)
    const texts = runChecks(room, [beside]).map((c) => c.text)
    expect(texts.some((t) => /doorway/.test(t))).toBe(false)
    // the closet needs x 360..400, y 50..150 free; a diamond whose box reaches in but whose corner does not
    const nearCloset = box({ x: 360 - 50 * S2 + 20, y: 150 + 50 * S2 + 2, rot: 45 })
    expect(rectOf(nearCloset).x1).toBeGreaterThan(360)
    expect(runChecks(room, [nearCloset]).some((c) => /closet/.test(c.text))).toBe(false)
    expect(runChecks(room, [box({ x: 340, y: 100, rot: 45 })]).some((c) => /closet/.test(c.text))).toBe(true)
  })
})

describe('placement respects turned items', () => {
  it('lets a new piece stand where only the bounding box of a diamond would be', () => {
    // a big diamond in the middle; the top-left corner of its box is free floor
    const diamond = box({ x: 200, y: 200, w: 200, d: 200, rot: 45 })
    const spot = findFreeSpot(bare, [diamond], 40, 40)
    const placed = box({ id: 'new', w: 40, d: 40, x: spot.x, y: spot.y, rot: spot.rot })
    expect(itemsIntersect(placed, diamond)).toBe(false)
    expect([0, 90, 180, 270]).toContain(spot.rot)
    expect(spot.x).toBeGreaterThanOrEqual(20)
    expect(spot.y).toBeGreaterThanOrEqual(20)
    // the room's first candidate, the top-left corner, is only free because the diamond does not reach it
    expect(spot).toEqual({ x: 20, y: 20, rot: 0 })
  })
})

describe('store rotation', () => {
  const setup = () => {
    const s = useStore.getState()
    s.hydrate({
      id: 'r', name: 'r', group: '', notes: '', createdAt: '', updatedAt: '', version: 2,
      room: bare,
      items: [box({ id: 'a', x: 200, y: 200 }), box({ id: 'b', w: 200, d: 100, x: 100, y: 50 })],
      layouts: [],
      settings: { daytime: true, doorAngle: 90, blinds: 0, bedding: true, walkHeight: 'adult', quality: 'fast' },
    })
    return useStore.getState()
  }
  const item = (id: string) => useStore.getState().items.find((i) => i.id === id)!

  it('rotateItem accepts any delta and normalises', () => {
    const s = setup()
    s.rotateItem('a', 37)
    expect(item('a').rot).toBe(37)
    s.rotateItem('a', 37)
    expect(item('a').rot).toBe(74)
    s.rotateItem('a', -100)
    expect(item('a').rot).toBe(334)
    s.rotateItem('a', 90)
    expect(item('a').rot).toBe(64)
    // the quarter-turn buttons still land exactly on quarter turns
    s.setRotation('a', 270)
    s.rotateItem('a', 90)
    expect(item('a').rot).toBe(0)
    s.rotateItem('a', -90)
    expect(item('a').rot).toBe(270)
    s.rotateItem('a', 180)
    expect(item('a').rot).toBe(90)
  })

  it('setRotation sets the angle outright, normalised', () => {
    const s = setup()
    s.setRotation('a', 400)
    expect(item('a').rot).toBe(40)
    s.setRotation('a', -45)
    expect(item('a').rot).toBe(315)
    s.setRotation('a', 360)
    expect(item('a').rot).toBe(0)
  })

  it('clamps a turned item back into the room by its bounding box', () => {
    const s = setup()
    // b is 200 × 100 at (100, 50): flush with the back-left corner while square
    s.setRotation('b', 45)
    const b = item('b')
    const r = rectOf(b)
    expect(r.x0).toBeGreaterThanOrEqual(-0.01)
    expect(r.y0).toBeGreaterThanOrEqual(-0.01)
    expect(b.x).toBeCloseTo(footprint(b).fw / 2, 6)
    expect(b.y).toBeCloseTo(footprint(b).fd / 2, 6)
    expect(runChecks(bare, [b]).some((c) => /through a wall/.test(c.text))).toBe(false)
  })

  it('rotation is undoable', () => {
    const s = setup()
    s.rotateItem('a', 37)
    s.undo()
    expect(item('a').rot).toBe(0)
    s.redo()
    expect(item('a').rot).toBe(37)
    // a drag pushes one snapshot then sets the angle as many times as it likes
    s.snapshot()
    s.setRotation('a', 45)
    s.setRotation('a', 60)
    s.setRotation('a', 75)
    s.undo()
    expect(item('a').rot).toBe(37)
  })

  it('layouts carry the numeric angle', () => {
    const s = setup()
    s.rotateItem('a', 37)
    s.saveLayout('turned')
    const layout = useStore.getState().savedLayouts.find((l) => l.name === 'turned')!
    expect(layout.placements['a'].rot).toBe(37)
    s.rotateItem('a', 90)
    s.applyLayout(layout)
    expect(item('a').rot).toBe(37)
  })
})
