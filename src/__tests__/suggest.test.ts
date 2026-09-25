import { describe, expect, it } from 'vitest'
import { runChecks } from '../checks'
import { defaultItems, defaultRoom, makeEmptyRoom, presetLayouts } from '../data'
import { intersects, isRugKind, rectOf } from '../geometry'
import { useStore } from '../store'
import { describeLayout, suggestLayouts } from '../suggest'
import type { Item, Layout, Rect, Room } from '../types'

function item(id: string, kind: Item['kind'], w: number, d: number, h: number): Item {
  return { id, name: id, kind, w, d, h, x: 0, y: 0, rot: 0, color: '#ffffff', inRoom: true }
}

const bedroom = (): Item[] => [
  item('bed', 'bed', 150, 210, 95),
  item('dresser', 'dresser', 160, 48, 85),
  item('desk', 'desk', 100, 50, 75),
  item('chair', 'chair', 56, 56, 86),
  item('rug', 'rug', 160, 160, 1),
]

const apply = (items: Item[], layout: Layout): Item[] => items.map((i) => ({ ...i, ...layout.placements[i.id] }))
const inside = (room: Room, r: Rect) => r.x0 >= -0.01 && r.y0 >= -0.01 && r.x1 <= room.w + 0.01 && r.y1 <= room.d + 0.01

describe('suggestLayouts', () => {
  it('suggests up to three layouts for the example room, the best one without bad checks', () => {
    const items = apply(defaultItems, presetLayouts[0])
    const layouts = suggestLayouts(defaultRoom, items)
    expect(layouts.length).toBeGreaterThanOrEqual(1)
    expect(layouts.length).toBeLessThanOrEqual(3)
    expect(layouts[0].recommended).toBe(true)
    expect(layouts.slice(1).every((l) => !l.recommended)).toBe(true)
    expect(layouts.map((l) => l.id)).toEqual(['sug-a', 'sug-b', 'sug-c'].slice(0, layouts.length))
    const checks = runChecks(defaultRoom, apply(items, layouts[0]))
    expect(checks.filter((c) => c.level === 'bad')).toEqual([])
    for (const l of layouts) {
      expect(Object.keys(l.placements).sort()).toEqual(items.map((i) => i.id).sort())
      expect(l.name).toMatch(/^[ABC] · Bed /)
      expect(l.description.split(/\.\s/).length).toBeGreaterThanOrEqual(2)
    }
  })

  it('places a bedroom set in an empty room: inside, apart, chair at the desk', () => {
    const room = makeEmptyRoom('t', 300, 400)
    const items = bedroom()
    const t0 = performance.now()
    const layouts = suggestLayouts(room, items)
    const ms = performance.now() - t0
    expect(ms).toBeLessThan(500)
    expect(layouts.length).toBeGreaterThanOrEqual(2)
    for (const l of layouts) {
      const placed = apply(items, l)
      for (const it of placed) {
        expect(it.inRoom, `${it.id} is placed in ${l.name}`).toBe(true)
        expect(inside(room, rectOf(it)), `${it.id} inside the room in ${l.name}`).toBe(true)
      }
      const solid = placed.filter((i) => !isRugKind(i.kind))
      for (let a = 0; a < solid.length; a++) {
        for (let b = a + 1; b < solid.length; b++) {
          const A = solid[a], B = solid[b]
          const pair = new Set([A.kind, B.kind])
          if (pair.has('chair') && pair.has('desk')) continue
          expect(intersects(rectOf(A), rectOf(B)), `${A.id} and ${B.id} apart in ${l.name}`).toBe(false)
        }
      }
      const desk = placed.find((i) => i.id === 'desk')!
      const chair = placed.find((i) => i.id === 'chair')!
      expect(Math.hypot(desk.x - chair.x, desk.y - chair.y)).toBeLessThanOrEqual(70)
      // the bed stands against a wall, headboard first
      const bed = rectOf(placed.find((i) => i.id === 'bed')!)
      expect(bed.x0 === 0 || bed.y0 === 0 || bed.x1 === room.w || bed.y1 === room.d).toBe(true)
      const checks = runChecks(room, placed)
      expect(checks.filter((c) => c.level === 'bad')).toEqual([])
    }
    // the layouts differ in where the bed went
    const beds = layouts.map((l) => `${l.placements.bed.x},${l.placements.bed.y},${l.placements.bed.rot}`)
    expect(new Set(beds).size).toBe(layouts.length)
  })

  it('is deterministic', () => {
    const room = makeEmptyRoom('t', 300, 400)
    const a = suggestLayouts(room, bedroom())
    const b = suggestLayouts(room, bedroom())
    expect(a).toEqual(b)
  })

  it('stays fast with a dozen pieces in a 4 × 5 m room', () => {
    const room = makeEmptyRoom('big', 400, 500)
    const items = [
      ...bedroom(),
      item('wardrobe', 'wardrobe', 150, 58, 220),
      item('wardrobe2', 'wardrobe', 100, 58, 200),
      item('ns1', 'nightstand', 40, 40, 55),
      item('ns2', 'nightstand', 40, 40, 55),
      item('bookcase', 'bookcase', 80, 28, 202),
      item('sofa', 'sofa', 160, 90, 85),
      item('table', 'table', 100, 60, 45),
    ]
    const t0 = performance.now()
    const layouts = suggestLayouts(room, items)
    expect(performance.now() - t0).toBeLessThan(300)
    expect(layouts).toHaveLength(3)
    const best = apply(items, layouts[0])
    expect(best.every((i) => i.inRoom)).toBe(true)
    // at least one nightstand sits right beside the bed (both when the bed is not in a corner)
    const bed = rectOf(best.find((i) => i.id === 'bed')!)
    const beside = ['ns1', 'ns2'].filter((id) => {
      const ns = rectOf(best.find((i) => i.id === id)!)
      const gap = Math.max(Math.max(ns.x0, bed.x0) - Math.min(ns.x1, bed.x1), Math.max(ns.y0, bed.y0) - Math.min(ns.y1, bed.y1))
      return gap <= 1
    })
    expect(beside.length).toBeGreaterThanOrEqual(1)
  })

  it('leaves the bed out of a room that is too small for it', () => {
    const room = makeEmptyRoom('tiny', 160, 160)
    const items = [item('bed', 'bed', 190, 212, 95), item('chair', 'chair', 40, 40, 60)]
    const layouts = suggestLayouts(room, items)
    expect(layouts.length).toBeGreaterThanOrEqual(1)
    expect(layouts[0].placements.bed.inRoom).toBe(false)
    expect(layouts[0].placements.chair.inRoom).toBe(true)
    expect(layouts[0].description).toMatch(/did not fit/)
  })

  it('returns nothing without furniture', () => {
    expect(suggestLayouts(makeEmptyRoom('e'), [])).toEqual([])
  })

  it('describes a layout in plain English', () => {
    const room = makeEmptyRoom('t', 300, 400)
    const items = bedroom()
    const [best] = suggestLayouts(room, items)
    const text = describeLayout(room, items, best)
    expect(text).toBe(best.description)
    expect(text).toMatch(/^The bed /)
  })
})

