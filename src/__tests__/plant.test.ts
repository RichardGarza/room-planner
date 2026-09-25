import { describe, expect, it } from 'vitest'
import { catalog } from '../catalog'
import { buildPlant, leafColours, leafCount, plantVariant, potColour, type PlantVariant } from '../scene/furniture/Plant'

const plants = catalog.filter((p) => p.kind === 'plant')
const variantOf = (p: { name: string; w: number; h: number }) => plantVariant(p.name, p.w, p.h)
const positions = (m: ReturnType<typeof buildPlant>) => m.leaves.map((l) => [l.matrix[12], l.matrix[13], l.matrix[14]])

describe('plant variants', () => {
  it('reads the preset names', () => {
    const byName = Object.fromEntries(plants.map((p) => [p.name, variantOf(p)])) as Record<string, PlantVariant>
    expect(byName).toEqual({
      'Baby olive tree in pot': 'olive',
      'Olive tree, taller': 'olive',
      'Fiddle-leaf fig': 'fig',
      'Potted shrub': 'shrub',
      'Snake plant': 'snake',
      'Small palm': 'palm',
      'Monstera': 'monstera',
      'Room bush': 'shrub',
    })
  })

  it('makes an unnamed custom plant a tree when it is tall, otherwise a shrub', () => {
    expect(plantVariant('Green thing', 60, 180)).toBe('olive')
    expect(plantVariant('Green thing', 60, 80)).toBe('shrub')
  })

  it('pots olives and figs in terracotta and the houseplants in matte white', () => {
    expect(potColour('olive')).toBe('#b8654a')
    expect(potColour('fig')).toBe('#b8654a')
    expect(potColour('snake')).toBe('#f1ece4')
    expect(potColour('monstera')).toBe('#f1ece4')
  })

  it('gives olive leaves a lighter, silvery back', () => {
    const { front, back } = leafColours('olive', '#6f8f5a')
    expect(back).not.toBeNull()
    const lum = (hex: string) => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16)
    expect(lum(back!)).toBeGreaterThan(lum(front))
    expect(leafColours('shrub', '#8aa36b').back).toBeNull()
  })
})

describe('leaf count', () => {
  it('is deterministic and drops on the fast quality setting for every preset', () => {
    for (const p of plants) {
      const v = variantOf(p)
      const best = leafCount(v, p.w, p.h, false), fast = leafCount(v, p.w, p.h, true)
      expect(leafCount(v, p.w, p.h, false), p.name).toBe(best)
      expect(fast, p.name).toBeLessThan(best)
      expect(fast, p.name).toBeGreaterThan(0)
    }
  })

  it('gives the olive and the bush between 40 and 120 leaves on best', () => {
    expect(leafCount('olive', 60, 150, false)).toBe(110)
    expect(leafCount('olive', 80, 200, false)).toBe(120)
    expect(leafCount('shrub', 100, 110, false)).toBe(100)
    for (const [v, w, h] of [['olive', 30, 60], ['olive', 200, 300], ['shrub', 20, 30], ['shrub', 200, 200]] as const) {
      const n = leafCount(v, w, h, false)
      expect(n).toBeGreaterThanOrEqual(40)
      expect(n).toBeLessThanOrEqual(120)
    }
  })

  it('keeps big single leaves few', () => {
    expect(leafCount('fig', 70, 180, false)).toBe(16)
    expect(leafCount('monstera', 80, 120, false)).toBe(10)
    expect(leafCount('palm', 90, 170, false)).toBe(9)
    expect(leafCount('snake', 30, 90, false)).toBe(14)
  })
})

describe('buildPlant', () => {
  it('is stable for an id and differs between ids', () => {
    const a = buildPlant('item-a', 'olive', 60, 60, 150, false)
    const b = buildPlant('item-a', 'olive', 60, 60, 150, false)
    const c = buildPlant('item-b', 'olive', 60, 60, 150, false)
    expect(positions(a)).toEqual(positions(b))
    expect(positions(a)).not.toEqual(positions(c))
    expect(a.wood.length).toBeGreaterThanOrEqual(3 + 3 * 3)
    expect(a.knots.length).toBe(2)
  })

  it("places every preset's leaf bases inside its box, on both quality settings", () => {
    for (const p of plants) {
      for (const fast of [false, true]) {
        const m = buildPlant(`seed-${p.id}`, variantOf(p), p.w, p.d, p.h, fast)
        expect(m.leaves.length, p.name).toBe(leafCount(variantOf(p), p.w, p.h, fast))
        for (const [x, y, z] of positions(m)) {
          expect(Math.abs(x), p.name).toBeLessThanOrEqual(p.w / 200 + 0.01)
          expect(Math.abs(z), p.name).toBeLessThanOrEqual(p.d / 200 + 0.01)
          expect(y, p.name).toBeGreaterThan(0)
          expect(y, p.name).toBeLessThanOrEqual(p.h / 100 + 0.01)
        }
        expect(m.pot.h, p.name).toBeLessThan(p.h / 100)
        expect(m.pot.r * 2, p.name).toBeLessThanOrEqual(Math.min(p.w, p.d) / 100)
      }
    }
  })

  it('hides the trunk of a bush behind a solid body and gives the olive a gnarled one', () => {
    const bush = buildPlant('x', 'shrub', 100, 100, 110, false)
    expect(bush.body).not.toBeNull()
    expect(bush.wood).toHaveLength(0)
    const olive = buildPlant('x', 'olive', 60, 60, 150, false)
    expect(olive.body).toBeNull()
    expect(olive.leafShape).toBe('olive')
    // the trunk leans: the joints are not all on one vertical line
    const xs = olive.wood.slice(0, 3).map((w) => w.at[0])
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0)
  })
})
