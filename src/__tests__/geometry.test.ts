import { describe, expect, it } from 'vitest'
import { defaultItems, defaultRoom, presetLayouts } from '../data'
import { accessAllows, accessRuleFor, accessRules, accessZones, areCompanions, doorClearance, doorClearanceFor, doorSwing, doorwayRect, footprint, frontZone, gapBetween, intersects, isSideTable, itemsGap, itemsIntersect, polygonDistance, polygonOf, rectOf } from '../geometry'
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

describe('access space', () => {
  const piece = (over: Partial<Item>): Item => ({ id: 'p', name: 'p', kind: 'dresser', w: 100, d: 50, h: 80, x: 150, y: 100, rot: 0, color: '#fff', inRoom: true, ...over })
  it('puts the front strip beyond the +d edge and turns it with the item', () => {
    expect(frontZone(piece({}))).toEqual([[100, 125], [200, 125], [200, 170], [100, 170]])
    // rot 90: the front faces −x, so the strip lies at x 80..125 beside the left edge
    expect(frontZone(piece({ rot: 90 }))).toEqual([[125, 50], [125, 150], [80, 150], [80, 50]])
    // any angle: the strip keeps its size and lies against the turned front edge
    const turned = frontZone(piece({ rot: 30 }), 40)
    const len = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1])
    expect(len(turned[0], turned[1])).toBeCloseTo(100)
    expect(len(turned[1], turned[2])).toBeCloseTo(40)
    const front = polygonOf(piece({ rot: 30 })).slice(2) // corners 2 and 3 are the +d edge
    expect(len(turned[0], front[1])).toBeCloseTo(0)
    expect(len(turned[1], front[0])).toBeCloseTo(0)
  })
  it('knows the rules per kind', () => {
    expect(accessRules.dresser).toMatchObject({ depth: 45 })
    expect(accessRules.wardrobe).toMatchObject({ depth: 65 })
    expect(accessRules.bookcase).toMatchObject({ depth: 40 })
    expect(accessRules.desk).toMatchObject({ depth: 55 })
    expect(accessRules.sofa).toMatchObject({ depth: 60 })
    expect(accessRules.chair).toBeNull()
    expect(accessRuleFor({ kind: 'table', w: 160, d: 90 })).toMatchObject({ depth: 60, faces: 'all', mode: 'all' })
    expect(accessRuleFor({ kind: 'table', w: 50, d: 50 })).toMatchObject({ depth: 45, mode: 'any' })
    expect(accessRuleFor({ kind: 'bed', w: 150, d: 210 })).toMatchObject({ depth: 60, faces: 'long', mode: 'any' })
    // a bed's long sides: left/right when it is longer than wide, front/back for a crib stored the other way round
    expect(accessZones(piece({ kind: 'bed', w: 150, d: 210 }))!.zones.map((z) => z.face)).toEqual(['left', 'right'])
    expect(accessZones(piece({ kind: 'bed', w: 137, d: 76 }))!.zones.map((z) => z.face)).toEqual(['front', 'back'])
    expect(accessZones(piece({ kind: 'table', w: 160, d: 90 }))!.zones).toHaveLength(4)
    expect(accessZones(piece({ kind: 'rug' }))).toBeNull()
  })
  it('names companions and who may stand in whose space', () => {
    const bed = piece({ kind: 'bed', w: 150, d: 210 }), ns = piece({ kind: 'nightstand', w: 40, d: 40 })
    const desk = piece({ kind: 'desk' }), chair = piece({ kind: 'chair', w: 50, d: 50 })
    const sofa = piece({ kind: 'sofa', w: 180, d: 90 }), side = piece({ kind: 'table', w: 50, d: 50 }), dining = piece({ kind: 'table', w: 160, d: 90 })
    const rug = piece({ kind: 'rug' })
    expect(areCompanions(bed, ns)).toBe(true)
    expect(areCompanions(chair, desk)).toBe(true)
    expect(areCompanions(chair, dining)).toBe(true)
    expect(areCompanions(side, sofa)).toBe(true)
    expect(areCompanions(ns, sofa)).toBe(true)
    expect(areCompanions(rug, desk)).toBe(true)
    expect(areCompanions(bed, desk)).toBe(false)
    expect(areCompanions(dining, sofa)).toBe(false)
    expect(isSideTable(side)).toBe(true)
    expect(isSideTable(dining)).toBe(false)
    expect(accessAllows(sofa, piece({ kind: 'table', w: 100, d: 60, h: 45 }))).toBe(true)
    expect(accessAllows(sofa, piece({ kind: 'table', w: 100, d: 60, h: 75 }))).toBe(false)
    expect(accessAllows(desk, chair)).toBe(true)
    expect(accessAllows(desk, ns)).toBe(false)
  })
  it('measures gaps between turned outlines', () => {
    const a = piece({ x: 100, y: 100, rot: 0, w: 100, d: 50 })
    const b = piece({ id: 'b', x: 200, y: 100, rot: 0, w: 50, d: 50 })
    expect(itemsGap(a, b)).toBe(25)
    expect(itemsGap(a, piece({ id: 'b', x: 140, y: 100 }))).toBe(0)
    // a square turned 45° reaches further: its corner comes 25·√2 from its centre instead of 25
    const diamond = piece({ id: 'b', x: 200, y: 100, rot: 45, w: 50, d: 50 })
    expect(itemsGap(a, diamond)).toBeCloseTo(50 - 25 * Math.SQRT2, 5)
    expect(polygonDistance(polygonOf(a), polygonOf(diamond))).toBeCloseTo(50 - 25 * Math.SQRT2, 5)
  })
})
