import type { Box, Orientation, PageSize, Paper } from './types'

/** Paper sizes in landscape millimetres. */
export const PAPERS: Record<Paper, PageSize> = {
  letter: { w: 279.4, h: 215.9 },
  a4: { w: 297, h: 210 },
}

export const MARGIN = 12
/** Scale denominators to try, largest drawing first. */
export const SCALES = [10, 15, 20, 25, 30, 40, 50]

/** Page size for the paper and orientation ("auto" turns portrait when the room is taller than wide). */
export function pageSize(paper: Paper, orientation: Orientation, room: { w: number; d: number }): PageSize {
  const p = PAPERS[paper]
  const landscape = orientation === 'auto' ? room.d <= room.w : orientation === 'landscape'
  return landscape ? { w: p.w, h: p.h } : { w: p.h, h: p.w }
}

/** The area inside the margins. */
export function printableArea(page: PageSize): Box {
  return { x: MARGIN, y: MARGIN, w: page.w - 2 * MARGIN, h: page.h - 2 * MARGIN }
}

/** Millimetres on paper per centimetre in the room at 1:scale. */
export const mmPerCm = (scale: number) => 10 / scale

/**
 * The largest of the standard scales at which a roomW x roomD cm room fits an
 * areaW x areaH mm box. Falls back to the smallest scale when nothing fits.
 */
export function pickScale(roomW: number, roomD: number, areaW: number, areaH: number): { scale: number; fits: boolean } {
  for (const scale of SCALES) {
    const k = mmPerCm(scale)
    if (roomW * k <= areaW && roomD * k <= areaH) return { scale, fits: true }
  }
  return { scale: SCALES[SCALES.length - 1], fits: false }
}

/* ---------- packing ---------- */

export interface Piece {
  id: string
  w: number
  h: number
}

export interface PlacedPiece extends Piece {
  x: number
  y: number
  /** true when the piece was turned 90 degrees to pack better (w/h already swapped) */
  rotated: boolean
}

export interface Packing {
  pages: PlacedPiece[][]
  /** ids of pieces too big for the area in either orientation */
  unplaced: string[]
}

/**
 * Shelf packing: rows left-to-right, rows top-to-bottom, a new page when a row
 * does not fit. Pieces are sorted tallest first; a piece is turned 90 degrees
 * when that is the only way onto the current row, or when it keeps the row shorter.
 */
export function packPieces(pieces: Piece[], areaW: number, areaH: number, gap = 5): Packing {
  const sorted = [...pieces].sort((a, b) => Math.min(b.w, b.h) - Math.min(a.w, a.h) || Math.max(b.w, b.h) - Math.max(a.w, a.h))
  const pages: PlacedPiece[][] = []
  const unplaced: string[] = []
  let page: PlacedPiece[] = []
  let shelfY = 0
  let shelfH = 0
  let cursorX = 0

  const orientations = (p: Piece): { w: number; h: number; rotated: boolean }[] => {
    const a = { w: p.w, h: p.h, rotated: false }
    const b = { w: p.h, h: p.w, rotated: true }
    // long side along the row keeps rows short
    return p.w >= p.h ? [a, b] : [b, a]
  }

  for (const p of sorted) {
    const opts = orientations(p).filter((o) => o.w <= areaW && o.h <= areaH)
    if (opts.length === 0) { unplaced.push(p.id); continue }

    // 1. fits on the current row (prefer the orientation that does not raise the row;
    //    never raise it by more than a little, that leaves big holes)
    let placed = false
    if (page.length > 0) {
      const onRow = opts
        .filter((o) => cursorX + o.w <= areaW && o.h <= shelfH + 8 && shelfY + Math.max(shelfH, o.h) <= areaH)
        .sort((a, b) => Math.max(shelfH, a.h) - Math.max(shelfH, b.h) || Number(a.rotated) - Number(b.rotated))
      const o = onRow[0]
      if (o) {
        page.push({ id: p.id, w: o.w, h: o.h, x: cursorX, y: shelfY, rotated: o.rotated })
        cursorX += o.w + gap
        shelfH = Math.max(shelfH, o.h)
        placed = true
      }
    }
    if (placed) continue

    // 2. start a new row (shortest orientation first), on a new page when it does not fit
    const o = opts.sort((a, b) => a.h - b.h || b.w - a.w)[0]
    const nextY = page.length > 0 ? shelfY + shelfH + gap : 0
    if (nextY + o.h > areaH) {
      pages.push(page)
      page = []
      shelfY = 0
    } else {
      shelfY = nextY
    }
    page.push({ id: p.id, w: o.w, h: o.h, x: 0, y: shelfY, rotated: o.rotated })
    cursorX = o.w + gap
    shelfH = o.h
  }
  if (page.length > 0) pages.push(page)
  return { pages, unplaced }
}

/* ---------- small drawing helpers ---------- */

/** Escape text for an SVG attribute or text node. */
export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Approximate width of Helvetica text in mm for a font size in mm. */
export function textWidth(text: string, fontSize: number, bold = false): number {
  let w = 0
  for (const ch of text) {
    if (ch === ' ') w += 0.28
    else if (/[0-9]/.test(ch)) w += 0.56
    else if (/[A-Z]/.test(ch)) w += 0.68
    else if (/[ijl.,:;'|]/.test(ch)) w += 0.26
    else if (/[mw]/.test(ch)) w += 0.83
    else w += 0.53
  }
  return w * fontSize * (bold ? 1.06 : 1)
}

/** Mix a hex colour with white (t = 0 keeps it, 1 is white). */
export function tint(hex: string, t = 0.6): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return '#f3efe9'
  const n = parseInt(m[1], 16)
  const mix = (c: number) => Math.round(c + (255 - c) * t)
  const r = mix((n >> 16) & 255), g = mix((n >> 8) & 255), b = mix(n & 255)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

/** Darken a hex colour for outlines / headboards. */
export function shade(hex: string, t = 0.35): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return '#8f867d'
  const n = parseInt(m[1], 16)
  const mix = (c: number) => Math.round(c * (1 - t))
  const r = mix((n >> 16) & 255), g = mix((n >> 8) & 255), b = mix(n & 255)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

export const r2 = (v: number) => Math.round(v * 100) / 100

export function rectsOverlap(a: Box, b: Box, pad = 0): boolean {
  return a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y
}
