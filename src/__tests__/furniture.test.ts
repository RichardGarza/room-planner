import { describe, expect, it } from 'vitest'
import { catalog } from '../catalog'
import {
  bedStyle,
  bookRow,
  boxVariant,
  cellFills,
  chairStyle,
  cushionCount,
  doorCount,
  drawerGrid,
  hashSeed,
  isKallax,
  isWoodTone,
  mix,
  rng,
  shade,
  shelfGrid,
} from '../scene/furniture/layout'

const preset = (id: string) => {
  const p = catalog.find((c) => c.id === id)
  if (!p) throw new Error(`no preset ${id}`)
  return p
}

describe('furniture variants', () => {
  it('picks bed styles from the name and size', () => {
    expect(bedStyle('Crib', 70, 90)).toBe('crib')
    expect(bedStyle('Toddler bed', 77, 60)).toBe('toddler')
    expect(bedStyle('Bunk bed', 100, 160)).toBe('bunk')
    expect(bedStyle('IKEA TUFJORD 140×200', 164, 109)).toBe('bed')
    expect(bedStyle('Single bed 90×200', 90, 50)).toBe('bed')
  })

  it('reads the drawer count from the name, else from the height', () => {
    expect(drawerGrid('IKEA MALM 6-drawer', 160, 78)).toEqual({ rows: 3, cols: 2 })
    expect(drawerGrid('IKEA HEMNES 8-drawer', 160, 96)).toEqual({ rows: 4, cols: 2 })
    expect(drawerGrid('Short dresser, 3 drawers', 80, 80)).toEqual({ rows: 3, cols: 1 })
    expect(drawerGrid('Tall chest of drawers', 60, 130)).toEqual({ rows: 5, cols: 1 })
    expect(drawerGrid('Dresser', 160, 85)).toEqual({ rows: 3, cols: 2 })
  })

  it('gives wardrobes two or three doors by width', () => {
    expect(doorCount(50)).toBe(1)
    expect(doorCount(100)).toBe(2)
    expect(doorCount(150)).toBe(3)
  })

  it('tells swivel chairs from dining chairs', () => {
    const desk = preset('chair-desk'), dining = preset('chair-dining'), kids = preset('chair-kids')
    expect(chairStyle(desk.name, desk.w, desk.d, desk.h)).toBe('desk')
    expect(chairStyle(dining.name, dining.w, dining.d, dining.h)).toBe('dining')
    expect(chairStyle(kids.name, kids.w, kids.d, kids.h)).toBe('dining')
    // the example room's kids chair is a 56×56×86 swivel chair
    expect(chairStyle('Kids chair', 56, 56, 86)).toBe('desk')
  })

  it('counts sofa cushions by width', () => {
    expect(cushionCount(80)).toBe(1)
    expect(cushionCount(160)).toBe(2)
    expect(cushionCount(220)).toBe(3)
  })

  it('recognises KALLAX sizes and lays out cube grids', () => {
    expect(isKallax('shelf', 77, 77)).toBe(true)
    expect(isKallax('shelf', 77, 147)).toBe(true)
    expect(isKallax('bookcase', 77, 77)).toBe(false)
    expect(shelfGrid(77, 77)).toEqual({ cols: 2, rows: 2 })
    expect(shelfGrid(77, 147)).toEqual({ cols: 2, rows: 4 })
    expect(shelfGrid(49, 110)).toEqual({ cols: 1, rows: 3 })
  })

  it('maps box names to silhouettes', () => {
    expect(boxVariant('Upright piano')).toBe('piano')
    expect(boxVariant('Floor lamp')).toBe('lamp')
    expect(boxVariant('Toy chest')).toBe('chest')
    expect(boxVariant('Bean bag')).toBe('beanbag')
    expect(boxVariant('Treadmill')).toBe('treadmill')
    expect(boxVariant('Radiator cover')).toBe('radiatorCover')
    expect(boxVariant('Storage box')).toBe('box')
  })
})

describe('colours', () => {
  it('treats oak and walnut as wood and pastels as paint', () => {
    expect(isWoodTone('#d8b98f')).toBe(true)
    expect(isWoodTone('#e6d3b3')).toBe(true)
    expect(isWoodTone('#3d3733')).toBe(false)
    expect(isWoodTone('#f7f4ef')).toBe(false)
    expect(isWoodTone('#f3c9d8')).toBe(false)
    expect(isWoodTone('#bcd3e8')).toBe(false)
    expect(isWoodTone('not a colour')).toBe(false)
  })

  it('mixes and shades hex colours', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080')
    expect(shade('#ff8000', 0.5)).toBe('#804000')
    expect(shade('#ff8000', 2)).toBe('#ffff00')
  })
})

describe('books', () => {
  it('is deterministic for a seed and stays inside the shelf', () => {
    const a = bookRow(rng(hashSeed('bookcase')), 0.6, 0.3)
    const b = bookRow(rng(hashSeed('bookcase')), 0.6, 0.3)
    expect(a).toEqual(b)
    expect(a.length).toBeGreaterThan(5)
    for (const book of a) {
      expect(book.x + book.w).toBeLessThanOrEqual(0.6)
      expect(book.h).toBeLessThanOrEqual(0.3)
      expect(book.h).toBeGreaterThan(0.1)
    }
    expect(bookRow(rng(1), 0.6, 0.3)).not.toEqual(a)
  })

  it('fills every cell of a grid with a known kind', () => {
    const fills = cellFills(rng(hashSeed('kallax')), 8)
    expect(fills).toHaveLength(8)
    for (const f of fills) expect(['box', 'books', 'object', 'empty']).toContain(f)
  })
})
