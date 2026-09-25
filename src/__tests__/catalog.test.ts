import { describe, expect, it } from 'vitest'
import { catalog, categories, findPreset } from '../catalog'
import type { ItemKind } from '../types'

const KINDS: ItemKind[] = ['bed', 'chair', 'desk', 'shelf', 'dresser', 'wardrobe', 'bookcase', 'rug', 'rugRect', 'nightstand', 'sofa', 'table', 'plant', 'box']

describe('catalog', () => {
  it('has between 40 and 80 presets', () => {
    expect(catalog.length).toBeGreaterThanOrEqual(40)
    expect(catalog.length).toBeLessThanOrEqual(80)
  })

  it('uses unique kebab-case ids', () => {
    const ids = catalog.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  })

  it('has positive sizes and a hex colour', () => {
    for (const p of catalog) {
      expect(p.w, p.id).toBeGreaterThan(0)
      expect(p.d, p.id).toBeGreaterThan(0)
      expect(p.h, p.id).toBeGreaterThan(0)
      expect(p.color, p.id).toMatch(/^#[0-9a-f]{6}$/i)
      expect(p.name.trim().length, p.id).toBeGreaterThan(0)
    }
  })

  it('maps every preset to a known kind', () => {
    for (const p of catalog) expect(KINDS, p.id).toContain(p.kind)
  })

  it('lists every category in the display order, each with at least one preset', () => {
    for (const p of catalog) expect(categories, p.id).toContain(p.category)
    for (const c of categories) expect(catalog.some((p) => p.category === c), c).toBe(true)
    expect(new Set(categories).size).toBe(categories.length)
  })

  it('keeps round rugs and tables square, and rugs flat', () => {
    for (const p of catalog) {
      if (p.kind === 'rug' || p.name.includes('Ø')) expect(p.w, p.id).toBe(p.d)
      if (p.kind === 'rug' || p.kind === 'rugRect') expect(p.h, p.id).toBeLessThanOrEqual(2)
    }
  })

  it('keeps the indoor plants last, all of kind plant, and nothing else of that kind', () => {
    expect(categories[categories.length - 1]).toBe('Indoor plants')
    const plants = catalog.filter((p) => p.category === 'Indoor plants')
    expect(plants.length).toBeGreaterThanOrEqual(8)
    for (const p of plants) {
      expect(p.kind, p.id).toBe('plant')
      expect(p.w, p.id).toBe(p.d)
    }
    for (const p of catalog) if (p.kind === 'plant') expect(p.category, p.id).toBe('Indoor plants')
    expect(plants.map((p) => p.name)).toContain('Baby olive tree in pot')
    expect(plants.map((p) => p.name)).toContain('Room bush')
    expect(findPreset('olive-baby')).toMatchObject({ kind: 'plant', w: 60, d: 60, h: 150 })
    expect(findPreset('olive-baby')?.note).toMatch(/olive tree.*terracotta/i)
    expect(findPreset('room-bush')).toMatchObject({ kind: 'plant', w: 100, d: 100, h: 110 })
  })

  it('finds presets by id', () => {
    expect(findPreset('ikea-tufjord-140')).toMatchObject({ kind: 'bed', w: 164, d: 223, h: 109 })
    expect(findPreset('wall-shelf')?.note).toMatch(/wall-mounted/i)
    expect(findPreset('no-such-thing')).toBeUndefined()
  })
})
