import { describe, expect, it } from 'vitest'
import { defaultItems, defaultRoom, presetLayouts } from '../data'
import { doorClearance, doorClearanceFor, doorSwing, doorwayRect, footprint, gapBetween, intersects, itemsIntersect, polygonOf, rectOf } from '../geometry'
import { runChecks } from '../checks'
import type { Door, Item, Room } from '../types'

const bed = defaultItems.find((i) => i.id === 'bed')!

const box = (over: Partial<Item>): Item => ({
  id: 'box', name: 'Box', kind: 'box', w: 40, d: 40, h: 80, x: 0, y: 0, rot: 0, color: '#fff', inRoom: true, ...over,
})

describe('geometry', () => {
  it('swaps the footprint when rotated', () => {
    expect(footprint({ w: 100, d: 50, rot: 0 })).toEqual({ fw: 100, fd: 50 })
    expect(footprint({ w: 100, d: 50, rot: 90 })).toEqual({ fw: 50, fd: 100 })
  })

  it('gives the bounding box of a box turned to any angle', () => {
    const { fw, fd } = footprint({ w: 100, d: 100, rot: 45 })
    expect(fw).toBeCloseTo(100 * Math.SQRT2, 6)
    expect(fd).toBeCloseTo(100 * Math.SQRT2, 6)
    const poly = polygonOf(box({ w: 100, d: 100, x: 100, y: 100, rot: 45 }))
    expect(poly).toHaveLength(4)
    expect(poly[0][0]).toBeCloseTo(100, 6)
    expect(poly[0][1]).toBeCloseTo(100 - 50 * Math.SQRT2, 6)
  })

  it('tests turned items by their outline, square ones by their box', () => {
    const a = box({ w: 100, d: 100, x: 200, y: 200, rot: 45 })
    const b = box({ id: 'b', w: 100, d: 100, x: 300, y: 300, rot: 45 })
    expect(intersects(rectOf(a), rectOf(b))).toBe(true)
    expect(itemsIntersect(a, b)).toBe(false)
    expect(itemsIntersect(box({ x: 200, y: 200 }), box({ id: 'b', x: 230, y: 230 }))).toBe(true)
  })

  it('detects overlaps and gaps', () => {
    const a = rectOf({ ...bed, x: 100, y: 100 })
    const b = rectOf({ ...bed, x: 100, y: 100 })
    expect(intersects(a, b)).toBe(true)
    const g = gapBetween({ x0: 0, y0: 0, x1: 10, y1: 100 }, { x0: 40, y0: 0, x1: 50, y1: 100 })
    expect(g).toEqual({ axis: 'x', gap: 30 })
  })

  it('reports the door fully open when nothing is in the way', () => {
    const items: Item[] = defaultItems.map((i) => ({ ...i, inRoom: false }))
    expect(doorClearance(defaultRoom, items).maxAngle).toBe(90)
  })

  it('sweeps an out-swinging door outside the room, mirroring the in-swing arc', () => {
    const door = defaultRoom.doors[0] // bottom wall, hinge at the larger offset
    const inward = doorSwing(defaultRoom, { ...door, swing: 'in' })
    const outward = doorSwing(defaultRoom, { ...door, swing: 'out' })
    expect(inward.hx).toBe(outward.hx)
    expect(inward.hy).toBe(outward.hy)
    expect(inward.leafDir(0)[0]).toBeCloseTo(outward.leafDir(0)[0])
    expect(inward.leafDir(0)[1]).toBeCloseTo(outward.leafDir(0)[1])
    // fully open, the in-swing leaf points into the room (smaller y) and the out-swing leaf away from it
    expect(inward.leafDir(90)[1]).toBeCloseTo(-1)
    expect(outward.leafDir(90)[1]).toBeCloseTo(1)
  })

  it('gives an out-swing door 90° clearance even with an item where the in-swing arc would be', () => {
    const door: Door = { ...defaultRoom.doors[0], swing: 'in' }
    const room: Room = { ...defaultRoom, doors: [door] }
    // the in-swing arc of an 80 cm door on the front wall covers y 290..370 between x 85 and 165
    const blocker = box({ x: 125, y: 340 })
    expect(doorClearanceFor(room, door, [blocker]).maxAngle).toBeLessThan(90)
    expect(doorClearance(room, [blocker]).blocker?.id).toBe('box')

    const out: Room = { ...room, doors: [{ ...door, swing: 'out' }] }
    expect(doorClearanceFor(out, out.doors[0], [blocker]).maxAngle).toBe(90)
    expect(doorClearance(out, [blocker])).toEqual({ maxAngle: 90, blocker: null, door: null })
  })

  it('takes the worst clearance over several doors', () => {
    const d1: Door = { ...defaultRoom.doors[0], id: 'd1' }
    const d2: Door = { id: 'd2', wall: 'left', offset: 100, width: 80, height: 205, sill: 0, hinge: 'left', swing: 'in' }
    const room: Room = { ...defaultRoom, doors: [d1, d2] }
    const blocker = box({ x: 40, y: 150 })
    const c = doorClearance(room, [blocker])
    expect(c.door?.id).toBe('d2')
    expect(c.maxAngle).toBeLessThan(90)
  })

  it('builds the doorway strip 40 cm into the room', () => {
    const door = defaultRoom.doors[0]
    expect(doorwayRect(defaultRoom, door)).toEqual({ x0: 85, y0: 330, x1: 165, y1: 370 })
    expect(doorwayRect(defaultRoom, { ...door, wall: 'left', offset: 20 }, 30)).toEqual({ x0: 0, y0: 20, x1: 30, y1: 100 })
  })
})

describe('checks', () => {
  it('flags an item in front of a radiator under the window in layout A', () => {
    const room = { ...defaultRoom, radiators: [{ id: 'r1', wall: 'top' as const, offset: 75, width: 120, depth: 10, height: 60 }] }
    const items = defaultItems.map((i) => ({ ...i, ...presetLayouts[0].placements[i.id] }))
    const texts = runChecks(room, items).map((c) => c.text)
    expect(texts.some((t) => /radiator/.test(t))).toBe(true)
  })

  it('reports no radiator problems when the room has none', () => {
    const items = defaultItems.map((i) => ({ ...i, ...presetLayouts[0].placements[i.id] }))
    const texts = runChecks(defaultRoom, items).map((c) => c.text)
    expect(texts.some((t) => /radiator/.test(t))).toBe(false)
  })

  it('flags a bed blocking the window in layout C', () => {
    const items = defaultItems.map((i) => ({ ...i, ...presetLayouts[2].placements[i.id] }))
    const texts = runChecks(defaultRoom, items).map((c) => c.text)
    expect(texts.some((t) => /window/.test(t))).toBe(true)
  })
})
