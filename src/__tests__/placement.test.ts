import { describe, expect, it } from 'vitest'
import { defaultItems, defaultRoom, makeEmptyRoom, presetLayouts } from '../data'
import { doorClearance, intersects, rectOf } from '../geometry'
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
    expect(d).toEqual({ x: 50, y: 25, rot: 0 })
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

  it('falls back to the room centre when nothing is free', () => {
    const room = makeEmptyRoom('t', 200, 300)
    const full = box('full', 200, 300, 100, 150)
    expect(findFreeSpot(room, [full], 60, 60)).toEqual({ x: 100, y: 150, rot: 0 })
    // and when the item is too big for the room whichever way it is turned
    expect(findFreeSpot(room, [], 250, 250)).toEqual({ x: 100, y: 150, rot: 0 })
  })

  it('works outwards from the middle when asked to', () => {
    const room = makeEmptyRoom('t', 300, 400)
    expect(findFreeSpot(room, [], 120, 120, { prefer: 'centre' })).toEqual({ x: 150, y: 200, rot: 0 })
  })
})

describe('isRugKind', () => {
  it('treats both rug kinds as rugs', () => {
    expect(isRugKind('rug')).toBe(true)
    expect(isRugKind('rugRect')).toBe(true)
    expect(isRugKind('bed')).toBe(false)
  })
})
