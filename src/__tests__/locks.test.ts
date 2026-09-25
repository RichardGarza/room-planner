import { beforeEach, describe, expect, it } from 'vitest'
import { makeEmptyRoom } from '../data'
import { useStore } from '../store'
import { suggestLayouts } from '../suggest'
import type { Item, RoomDoc } from '../types'

function item(id: string, kind: Item['kind'], w: number, d: number, h: number, x: number, y: number, rot = 0, extra: Partial<Item> = {}): Item {
  return { id, name: id, kind, w, d, h, x, y, rot, color: '#ffffff', inRoom: true, ...extra }
}

const room = makeEmptyRoom('Locks', 300, 400)
const items = (): Item[] => [
  item('bed', 'bed', 150, 210, 95, 150, 105),
  item('dresser', 'dresser', 160, 48, 85, 24, 300, 270, { locked: true }),
  item('desk', 'desk', 100, 50, 75, 250, 25),
  item('chair', 'chair', 56, 56, 86, 250, 60, 180),
  item('rug', 'rug', 160, 160, 1, 150, 300),
]

const doc = (): RoomDoc => ({
  id: 'r', name: 'Locks', group: '', notes: '', createdAt: '', updatedAt: '', version: 1,
  room, items: items(), layouts: [],
  settings: { daytime: true, doorAngle: 70, blinds: 40, bedding: true, walkHeight: 'adult', quality: 'best' },
})

const dresser = () => useStore.getState().items.find((i) => i.id === 'dresser')!

describe('locked pieces in the store', () => {
  beforeEach(() => useStore.getState().hydrate(doc()))

  it('cannot be dragged, moved or turned', () => {
    const s = useStore.getState()
    const before = { ...dresser() }
    s.dragTo('dresser', 200, 200)
    expect(dresser()).toEqual(before)
    s.dragTo('dresser', 100, 480) // below the room: would park it
    expect(dresser()).toEqual(before)
    s.moveItem('dresser', 120, 120)
    expect(dresser()).toEqual(before)
    s.rotateItem('dresser', 90)
    expect(dresser()).toEqual(before)
    s.setRotation('dresser', 45)
    expect(dresser()).toEqual(before)
    // and the store is left untouched, not just the item (no undo entry, no layout reset)
    expect(useStore.getState().history).toEqual([])
    // an unlocked piece still moves
    s.moveItem('desk', 120, 120)
    expect(useStore.getState().items.find((i) => i.id === 'desk')).toMatchObject({ x: 120, y: 120 })
  })

  it('move again once unlocked, and locking marks the suggestions stale', () => {
    const s = useStore.getState()
    s.generateSuggestions()
    expect(useStore.getState().suggestionsStale).toBe(false)
    s.toggleLock('dresser')
    expect(dresser().locked).toBe(false)
    expect(useStore.getState().suggestionsStale).toBe(true)
    s.moveItem('dresser', 120, 120)
    expect(dresser()).toMatchObject({ x: 120, y: 120 })
    s.toggleLock('dresser')
    expect(dresser().locked).toBe(true)
  })

  it('keep their placement when a layout is applied, whether it stores placements or whole items', () => {
    const s = useStore.getState()
    const before = { ...dresser() }
    s.applyLayout({
      id: 'l1', name: 'Placements', description: '',
      placements: { dresser: { x: 150, y: 200, rot: 0, inRoom: true }, desk: { x: 50, y: 25, rot: 0, inRoom: true } },
    })
    expect(dresser()).toEqual(before)
    expect(useStore.getState().items.find((i) => i.id === 'desk')).toMatchObject({ x: 50, y: 25 })
    const moved = items().map((i) => (i.id === 'dresser' ? { ...i, x: 150, y: 200, rot: 0, locked: false } : i))
    s.applyLayout({ id: 'l2', name: 'Saved', description: '', placements: {}, items: moved })
    expect(dresser()).toEqual(before)
    expect(dresser().locked).toBe(true)
  })

  it('stay put in the generated suggestions', () => {
    const s = useStore.getState()
    s.generateSuggestions()
    const st = useStore.getState()
    expect(st.suggestions.length).toBeGreaterThanOrEqual(1)
    for (const l of st.suggestions) {
      expect(l.placements.dresser).toEqual({ x: 24, y: 300, rot: 270, inRoom: true })
      expect(l.description).toMatch(/Dresser stays where you locked it/)
    }
    s.applyLayout(st.suggestions[0])
    expect(dresser()).toMatchObject({ x: 24, y: 300, rot: 270, locked: true })
  })
})

describe('locked pieces in suggestLayouts', () => {
  it('are obstacles: nothing lands on them or in their access space', () => {
    const list = items()
    const layouts = suggestLayouts(room, list)
    expect(layouts.length).toBeGreaterThanOrEqual(1)
    for (const l of layouts) {
      expect(l.placements.dresser).toEqual({ x: 24, y: 300, rot: 270, inRoom: true })
      for (const it of list) {
        if (it.id === 'dresser' || it.kind === 'rug') continue
        const p = l.placements[it.id]
        if (!p.inRoom) continue
        const w = p.rot % 180 === 0 ? it.w : it.d, d = p.rot % 180 === 0 ? it.d : it.w
        // the dresser occupies x 0..48, y 220..380 and its drawers need x 48..93 in front
        const overlapsDresserOrDrawers = p.x - w / 2 < 93 - 0.5 && p.y + d / 2 > 220 + 0.5 && p.y - d / 2 < 380 - 0.5
        expect(overlapsDresserOrDrawers, `${it.id} keeps off the locked dresser in ${l.name}`).toBe(false)
      }
    }
  })

  it('can all be locked, in which case the one layout is the room as it is', () => {
    const list = items().map((i) => ({ ...i, locked: true }))
    const layouts = suggestLayouts(room, list)
    expect(layouts).toHaveLength(1)
    expect(layouts[0].name).toBe('A · Everything stays where it is')
    for (const it of list) expect(layouts[0].placements[it.id]).toEqual({ x: it.x, y: it.y, rot: it.rot, inRoom: true })
  })

  it('keep an odd angle exactly', () => {
    const list = items().map((i) => (i.id === 'dresser' ? { ...i, x: 150, y: 200, rot: 30 } : i))
    const layouts = suggestLayouts(room, list)
    for (const l of layouts) expect(l.placements.dresser).toEqual({ x: 150, y: 200, rot: 30, inRoom: true })
  })

  it('are ignored with respectLocks: false', () => {
    const list = items()
    const free = suggestLayouts(room, list.map((i) => ({ ...i, locked: false })))
    const ignored = suggestLayouts(room, list, { respectLocks: false })
    expect(ignored.map((l) => l.placements)).toEqual(free.map((l) => l.placements))
  })

  it('a locked parked piece stays parked', () => {
    const list = [...items(), item('lamp', 'box', 30, 30, 160, 60, 490, 0, { inRoom: false, locked: true })]
    for (const l of suggestLayouts(room, list)) expect(l.placements.lamp).toEqual({ x: 60, y: 490, rot: 0, inRoom: false })
  })
})
