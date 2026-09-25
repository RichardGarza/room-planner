import { describe, expect, it } from 'vitest'
import { defaultRoom } from '../data'
import { sanitizeRoom, useStore } from '../store'
import type { Room } from '../types'

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
    s.setRoom({ ...defaultRoom, doors: [] })
    s.walkTo('door')
    const p = useStore.getState().walkPose
    expect(p.x).toBe(defaultRoom.w / 2)
    expect(p.y).toBe(defaultRoom.d / 2)
    s.setRoom(defaultRoom)
  })
})
