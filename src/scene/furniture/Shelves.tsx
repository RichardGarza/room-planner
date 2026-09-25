import { useMemo } from 'react'
import type { Item } from '../../types'
import { cm } from '../util'
import { bookRow, bookcaseShelves, cellFills, hashSeed, insertColours, mix, rng, shade, shelfGrid, type Book } from './layout'
import { Painted, Surface, useFx } from './materials'
import { Books, Box, Plant, SmallBox, type V3 } from './props'

const T = 0.018

/** Bookcase: open carcass with shelves; most shelves get a row of books, some a plant or box. */
export function Bookcase({ item }: { item: Item }) {
  const { fast } = useFx()
  const w = cm(item.w), d = cm(item.d), h = cm(item.h)
  const n = bookcaseShelves(item.h)
  const base = Math.min(0.05, h * 0.06)
  const gap = (h - base - T) / n
  const innerW = w - 2 * T
  const bookD = d * 0.65

  const contents = useMemo(() => {
    const next = rng(hashSeed(item.id + item.w + item.h))
    const rows: { at: V3; books: Book[] }[] = []
    const objects: { kind: 'plant' | 'box'; at: V3; size: number; color: string }[] = []
    for (let i = 0; i < n; i++) {
      const y = base + i * gap + (i === 0 ? 0 : T / 2)
      const r = next()
      if (r < 0.7) {
        const fill = 0.45 + next() * 0.5
        const books = bookRow(next, innerW - 0.02, gap - T - 0.03, fill)
        const used = books.length ? books[books.length - 1].x + books[books.length - 1].w : 0
        const left = next() < 0.6
        rows.push({ at: [left ? -innerW / 2 + 0.01 : innerW / 2 - 0.01 - used, y, 0.02], books })
        if (innerW - used > 0.18 && next() < 0.6) {
          const x = left ? innerW / 2 - 0.09 : -innerW / 2 + 0.09
          objects.push({ kind: next() < 0.5 ? 'plant' : 'box', at: [x, y, 0.02], size: Math.min(0.14, gap - T - 0.04), color: insertColours[Math.floor(next() * insertColours.length)] })
        }
      } else if (r < 0.85) {
        objects.push({ kind: 'box', at: [-innerW / 2 + 0.1, y, 0.0], size: Math.min(0.16, gap - T - 0.05), color: insertColours[Math.floor(next() * insertColours.length)] })
      }
    }
    return { rows, objects }
  }, [item.id, item.w, item.h, n, base, gap, innerW])

  return (
    <>
      {[-1, 1].map((sx) => (
        <Box key={sx} size={[T, h, d]} at={[sx * (w / 2 - T / 2), h / 2, 0]}><Surface color={item.color} /></Box>
      ))}
      <Box size={[innerW, T, d]} at={[0, h - T / 2, 0]}><Surface color={item.color} /></Box>
      <Box size={[innerW, base, d - 0.03]} at={[0, base / 2, -0.01]}><Painted color={shade(item.color, 0.7)} /></Box>
      <Box size={[innerW, h - base - T, 0.008]} at={[0, base + (h - base - T) / 2, -d / 2 + 0.004]} cast={false}><Painted color={mix(item.color, '#ffffff', 0.25)} roughness={0.8} /></Box>
      {Array.from({ length: n - 1 }, (_, i) => (
        <Box key={i} size={[innerW, T, d - 0.01]} at={[0, base + (i + 1) * gap, 0]}><Surface color={item.color} /></Box>
      ))}
      {!fast && (
        <>
          <Books rows={contents.rows} depth={bookD} />
          {contents.objects.map((o, i) =>
            o.kind === 'plant' ? (
              <Plant key={i} at={o.at} size={o.size} />
            ) : (
              <SmallBox key={i} at={[o.at[0], o.at[1] + o.size * 0.35, o.at[2]]} size={[o.size * 1.2, o.size * 0.7, d * 0.7]} color={o.color} />
            ),
          )}
        </>
      )}
    </>
  )
}

/** Open cube shelf (KALLAX and friends): thick frame, grid of cells with fabric boxes, books and plants. */
export function CubeShelf({ item }: { item: Item }) {
  const { fast } = useFx()
  const w = cm(item.w), d = cm(item.d), h = cm(item.h)
  const { cols, rows } = shelfGrid(item.w, item.h)
  const F = Math.min(0.035, h * 0.12)
  const cellW = (w - 2 * F - (cols - 1) * 0.02) / cols
  const cellH = (h - 2 * F - (rows - 1) * 0.02) / rows

  const cells = useMemo(() => {
    const next = rng(hashSeed(item.id + ':' + item.w + 'x' + item.h))
    const fills = cellFills(next, cols * rows)
    return fills.map((fill, i) => {
      const c = i % cols, r = Math.floor(i / cols)
      const x = -w / 2 + F + c * (cellW + 0.02) + cellW / 2
      const y = F + (rows - 1 - r) * (cellH + 0.02)
      const color = insertColours[Math.floor(next() * insertColours.length)]
      const books = fill === 'books' ? bookRow(next, cellW - 0.03, cellH - 0.03, 0.5 + next() * 0.4) : []
      return { fill, x, y, color, books }
    })
  }, [item.id, item.w, item.h, cols, rows, w, F, cellW, cellH])

  return (
    <>
      {[-1, 1].map((sx) => (
        <Box key={sx} size={[F, h, d]} at={[sx * (w / 2 - F / 2), h / 2, 0]}><Surface color={item.color} /></Box>
      ))}
      {[F / 2, h - F / 2].map((y) => (
        <Box key={y} size={[w - 2 * F, F, d]} at={[0, y, 0]}><Surface color={item.color} /></Box>
      ))}
      {Array.from({ length: cols - 1 }, (_, i) => (
        <Box key={`c${i}`} size={[0.02, h - 2 * F, d]} at={[-w / 2 + F + (i + 1) * cellW + i * 0.02 + 0.01, h / 2, 0]}><Surface color={item.color} /></Box>
      ))}
      {Array.from({ length: rows - 1 }, (_, i) => (
        <Box key={`r${i}`} size={[w - 2 * F, 0.02, d]} at={[0, F + (i + 1) * cellH + i * 0.02 + 0.01, 0]}><Surface color={item.color} /></Box>
      ))}
      <Box size={[w - 2 * F, h - 2 * F, 0.006]} at={[0, h / 2, -d / 2 + 0.003]} cast={false}><Painted color={mix(item.color, '#ffffff', 0.25)} roughness={0.8} /></Box>
      {!fast && (
        <>
          <Books rows={cells.filter((c) => c.fill === 'books').map((c) => ({ at: [c.x - cellW / 2 + 0.015, c.y, 0.02] as V3, books: c.books }))} depth={d * 0.6} />
          {cells.map((c, i) =>
            c.fill === 'box' ? (
              <SmallBox key={i} at={[c.x, c.y + (cellH - 0.03) / 2, 0.005]} size={[cellW - 0.03, cellH - 0.03, d - 0.05]} color={c.color} />
            ) : c.fill === 'object' ? (
              <Plant key={i} at={[c.x, c.y, 0.02]} size={Math.min(0.16, cellH - 0.06)} />
            ) : null,
          )}
        </>
      )}
    </>
  )
}