describe('store suggestions', () => {
  it('fills the suggestions on demand and marks them stale when the furniture changes', () => {
    const s = useStore.getState()
    s.hydrate({
      id: 'r', name: 'Test', group: '', notes: '', createdAt: '', updatedAt: '', version: 1,
      room: makeEmptyRoom('t', 300, 400), items: bedroom(), layouts: [],
      settings: { daytime: true, doorAngle: 70, blinds: 40, bedding: true, walkHeight: 'adult', quality: 'best' },
    })
    expect(useStore.getState().suggestions).toEqual([])
    s.generateSuggestions()
    let st = useStore.getState()
    expect(st.suggestions.length).toBeGreaterThanOrEqual(2)
    expect(st.suggestionsStale).toBe(false)
    s.applyLayout(st.suggestions[0])
    st = useStore.getState()
    expect(st.activeLayoutId).toBe('sug-a')
    expect(st.suggestionsStale).toBe(false)
    s.addItem({ name: 'Lamp', kind: 'box', w: 30, d: 30, h: 160, color: '#fff' })
    expect(useStore.getState().suggestionsStale).toBe(true)
    s.generateSuggestions()
    expect(useStore.getState().suggestionsStale).toBe(false)
    s.setRoom({ w: 350 })
    expect(useStore.getState().suggestionsStale).toBe(true)
  })
})
