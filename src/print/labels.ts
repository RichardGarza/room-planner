import { CM_PER_IN, type Unit } from '../units'

/**
 * Plain-ASCII length labels for PDF text: jsPDF's core fonts cannot draw the
 * prime / double-prime / fraction glyphs the app uses on screen, so paper gets
 * "53.5 in", "11 ft 9 in" and "137 cm" instead.
 */

/** Inches rounded to the nearest half, as "53" or "53.5". */
export function asciiInches(inches: number): string {
  const q = Math.round(inches * 2) / 2
  return Number.isInteger(q) ? `${q}` : q.toFixed(1)
}

/** "11 ft 9 in" for 3 ft and more, plain inches below that. */
export function asciiFeetInches(inches: number): string {
  const q = Math.round(inches * 2) / 2
  if (q < 36) return `${asciiInches(q)} in`
  let ft = Math.floor(q / 12)
  let rest = q - ft * 12
  if (rest >= 11.75) { ft += 1; rest = 0 }
  return rest === 0 ? `${ft} ft` : `${ft} ft ${asciiInches(rest)} in`
}

export interface AsciiOptions {
  /** feet-and-inches for long distances (room sizes) */
  feet?: boolean
  /** omit the unit suffix */
  bare?: boolean
}

/** A length stored in cm as ASCII text in the given unit. */
export function asciiLength(cm: number, unit: Unit, opts: AsciiOptions = {}): string {
  if (unit === 'cm') {
    const v = Math.round(cm)
    return opts.bare ? `${v}` : `${v} cm`
  }
  const inches = cm / CM_PER_IN
  if (opts.feet) return asciiFeetInches(inches)
  const t = asciiInches(inches)
  return opts.bare ? t : `${t} in`
}

/** "54 x 30 in" / "137 x 76 cm" (height optional). */
export function asciiSize(w: number, d: number, unit: Unit, h?: number): string {
  const parts = [w, d, ...(h === undefined ? [] : [h])].map((v) => asciiLength(v, unit, { bare: true }))
  return `${parts.join(' x ')} ${unit}`
}

/** "1:25 (1 in on paper = 25 in in the room)". */
export function scaleNote(scale: number, unit: Unit): string {
  return `1:${scale} (1 ${unit} on paper = ${scale} ${unit} in the room)`
}

/** The check bar: 4 in for inch users, 10 cm otherwise. Length in mm and its label. */
export function checkBar(unit: Unit): { mm: number; label: string } {
  return unit === 'in' ? { mm: 4 * CM_PER_IN * 10, label: '4 in' } : { mm: 100, label: '10 cm' }
}

/** Today as "24 Sep 2026" (ASCII, locale-independent). */
export function dateText(d = new Date()): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
}

/** Replace the few non-ASCII characters names commonly carry (x, fractions, primes, dashes) so core PDF fonts can draw them. */
export function asciiText(s: string): string {
  return s
    .replace(/×/g, 'x')
    .replace(/(\d)([½¼¾])/g, '$1 $2')
    .replace(/½/g, '1/2').replace(/¼/g, '1/4').replace(/¾/g, '3/4')
    .replace(/[′’‘]/g, "'").replace(/[″“”]/g, '"')
    .replace(/[–—]/g, '-').replace(/…/g, '...')
    .replace(/[·•]/g, '-')
    .replace(/[^\x20-\x7e]/g, '?')
}
