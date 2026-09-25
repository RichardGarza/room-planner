import { describe, expect, it } from 'vitest'
import { defaultItems, defaultRoom, presetLayouts } from '../data'
import { freeWalkPose, sanitizeRoom, useStore, walkBlocked } from '../store'
import type { Item, Room, RoomDoc } from '../types'

const big: Room = {
  ...defaultRoom,
  w: 400,
  d: 400,
  windows: [{ id: 'w1', wall: 'top', offset: 300, width: 100, height: 130, sill: 90 }],
  doors: [{ id: 'd1', wall: 'right', offset: 350, width: 80, height: 205, sill: 0, hinge: 'left', swing: 'in' }],
  radiators: [{ id: 'r1', wall: 'left', offset: 380, width: 60, depth: 10, height: 60 }],
}

describe('sanitizeRoom', () => {
  it('keeps every opening on its wall after the room shrinks', () => {
    const small = sanitizeRoom({ ...big, w: 250, d: 300 })
    expect(small.windows[0]).toMatchObject({ offset: 150, width: 100 })
    expect(small.doors[0]).toMatchObject({ offset: 220, width: 80 })
    expect(small.radiators[0]).toMatchObject({ offset: 240, width: 60 })
    for (const o of [...small.windows, ...small.doors, ...small.radiators]) {
      const len = o.wall === 'top' || o.wall === 'bottom' ? small.w : small.d
      expect(o.offset).toBeGreaterThanOrEqual(0)
      expect(o.offset + o.width).toBeLessThanOrEqual(len)
    }
  })

  it('keeps openings within the room height', () => {
    const low = sanitizeRoom({ ...big, h: 200, windows: [{ ...big.windows[0], height: 250, sill: 100 }] })
    expect(low.windows[0].height).toBe(190)
    expect(low.windows[0].sill).toBe(10)
    expect(sanitizeRoom({ ...big, doors: [{ ...big.doors[0], height: 300 }] }).doors[0].height).toBe(255)
  })

  it('does not change a room that already fits', () => {
    expect(sanitizeRoom(defaultRoom)).toEqual(defaultRoom)
  })
})

describe('opening actions', () => {
  it('adds, updates and removes openings', () => {
    const s = useStore.getState()
    s.setRoom(defaultRoom)
    const id = s.addOpening('window')
    let room = useStore.getState().room
    expect(room.windows).toHaveLength(2)
    const added = room.windows.find((w) => w.id === id)!
    // the back wall (270 wide) is taken by the first window at 60..210, so it goes to the next wall
    expect(added.wall).toBe('left')
    expect(id).toBe('w2')

    // with a wide, empty back wall a new window lands there, centred in the free stretch
    s.setRoom({ ...defaultRoom, w: 600, windows: [], radiators: [] })
    const onBack = s.addOpening('window')
    const back = useStore.getState().room.windows.find((w) => w.id === onBack)!
    expect(back.wall).toBe('top')
    expect(back.offset + back.width / 2).toBe(300)
    s.setRoom(defaultRoom)
    s.addOpening('window')
    room = useStore.getState().room
    expect(room.windows).toHaveLength(2)

    s.updateOpening('window', id, { sill: 120 })
    room = useStore.getState().room
    expect(room.windows.find((w) => w.id === id)?.sill).toBe(120)

    const doorId = s.addOpening('door')
    room = useStore.getState().room
    expect(room.doors).toHaveLength(2)
    const door = room.doors.find((d) => d.id === doorId)!
    expect(door.swing).toBe('in')
    // the new door does not overlap the existing one on the same wall
    for (const other of room.doors) {
      if (other === door || other.wall !== door.wall) continue
      expect(door.offset >= other.offset + other.width || door.offset + door.width <= other.offset).toBe(true)
    }

    s.removeOpening('door', doorId)
    s.removeOpening('window', id)
    room = useStore.getState().room
    expect(room.doors.map((d) => d.id)).toEqual(['d1'])
    expect(room.windows.map((w) => w.id)).toEqual(['w1'])

    const radId = s.addOpening('radiator')
    expect(useStore.getState().room.radiators.map((r) => r.id)).toEqual([radId])
  })

  it('walks to the room centre when there is no door', () => {
    const s = useStore.getState()
    const items = useStore.getState().items
    useStore.setState({ items: [] })
    s.setRoom({ ...defaultRoom, doors: [] })
    s.walkTo('door')
    const p = useStore.getState().walkPose
    expect(p.x).toBe(defaultRoom.w / 2)
    expect(p.y).toBe(defaultRoom.d / 2)
    s.setRoom(defaultRoom)
    useStore.setState({ items })
  })
})

const box = (id: string, x: number, y: number, w = 100, d = 100): Item =>
  ({ id, name: id, kind: 'box', w, d, h: 80, x, y, rot: 0, color: '#ccc', inRoom: true })

