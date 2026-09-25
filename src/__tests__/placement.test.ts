import { describe, expect, it } from 'vitest'
import { defaultItems, defaultRoom, makeEmptyRoom, presetLayouts } from '../data'
import { doorClearance, frontZone, intersects, polygonOf, polygonsIntersect, rectOf } from '../geometry'
import { findFreeSpot, isRugKind, type Spot } from '../placement'
import type { Item, Rect, Room } from '../types'

function box(id: string, w: number, d: number, x: number, y: number, h = 80, kind: Item['kind'] = 'box'): Item {
  return { id, name: id, kind, w, d, h, x, y, rot: 0, color: '#ffffff', inRoom: true }
}
const placed = (spot: Spot, w: number, d: number, h = 80): Item => ({ ...box('new', w, d, spot.x, spot.y, h), rot: spot.rot })
const insideRoom = (room: Room, r: Rect) => r.x0 >= 0 && r.y0 >= 0 && r.x1 <= room.w && r.y1 <= room.d
const overlapsAny = (r: Rect, items: Item[]) => items.some((i) => i.inRoom && !isRugKind(i.kind) && intersects(rectOf(i), r))
const touchesWall = (room: Room, r: Rect) => r.x0 === 0 || r.y0 === 0 || r.x1 === room.w || r.y1 === room.d

describe('findFreeSpot', () => {
  it('finds a spot in layout A that is inside the room, clear of furniture and of the door swing', () => {
    const items = defaultItems.map((i) => ({ ...i, ...presetLayouts[0].placements[i.id] }))
    const spot = findFreeSpot(defaultRoom, items, 40, 40, { h: 55 })
    const it = placed(spot, 40, 40, 55)
    const r = rectOf(it)
    expect(insideRoom(defaultRoom, r)).toBe(true)
    expect(overlapsAny(r, items)).toBe(false)
    expect(touchesWall(defaultRoom, r)).toBe(true)
    expect(doorClearance(defaultRoom, [...items, it]).maxAngle).toBe(90)
    expect([0, 90, 180, 270]).toContain(spot.rot)
  })

  it('prefers a wall and turns the back of the item to it', () => {
    const room = makeEmptyRoom('t', 300, 400)
    // a tall wardrobe keeps off the window, so it goes to the left wall, back to the wall
    const w = findFreeSpot(room, [], 100, 58, { h: 200 })
    const wr = rectOf(placed(w, 100, 58, 200))
    expect(wr.x0).toBe(0)
    expect(w.rot).toBe(270)
    expect(wr.x1 - wr.x0).toBe(58)
    // a short desk is fine under the window wall and stays unturned in the corner
    const d = findFreeSpot(room, [], 100, 50, { h: 75 })
    expect(d).toEqual({ x: 50, y: 25, rot: 0, fits: true })
  })

  it('keeps out of the door swing', () => {
    const room = makeEmptyRoom('t', 200, 300) // door on the front wall, hinge at x=100, swing over x 20..100
    const wall = box('a', 200, 200, 100, 100)
    const spot = findFreeSpot(room, [wall], 60, 60)
    const it = placed(spot, 60, 60)
    const r = rectOf(it)
    expect(insideRoom(room, r)).toBe(true)
    expect(overlapsAny(r, [wall])).toBe(false)
    expect(r.x0).toBeGreaterThanOrEqual(100)
    expect(doorClearance(room, [wall, it]).maxAngle).toBe(90)
  })

  it('uses the grid when every wall is taken', () => {
    const room = makeEmptyRoom('t', 300, 300)
    const strips = [box('t', 300, 20, 150, 10), box('b', 300, 20, 150, 290), box('l', 20, 260, 10, 150), box('r', 20, 260, 290, 150)]
    const spot = findFreeSpot(room, strips, 60, 40)
    const r = rectOf(placed(spot, 60, 40))
    expect(insideRoom(room, r)).toBe(true)
    expect(overlapsAny(r, strips)).toBe(false)
    expect(touchesWall(room, r)).toBe(false)
  })

  it('ignores rugs when looking for space', () => {
    const room = makeEmptyRoom('t', 300, 400)
    const rug = box('rug', 300, 400, 150, 200, 1, 'rugRect')
    const spot = findFreeSpot(room, [rug], 80, 45)
    expect(touchesWall(room, rectOf(placed(spot, 80, 45)))).toBe(true)
  })

  it('falls back to the room centre, with fits false, when nothing is free', () => {
    const room = makeEmptyRoom('t', 200, 300)
    const halves = [box('a', 200, 150, 100, 75), box('b', 200, 150, 100, 225)]
    expect(findFreeSpot(room, halves, 60, 60)).toEqual({ x: 100, y: 150, rot: 0, fits: false })
    // and when the item is too big for the room whichever way it is turned
    expect(findFreeSpot(room, [], 250, 250)).toEqual({ x: 100, y: 150, rot: 0, fits: false })
  })

  it('staggers the pieces that fall back on the centre by 20 cm so none lands on another', () => {
    const room = makeEmptyRoom('t', 200, 300)
    const full = box('full', 200, 300, 100, 150)
    const first = findFreeSpot(room, [full], 60, 60)
    expect(first).toEqual({ x: 120, y: 170, rot: 0, fits: false })
    const second = findFreeSpot(room, [full, placed(first, 60, 60)], 60, 60)
    expect(second).toEqual({ x: 80, y: 130, rot: 0, fits: false })
    const third = findFreeSpot(room, [full, placed(first, 60, 60), { ...placed(second, 60, 60), id: 'new2' }], 60, 60)
    expect(third).toEqual({ x: 140, y: 190, rot: 0, fits: false })
  })

  it('prefers a spot on top of nothing (even in the door swing) over the centre, but does not call it a fit', () => {
    // a 200 × 300 room: everything but the door corner (x 0..100, y 220..300) is covered
    const room = makeEmptyRoom('t', 200, 300)
    const blocks = [box('top', 200, 220, 100, 110), box('br', 100, 80, 150, 260)]
    const spot = findFreeSpot(room, blocks, 60, 60)
    expect(spot.fits).toBe(false)
    const r = rectOf(placed(spot, 60, 60))
    expect(insideRoom(room, r)).toBe(true)
    expect(overlapsAny(r, blocks)).toBe(false)
    expect(r.x1).toBeLessThanOrEqual(100)
    expect(r.y0).toBeGreaterThanOrEqual(220)
  })

  it('reports a full room as not fitting and stays quick about it', () => {
    const items = defaultItems.map((i) => ({ ...i, ...presetLayouts[0].placements[i.id] }))
    const t0 = performance.now()
    const spot = findFreeSpot(defaultRoom, items, 100, 58, { h: 200, kind: 'wardrobe' })
    expect(performance.now() - t0).toBeLessThan(100)
    expect(spot.fits).toBe(false)
    // the least bad place is still on top of nothing
    expect(overlapsAny(rectOf(placed(spot, 100, 58, 200)), items)).toBe(false)
    // while a small thing still finds a proper spot
    expect(findFreeSpot(defaultRoom, items, 30, 30, { h: 30, kind: 'box' }).fits).toBe(true)
  })

  it('keeps 45 cm past the foot of a bed for furniture, so a dresser does not butt against it', () => {
    const room = makeEmptyRoom('t', 300, 400)
    // bed head to the back wall, foot at y = 210; wardrobes take the whole side walls and the door the front one,
    // so the floor grid is all that is left
    const bed = box('bed', 150, 210, 150, 105, 95, 'bed')
    const items = [bed, box('wl', 58, 400, 29, 200, 200, 'wardrobe'), box('wr', 58, 400, 271, 200, 200, 'wardrobe')]
    const spot = findFreeSpot(room, items, 160, 48, { h: 85, kind: 'dresser' })
    expect(spot.fits).toBe(true)
    const r = rectOf(placed(spot, 160, 48, 85))
    expect(overlapsAny(r, items)).toBe(false)
    const foot = rectOf(bed).y1
    expect(r.y0).toBeGreaterThanOrEqual(foot + 45)
    // the strip is a preference, not a wall: when only the foot is left, the piece still goes there
    const tight = [...items, box('bottom', 184, 100, 150, 350)]
    const squeezed = findFreeSpot(room, tight, 160, 48, { h: 85, kind: 'dresser' })
    expect(squeezed.fits).toBe(true)
    expect(overlapsAny(rectOf(placed(squeezed, 160, 48, 85)), tight)).toBe(false)
  })

  it('works outwards from the middle when asked to', () => {
    const room = makeEmptyRoom('t', 300, 400)
    expect(findFreeSpot(room, [], 120, 120, { prefer: 'centre' })).toEqual({ x: 150, y: 200, rot: 0, fits: true })
  })
})

