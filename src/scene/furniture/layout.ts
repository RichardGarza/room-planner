/**
 * Pure layout decisions for the 3D furniture: which variant a piece gets, how
 * many drawers/doors/cushions it has, where books go. No three.js or DOM here so
 * the rules can be unit-tested. Sizes are centimetres unless noted.
 */

/* ------------------------------- randomness ------------------------------- */

/** Small string hash so every item gets a stable seed. */
export function hashSeed(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** mulberry32: deterministic 0..1 generator. */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* --------------------------------- colours -------------------------------- */

function parse(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const toHex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')

/** Blend two hex colours; t = 0 gives a, t = 1 gives b. */
export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = parse(a), [br, bg, bb] = parse(b)
  return toHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t)
}

/** Lighten (f > 1) or darken (f < 1) a hex colour. */
export function shade(hex: string, f: number): string {
  const [r, g, b] = parse(hex)
  return toHex(r * f, g * f, b * f)
}

/** Warm, saturated tones (oak, walnut, pine) read as natural wood, so they get grain. */
export function isWoodTone(hex: string): boolean {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return false
  const [r, g, b] = parse(hex).map((v) => v / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const sat = max === 0 ? 0 : (max - min) / max
  if (sat < 0.22) return false
  let hue = 0
  if (max === r) hue = ((g - b) / (max - min)) % 6
  else if (max === g) hue = (b - r) / (max - min) + 2
  else hue = (r - g) / (max - min) + 4
  hue = ((hue * 60) + 360) % 360
  return hue >= 15 && hue <= 50
}

/* --------------------------------- variants -------------------------------- */

export type BedStyle = 'crib' | 'toddler' | 'bunk' | 'bed'

export function bedStyle(name: string, w: number, h: number): BedStyle {
  const n = name.toLowerCase()
  if (n.includes('bunk')) return 'bunk'
  if (n.includes('crib') || n.includes('cot')) return 'crib'
  if (w < 90) return h >= 80 ? 'crib' : 'toddler'
  return 'bed'
}

/** Drawer grid for dressers: the name wins ("6-drawer"), otherwise ~27 cm per row. */
export function drawerGrid(name: string, w: number, h: number): { rows: number; cols: number } {
  const cols = w > 120 ? 2 : 1
  const m = /(\d+)[\s-]*drawer/i.exec(name)
  if (m) {
    const count = Math.max(1, Math.min(12, parseInt(m[1], 10)))
    return { rows: Math.max(1, Math.ceil(count / cols)), cols: count === 1 ? 1 : cols }
  }
  return { rows: Math.max(1, Math.min(8, Math.round(h / 27))), cols }
}

export function nightstandDrawers(h: number): number {
  return h >= 58 ? 2 : 1
}

export function doorCount(w: number): number {
  return w < 75 ? 1 : w < 125 ? 2 : 3
}

/** Swivel desk chair when the name says so or the seat is square and tall; otherwise four legs. */
export function chairStyle(name: string, w: number, d: number, h: number): 'desk' | 'dining' {
  const n = name.toLowerCase()
  if (/desk|swivel|office|gaming/.test(n)) return 'desk'
  if (/dining|kitchen|stool/.test(n)) return 'dining'
  return Math.abs(w - d) <= 4 && h > 70 ? 'desk' : 'dining'
}

export function cushionCount(w: number): number {
  return w < 120 ? 1 : w < 195 ? 2 : 3
}

export function deskLegs(w: number): 'panels' | 'legs' {
  return w >= 120 ? 'panels' : 'legs'
}

/** Cube grid for open shelves: KALLAX-sized cells (~37 cm). 77×77 → 2×2, 77×147 → 2×4. */
export function shelfGrid(w: number, h: number): { cols: number; rows: number } {
  return { cols: Math.max(1, Math.round(w / 39)), rows: Math.max(1, Math.round(h / 37)) }
}

export function isKallax(kind: string, w: number, h: number): boolean {
  const near = (v: number, t: number) => Math.abs(v - t) <= 3
  return kind === 'shelf' && near(w, 77) && (near(h, 77) || near(h, 147))
}

export function bookcaseShelves(h: number): number {
  return Math.max(2, Math.round(h / 32))
}

export type BoxVariant = 'piano' | 'lamp' | 'chest' | 'beanbag' | 'treadmill' | 'radiatorCover' | 'box'

export function boxVariant(name: string): BoxVariant {
  const n = name.toLowerCase()
  if (n.includes('piano')) return 'piano'
  if (n.includes('lamp')) return 'lamp'
  if (n.includes('bean')) return 'beanbag'
  if (n.includes('treadmill')) return 'treadmill'
  if (n.includes('radiator')) return 'radiatorCover'
  if (n.includes('chest') || n.includes('trunk') || n.includes('toy')) return 'chest'
  return 'box'
}

export type DresserVariant = 'changing' | 'kitchen' | 'tv' | 'dresser'

export function dresserVariant(name: string): DresserVariant {
  const n = name.toLowerCase()
  if (n.includes('changing')) return 'changing'
  if (n.includes('kitchen')) return 'kitchen'
  if (n.includes('tv')) return 'tv'
  return 'dresser'
}

/* ---------------------------------- books --------------------------------- */

export const bookColours = ['#c96f6f', '#6f8fc9', '#d9b26f', '#7fae7b', '#a08ac9', '#e6d6b8', '#5b6b7a', '#e0a37a', '#f2efe9', '#8b5e4b', '#3f5f8a', '#d98fa8']

export interface Book {
  /** offset of the book's left edge from the row start (m) */
  x: number
  w: number
  h: number
  color: string
  /** small lean angle in radians, 0 for most books */
  lean: number
}

/**
 * A row of books (metres) that fills `fill` of `width`, heights under `maxH`.
 * Deterministic for a given generator.
 */
export function bookRow(next: () => number, width: number, maxH: number, fill = 0.85): Book[] {
  const books: Book[] = []
  const target = width * fill
  let x = 0
  let guard = 0
  while (x < target && guard++ < 80) {
    const w = 0.018 + next() * 0.03
    if (x + w > width) break
    const h = maxH * (0.55 + next() * 0.35)
    const color = bookColours[Math.floor(next() * bookColours.length)]
    const lean = x + w > target - 0.05 && next() < 0.5 ? 0.12 : 0
    books.push({ x, w, h, color, lean })
    x += w + (next() < 0.1 ? 0.006 : 0.001)
  }
  return books
}

/** Which cells of a shelf grid get a fabric box, books or something small. */
export type CellFill = 'box' | 'books' | 'object' | 'empty'

export function cellFills(next: () => number, count: number): CellFill[] {
  const out: CellFill[] = []
  for (let i = 0; i < count; i++) {
    const r = next()
    out.push(r < 0.38 ? 'box' : r < 0.72 ? 'books' : r < 0.86 ? 'object' : 'empty')
  }
  return out
}

/** Pastel palette for KALLAX-style inserts and small objects. */
export const insertColours = ['#f3c9d8', '#bcd3e8', '#e9dfc7', '#cfe3d2', '#d9cde9', '#f0d6b8']
