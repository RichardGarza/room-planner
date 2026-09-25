import { describe, expect, it } from 'vitest'
import { defaultItems, defaultRoom, presetLayouts } from '../data'
import { doorClearance, footprint, gapBetween, intersects, rectOf } from '../geometry'
import { runChecks } from '../checks'
import type { Item } from '../types'

const bed = defaultItems.find((i) => i.id === 'bed')!

describe('geometry', () => {
  it('swaps the footprint when rotated', () => {
    expect(footprint({ w: 100, d: 50, rot: 0 })).toEqual({ fw: 100, fd: 50 })
    expect(footprint({ w: 100, d: 50, rot: 90 })).toEqual({ fw: 50, fd: 100 })
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
})

describe('checks', () => {
  it('flags an item in front of the radiator in layout A', () => {
    const items = defaultItems.map((i) => ({ ...i, ...presetLayouts[0].placements[i.id] }))
    const texts = runChecks(defaultRoom, items).map((c) => c.text)
    expect(texts.some((t) => /radiator/.test(t))).toBe(true)
  })

  it('flags a bed blocking the window in layout C', () => {
    const items = defaultItems.map((i) => ({ ...i, ...presetLayouts[2].placements[i.id] }))
    const texts = runChecks(defaultRoom, items).map((c) => c.text)
    expect(texts.some((t) => /window/.test(t))).toBe(true)
  })
})
