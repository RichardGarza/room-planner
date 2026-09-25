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

describe('length formatting', () => {
  const inches = (cm: number) => `${Math.round(cm / 2.54)} in`
  it('renders every length in the texts through the formatter', () => {
    const fits = runChecks(room, [item({ h: 80 })], { len: inches }).map((c) => c.text)
    expect(fits).toContain('Dresser fits under the window with 4 in to spare')
    const above = runChecks(room, [item({ name: 'Chest', h: 130 })], { len: inches }).map((c) => c.text)
    expect(above).toContain('Chest stands 16 in above the window sill')
    const bed = item({ id: 'bed', name: 'Bed', kind: 'bed', w: 140, d: 200, x: 150, y: 200 })
    const passage = runChecks(room, [item({ h: 80 }), bed], { len: inches }).map((c) => c.text)
    expect(passage).toContain('Passage between dresser and bed: 20 in')
    for (const t of [...fits, ...above, ...passage]) expect(t).not.toMatch(/\d cm\b/)
  })
  it('keeps "N cm" without a formatter', () => {
    expect(texts(room, [item({ h: 80 })])).toContain('ok: Dresser fits under the window with 10 cm to spare')
  })
})

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

describe('access space', () => {
  const dresser = (over: Partial<Item> = {}) => item({ id: 'dr', name: 'Dresser', kind: 'dresser', w: 100, d: 50, h: 80, x: 150, y: 25, rot: 0, ...over })
  it('warns when a chair stands in front of a dresser, naming it and the gap', () => {
    const chair = item({ id: 'ch', name: 'Chair', kind: 'chair', w: 50, d: 50, h: 90, x: 150, y: 95 })
    expect(texts(room, [dresser(), chair])).toContain("warn: Drawers can't open: chair is 20 cm in front of the dresser")
    const inches = runChecks(room, [dresser(), chair], { len: (cm) => `${Math.round(cm / 2.54)} in` }).map((c) => c.text)
    expect(inches).toContain("Drawers can't open: chair is 8 in in front of the dresser")
    const flush = item({ id: 'ch', name: 'Chair', kind: 'chair', w: 50, d: 50, h: 90, x: 150, y: 75 })
    expect(texts(room, [dresser(), flush])).toContain("warn: Drawers can't open: chair is right in front of the dresser")
    // 45 cm and further away is fine
    const away = item({ id: 'ch', name: 'Chair', kind: 'chair', w: 50, d: 50, h: 90, x: 150, y: 121 })
    expect(texts(room, [dresser(), away]).some((t) => /Drawers/.test(t))).toBe(false)
  })
  it('uses the right words for wardrobes, shelves, desks, sofas and tables', () => {
    const box = (x: number, y: number) => item({ id: 'bx', name: 'Box', kind: 'box', w: 40, d: 40, h: 40, x, y })
    expect(texts(room, [item({ id: 'w', name: 'Wardrobe', kind: 'wardrobe', w: 100, d: 60, h: 200, x: 150, y: 30 }), box(150, 80)])).toContain("warn: Wardrobe doors can't open: box is right in front of the wardrobe")
    expect(texts(room, [item({ id: 'b', name: 'Billy', kind: 'bookcase', w: 80, d: 28, h: 202, x: 150, y: 14 }), box(150, 50)])).toContain("warn: Can't reach the shelves: box is 2 cm in front of the billy")
    expect(texts(room, [item({ id: 'd', name: 'Desk', kind: 'desk', w: 100, d: 50, h: 75, x: 150, y: 25 }), box(150, 90)])).toContain('warn: Nothing can pull up to the desk: box is 20 cm in front of the desk')
    expect(texts(room, [item({ id: 's', name: 'Sofa', kind: 'sofa', w: 180, d: 90, h: 85, x: 150, y: 45 }), box(150, 120)])).toContain('warn: No legroom in front of the sofa: box is 10 cm in front of the sofa')
    expect(texts(room, [item({ id: 't', name: 'Dining table', kind: 'table', w: 160, d: 90, h: 75, x: 150, y: 200 }), box(150, 270)])).toContain('warn: No room to sit at the dining table: box is 5 cm in front of the dining table')
    // something at the end of a dining table is "beside"
    expect(texts(room, [item({ id: 't', name: 'Dining table', kind: 'table', w: 160, d: 90, h: 75, x: 150, y: 200 }), box(255, 200)])).toContain('warn: No room to sit at the dining table: box is 5 cm beside the dining table')
  })
  it('lets the desk chair, a nightstand by the bed and a low table by the sofa be', () => {
    const desk = item({ id: 'd', name: 'Desk', kind: 'desk', w: 100, d: 50, h: 75, x: 150, y: 25 })
    const chair = item({ id: 'c', name: 'Chair', kind: 'chair', w: 50, d: 50, h: 90, x: 150, y: 65 })
    expect(texts(room, [desk, chair]).some((t) => /pull up/.test(t))).toBe(false)
    const bed = item({ id: 'bed', name: 'Bed', kind: 'bed', w: 140, d: 200, x: 150, y: 100, rot: 0 })
    const ns = item({ id: 'ns', name: 'Nightstand', kind: 'nightstand', w: 40, d: 40, h: 55, x: 240, y: 20 })
    expect(texts(room, [bed, ns]).some((t) => /Can't get to/.test(t))).toBe(false)
    const sofa = item({ id: 's', name: 'Sofa', kind: 'sofa', w: 180, d: 90, h: 85, x: 150, y: 45 })
    const coffee = item({ id: 'ct', name: 'Coffee table', kind: 'table', w: 100, d: 60, h: 45, x: 150, y: 130 })
    expect(texts(room, [sofa, coffee]).some((t) => /legroom/.test(t))).toBe(false)
    const tall = item({ id: 'ct', name: 'High table', kind: 'table', w: 100, d: 60, h: 75, x: 150, y: 130 })
    expect(texts(room, [sofa, tall]).some((t) => /legroom/.test(t))).toBe(true)
  })
  it('warns about a dresser facing the wall', () => {
    expect(texts(room, [dresser({ rot: 180 })])).toContain("warn: Drawers can't open: the dresser faces the wall")
    expect(texts(room, [dresser()]).some((t) => /faces the wall/.test(t))).toBe(false)
  })
  it('only asks for one free long side of a crib', () => {
    // crib along the back wall: back to the wall, front open
    const crib = item({ id: 'crib', name: 'Crib', kind: 'bed', w: 137, d: 76, h: 89, x: 150, y: 38, rot: 0 })
    expect(texts(room, [crib]).some((t) => /Can't get to the crib/.test(t))).toBe(false)
    // a dresser right along its front (most of the strip) closes the only open side
    const front = item({ id: 'dr', name: 'Dresser', kind: 'dresser', w: 140, d: 45, h: 80, x: 150, y: 100, rot: 180 })
    expect(texts(room, [crib, front])).toContain("warn: Can't get to the crib from either side: dresser is in the way")
    // clipping a corner of the strip is fine
    const corner = item({ id: 'dr', name: 'Dresser', kind: 'dresser', w: 60, d: 45, h: 80, x: 240, y: 100, rot: 180 })
    expect(texts(room, [crib, corner]).some((t) => /Can't get to the crib/.test(t))).toBe(false)
  })
  it('judges turned pieces by their real outline', () => {
    // a dresser turned 45°: a box off its bounding box but inside the turned front strip
    const turned = item({ id: 'dr', name: 'Dresser', kind: 'dresser', w: 100, d: 50, h: 80, x: 150, y: 150, rot: 45 })
    const inFront = item({ id: 'bx', name: 'Box', kind: 'box', w: 30, d: 30, h: 40, x: 150 - 45 * Math.SQRT1_2 + 5, y: 150 + 45 * Math.SQRT1_2 + 5 })
    expect(texts(room, [turned, inFront]).some((t) => /Drawers can't open: box/.test(t))).toBe(true)
    const behind = item({ id: 'bx', name: 'Box', kind: 'box', w: 30, d: 30, h: 40, x: 150 + 45 * Math.SQRT1_2 + 5, y: 150 - 45 * Math.SQRT1_2 - 5 })
    expect(texts(room, [turned, behind]).some((t) => /Drawers/.test(t))).toBe(false)
  })
})

describe('ceiling', () => {
  it('flags a piece taller than the room', () => {
    const low: Room = { ...room, h: 230 }
    const pax = item({ id: 'p', name: 'IKEA PAX', kind: 'wardrobe', w: 100, d: 58, h: 236, x: 150, y: 29 })
    expect(texts(low, [pax])).toContain('bad: IKEA PAX is 6 cm taller than the ceiling')
    expect(runChecks(low, [pax], { len: (cm) => `${Math.round(cm / 2.54)} in` }).map((c) => c.text)).toContain('IKEA PAX is 2 in taller than the ceiling')
    expect(texts({ ...room, h: 236 }, [pax]).some((t) => /ceiling/.test(t))).toBe(false)
    expect(texts(low, [{ ...pax, inRoom: false }]).some((t) => /ceiling/.test(t))).toBe(false)
  })
})