describe('walk presets', () => {
  const room: Room = { ...defaultRoom, w: 400, d: 400, doors: [{ id: 'd1', wall: 'bottom', offset: 160, width: 80, height: 205, sill: 0, hinge: 'left', swing: 'in' }], windows: [], radiators: [], closets: [] }

  it('keeps the preset pose when nothing stands there', () => {
    const pose = { x: 200, y: 300, yaw: 0, pitch: -0.05 }
    expect(freeWalkPose(room, [box('far', 60, 60)], pose)).toEqual(pose)
    expect(walkBlocked(room, [], 200, 300)).toBe(false)
    // a rug never blocks
    expect(walkBlocked(room, [{ ...box('rug', 200, 300, 200, 200), kind: 'rug' }], 200, 300)).toBe(false)
  })

  it('moves the pose to the nearest free cell when it starts inside furniture, keeping the yaw', () => {
    const pose = { x: 200, y: 300, yaw: 1.2, pitch: -0.05 }
    const items = [box('bed', 200, 300, 140, 200)] // covers x 130..270, y 200..400
    const moved = freeWalkPose(room, items, pose)
    expect(moved).not.toEqual(pose)
    expect(moved.yaw).toBe(1.2)
    expect(walkBlocked(room, items, moved.x, moved.y)).toBe(false)
    expect(Math.hypot(moved.x - pose.x, moved.y - pose.y)).toBeLessThanOrEqual(150)
    // the nearest free cell: just left of the bed's 12 cm gap (x < 118), same y
    expect(moved.y).toBe(300)
    expect(moved.x).toBe(110)
  })

  it('walkTo(door) never starts inside a solid piece', () => {
    const s = useStore.getState()
    useStore.setState({ items: [] })
    s.setRoom(room)
    // block the spot in front of the door (x 200, y = 400 - min(100, 133) = 300)
    useStore.setState({ items: [box('chest', 200, 300, 120, 120)] })
    s.walkTo('door')
    const p = useStore.getState().walkPose
    expect(p.yaw).toBe(0)
    expect(walkBlocked(room, useStore.getState().items, p.x, p.y)).toBe(false)
    expect(useStore.getState().view).toBe('walk')
    s.setRoom(defaultRoom)
    useStore.setState({ items: [] })
  })
})

describe('undo / redo', () => {
  it('keeps restored furniture inside a room that shrank in between', () => {
    const s = useStore.getState()
    useStore.setState({ items: [], history: [], future: [] })
    s.setRoom({ ...defaultRoom, w: 600, d: 600, windows: [], doors: [], radiators: [], closets: [] })
    const id = s.addItem({ name: 'Chest', kind: 'box', w: 100, d: 100, h: 80, color: '#ccc' }, { x: 300, y: 300 })
    s.snapshot()
    s.moveItem(id, 550, 550)
    expect(useStore.getState().items[0]).toMatchObject({ x: 550, y: 550 })
    s.snapshot()
    s.moveItem(id, 100, 100)
    s.setRoom({ w: 300, d: 300 })
    // the snapshot has the chest at 550/550, which is now outside the walls
    s.undo()
    const after = useStore.getState().items[0]
    expect(after.x).toBe(250)
    expect(after.y).toBe(250)
    expect(useStore.getState().room.w).toBe(300)
    s.redo()
    expect(useStore.getState().items[0]).toMatchObject({ x: 100, y: 100 })
    s.setRoom(defaultRoom)
    useStore.setState({ items: [], history: [], future: [] })
  })
})

describe('hydrate', () => {
  const doc = (items: Item[]): RoomDoc => ({
    id: 'r', name: 'R', group: '', notes: '', createdAt: '', updatedAt: '',
    room: defaultRoom, items, layouts: [],
    settings: { daytime: true, doorAngle: 70, blinds: 40, bedding: true, walkHeight: 'adult', quality: 'best' },
    version: 2,
  })

  it('recognises a preset that parks some items, wherever the parked ones were stored', () => {
    const withParked = presetLayouts.find((l) => Object.values(l.placements).some((p) => !p.inRoom))!
    const items = defaultItems.map((i) => ({ ...i, ...withParked.placements[i.id] }))
    useStore.getState().hydrate(doc(items))
    expect(useStore.getState().activeLayoutId).toBe(withParked.id)
    // a parked item saved with park()'s own coordinates still counts
    const parkedId = items.find((i) => !i.inRoom)!.id
    const moved = items.map((i) => (i.id === parkedId ? { ...i, x: 999, y: 999 } : i))
    useStore.getState().hydrate(doc(moved))
    expect(useStore.getState().activeLayoutId).toBe(withParked.id)
    // but a parked item put back in the room does not
    const back = items.map((i) => (i.id === parkedId ? { ...i, inRoom: true } : i))
    useStore.getState().hydrate(doc(back))
    expect(useStore.getState().activeLayoutId).toBeNull()
    // and an in-room item off its spot does not either
    const inRoomId = items.find((i) => i.inRoom)!.id
    const off = items.map((i) => (i.id === inRoomId ? { ...i, x: i.x + 5 } : i))
    useStore.getState().hydrate(doc(off))
    expect(useStore.getState().activeLayoutId).toBeNull()
    useStore.setState({ items: [], history: [], future: [] })
  })
})
