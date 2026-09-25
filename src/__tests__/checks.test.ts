import { describe, expect, it } from 'vitest'
import { runChecks } from '../checks'
import { defaultRoom } from '../data'
import type { Item, Opening, Room } from '../types'

const item = (over: Partial<Item>): Item => ({
  id: 'it', name: 'Dresser', kind: 'dresser', w: 100, d: 50, h: 80, x: 150, y: 25, rot: 0, color: '#fff', inRoom: true, ...over,
})

const window = (over: Partial<Opening> = {}): Opening => ({ id: 'w1', wall: 'top', offset: 100, width: 100, height: 120, sill: 90, ...over })

/** A bare 300 × 400 room with an out-swinging door on the front wall and no radiator. */
const room: Room = {
  ...defaultRoom,
  w: 300,
  d: 400,
  windows: [window()],
  doors: [{ id: 'd1', wall: 'bottom', offset: 100, width: 80, height: 205, sill: 0, hinge: 'left', swing: 'out' }],
  radiators: [],
}

const texts = (r: Room, items: Item[]) => runChecks(r, items).map((c) => `${c.level}: ${c.text}`)

describe('window fit', () => {
  it('says an 80 cm dresser fits under a 90 cm sill', () => {
    const t = texts(room, [item({ h: 80 })])
    expect(t).toContain('ok: Dresser fits under the window with 10 cm to spare')
  })

  it('warns when a 130 cm chest stands above the sill', () => {
    const t = texts(room, [item({ name: 'Chest', h: 130 })])
    expect(t).toContain('warn: Chest stands 40 cm above the window sill')
  })

  it('reports a tall wardrobe as blocking the window', () => {
    const t = texts(room, [item({ name: 'Wardrobe', h: 200 })])
    expect(t).toContain('bad: Wardrobe blocks the window')
  })

  it('ignores items that are away from the wall or beside the window', () => {
    expect(texts(room, [item({ y: 60 })]).some((t) => /window/.test(t))).toBe(false)
    expect(texts(room, [item({ x: 40 })]).some((t) => /window/.test(t))).toBe(false)
  })

  it('still counts an item pushed up against a radiator under the window', () => {
    const withRad: Room = { ...room, radiators: [{ id: 'r1', wall: 'top', offset: 110, width: 80, depth: 10, height: 60 }] }
    const t = texts(withRad, [item({ h: 130, y: 12 + 25 })])
    expect(t.some((s) => /above the window sill/.test(s))).toBe(true)
  })

  it('checks every window and numbers them', () => {
    const two: Room = { ...room, windows: [window({ id: 'w1', offset: 20, width: 80 }), window({ id: 'w2', offset: 200, width: 80, sill: 100 })] }
    const t = texts(two, [item({ id: 'a', name: 'Dresser', x: 60, w: 80 }), item({ id: 'b', name: 'Chest', x: 240, w: 80, h: 130 })])
    expect(t).toContain('ok: Dresser fits under window 1 with 10 cm to spare')
    expect(t).toContain('warn: Chest stands 30 cm above the sill of window 2')
  })
})

describe('doors', () => {
  it('flags an item standing in the doorway strip of an out-swinging door', () => {
    const t = texts(room, [item({ name: 'Bookcase', kind: 'bookcase', x: 140, y: 380, w: 60, d: 30 })])
    expect(t).toContain('bad: Bookcase blocks the doorway')
    expect(t.some((s) => /Wide, clear entry/.test(s))).toBe(false)
  })

  it('does not run swing clearance for an out-swinging door', () => {
    // right in the sweep an in-swinging leaf would make, but clear of the 40 cm doorway strip
    const t = texts(room, [item({ name: 'Box', kind: 'box', x: 140, y: 340, w: 40, d: 40 })])
    expect(t.some((s) => /only opens to/.test(s))).toBe(false)
    expect(t).toContain('ok: Wide, clear entry into the room')
  })

  it('keeps the swing clearance for an in-swinging door', () => {
    const inward: Room = { ...room, doors: [{ ...room.doors[0], swing: 'in' }] }
    const t = texts(inward, [item({ name: 'Box', kind: 'box', x: 140, y: 340, w: 40, d: 40 })])
    expect(t.some((s) => /Door only opens to \d+° — Box is in the way/.test(s))).toBe(true)
  })

  it('numbers doors when there are several', () => {
    const two: Room = { ...room, doors: [room.doors[0], { ...room.doors[0], id: 'd2', wall: 'left', offset: 200, swing: 'in' }] }
    const t = texts(two, [])
    expect(t).toContain('ok: Clear entry through door 1')
    expect(t).toContain('ok: Clear entry through door 2')
  })
})

describe('radiators', () => {
  it('names each radiator', () => {
    const two: Room = {
      ...room,
      radiators: [
        { id: 'r1', wall: 'top', offset: 0, width: 60, depth: 10, height: 60 },
        { id: 'r2', wall: 'right', offset: 100, width: 80, depth: 10, height: 60 },
      ],
    }
    const t = texts(two, [item({ x: 30, y: 25, w: 60, d: 40 })])
    expect(t).toContain('warn: Dresser is in front of radiator 1')
    expect(t.some((s) => /radiator 2/.test(s))).toBe(false)
  })
})