describe('isRugKind', () => {
  it('treats both rug kinds as rugs', () => {
    expect(isRugKind('rug')).toBe(true)
    expect(isRugKind('rugRect')).toBe(true)
    expect(isRugKind('bed')).toBe(false)
  })
})

describe('access space in findFreeSpot', () => {
  it('keeps a new piece out of the space in front of a dresser, and its own front facing the room', () => {
    const room = makeEmptyRoom('t', 300, 400)
    // a dresser on the left wall, drawers facing right: x 0..48 needs x 48..93 free along y 120..280
    const dresser: Item = { ...box('dresser', 160, 48, 24, 200, 85, 'dresser'), rot: 270 }
    const spot = findFreeSpot(room, [dresser], 80, 28, { h: 202, kind: 'bookcase' })
    const it = { ...placed(spot, 80, 28, 202), kind: 'bookcase' as const }
    const r = rectOf(it)
    expect(spot.fits).toBe(true)
    expect(r.x0 < 93 && r.y1 > 120 && r.y0 < 280, 'clear of the drawers').toBe(false)
    // its own shelves face into the room: the 40 cm strip in front is inside the room and clear
    const front = frontZone(it)
    for (const [x, y] of front) {
      expect(x).toBeGreaterThanOrEqual(-0.01)
      expect(y).toBeGreaterThanOrEqual(-0.01)
      expect(x).toBeLessThanOrEqual(room.w + 0.01)
      expect(y).toBeLessThanOrEqual(room.d + 0.01)
    }
    expect(polygonsIntersect(front, polygonOf(dresser))).toBe(false)
  })
  it('still lets the desk chair go in front of the desk', () => {
    const room = makeEmptyRoom('t', 300, 400)
    const desk: Item = box('desk', 100, 50, 150, 25, 75, 'desk')
    const spot = findFreeSpot(room, [desk], 56, 56, { h: 86, kind: 'chair' })
    expect(spot.fits).toBe(true)
  })
})
