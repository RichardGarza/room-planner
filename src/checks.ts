import { doorClearance, gapBetween, intersects, overlapArea, rectOf, wallStripRect } from './geometry'
import type { Check, Item, Room } from './types'

const MIN_PASSAGE = 60
const BED_EXIT = 45
const MIN_DOOR_ANGLE = 85

/** A chair pushed under a desk is not a collision. */
function tucksUnder(chair: Item, desk: Item) {
  return chair.kind === 'chair' && desk.kind === 'desk' && overlapArea(rectOf(chair), rectOf(desk)) < 0.5 * chair.w * chair.d
}

export function runChecks(room: Room, items: Item[]): Check[] {
  const checks: Check[] = []
  const inRoom = items.filter((i) => i.inRoom)
  const solid = inRoom.filter((i) => i.kind !== 'rug')
  const bed = inRoom.find((i) => i.kind === 'bed')

  // 1. Items poking through walls
  for (const it of inRoom) {
    const r = rectOf(it)
    if (r.x0 < -0.5 || r.y0 < -0.5 || r.x1 > room.w + 0.5 || r.y1 > room.d + 0.5) {
      checks.push({ level: 'bad', text: `${it.name} goes through a wall`, itemIds: [it.id] })
    }
  }

  // 2. Overlaps
  for (let a = 0; a < solid.length; a++) {
    for (let b = a + 1; b < solid.length; b++) {
      const A = solid[a], B = solid[b]
      if (tucksUnder(A, B) || tucksUnder(B, A)) continue
      if (intersects(rectOf(A), rectOf(B))) {
        const bedItem = A.kind === 'bed' ? A : B.kind === 'bed' ? B : null
        const other = bedItem ? (A === bedItem ? B : A) : null
        const text =
          bedItem && other?.kind === 'chair'
            ? 'Bed blocks the chair spot'
            : bedItem && other
              ? `Bed overlaps the ${other.name.toLowerCase()}`
              : `${A.name} overlaps ${B.name.toLowerCase()}`
        checks.push({ level: 'bad', text, itemIds: [A.id, B.id] })
      }
    }
  }

  // 3. Window coverage (anything tall touching the window wall within its span)
  const win = wallStripRect(room, room.window.wall, room.window.offset, room.window.width, 12)
  for (const it of solid) {
    const r = rectOf(it)
    const area = overlapArea(r, win)
    if (area > 0 && it.h > room.window.sill) {
      const covered = area / (room.window.width * 12)
      checks.push({
        level: covered > 0.8 ? 'bad' : 'warn',
        text: covered > 0.8 ? `${it.name} blocks the window` : `${it.name} covers part of the window`,
        itemIds: [it.id],
      })
    }
  }

  // 4. Radiator
  const rad = wallStripRect(room, room.radiator.wall, room.radiator.offset, room.radiator.width, room.radiator.depth + 15)
  for (const it of solid) {
    if (overlapArea(rectOf(it), rad) > 0) {
      const frac = overlapArea(rectOf(it), rad) / (room.radiator.width * (room.radiator.depth + 15))
      checks.push({
        level: 'warn',
        text: frac > 0.6 ? `${it.name} is in front of the radiator` : `${it.name} partly covers the radiator`,
        itemIds: [it.id],
      })
    }
  }

  // 5. Door swing
  const { maxAngle, blocker } = doorClearance(room, items)
  if (blocker && maxAngle < MIN_DOOR_ANGLE) {
    checks.push({ level: maxAngle < 45 ? 'bad' : 'warn', text: `Door only opens to ${maxAngle}° — ${blocker.name} is in the way`, itemIds: [blocker.id] })
  } else {
    checks.push({ level: 'ok', text: 'Wide, clear entry into the room', itemIds: [] })
  }

  // 6. Passages next to the bed
  if (bed) {
    const br = rectOf(bed)
    for (const it of solid) {
      if (it === bed) continue
      const g = gapBetween(br, rectOf(it))
      if (!g || g.gap < 0 || g.gap > 120) continue
      const gap = Math.round(g.gap)
      checks.push({
        level: gap < MIN_PASSAGE ? 'warn' : 'ok',
        text: `Passage between ${it.name.toLowerCase()} and bed: ${gap} cm`,
        itemIds: [bed.id, it.id],
      })
    }
    // room for getting out of bed: at least half of one long side needs a 60 cm strip beside it
    const rot = bed.rot === 90 || bed.rot === 270
    const clearFraction = (side: 'a' | 'b') => {
      const len = rot ? br.x1 - br.x0 : br.y1 - br.y0
      const steps = Math.max(1, Math.floor(len / 10))
      let clear = 0
      for (let i = 0; i < steps; i++) {
        const t = (i + 0.5) * 10
        const strip = rot
          ? side === 'a'
            ? { x0: br.x0 + t - 5, y0: br.y0 - BED_EXIT, x1: br.x0 + t + 5, y1: br.y0 }
            : { x0: br.x0 + t - 5, y0: br.y1, x1: br.x0 + t + 5, y1: br.y1 + BED_EXIT }
          : side === 'a'
            ? { x0: br.x0 - BED_EXIT, y0: br.y0 + t - 5, x1: br.x0, y1: br.y0 + t + 5 }
            : { x0: br.x1, y0: br.y0 + t - 5, x1: br.x1 + BED_EXIT, y1: br.y0 + t + 5 }
        if (strip.x0 < 0 || strip.x1 > room.w || strip.y0 < 0 || strip.y1 > room.d) continue
        if (!solid.some((o) => o !== bed && intersects(rectOf(o), strip))) clear++
      }
      return clear / steps
    }
    const best = Math.max(clearFraction('a'), clearFraction('b'))
    if (best < 0.5) {
      checks.push({ level: 'warn', text: 'Hard to get in and out of bed — both long sides are mostly blocked', itemIds: [bed.id] })
    }
  }

  // 7. Things kept in place (nice-to-know ok lines)
  const stayed = solid.filter((i) => ['dresser', 'desk', 'shelf'].includes(i.kind))
  if (stayed.length === 3) checks.push({ level: 'ok', text: 'Dresser, desk and shelf stay in place', itemIds: stayed.map((i) => i.id) })

  const order = { bad: 0, warn: 1, ok: 2 }
  return checks.sort((a, b) => order[a.level] - order[b.level])
}
