import { describe, expect, it } from 'vitest'
import { findPreset } from '../catalog'
import { isAccessCheck, runChecks } from '../checks'
import { makeEmptyRoom } from '../data'
import { accessAllows, accessZones, areCompanions, closetClearance, doorSwing, faceZone, isRugKind, itemsGap, itemsIntersect, polygonIntersectsRect, polygonOf, polygonsIntersect, rectOf, wallStripRect } from '../geometry'
import { migrateDoc } from '../migrate'
import { forestsRoom } from '../seeds'
import { explainScore, MIN_GAP, suggestLayouts } from '../suggest'
import type { Item, Layout, Rect, Room } from '../types'

/*
 * The quality bar for suggestions on three rooms. Every assertion here is computed from the
 * geometry of the returned placements (gaps, access strips, door swings, paths), not from the
 * engine's own opinion of itself.
 */

const apply = (items: Item[], layout: Layout): Item[] => items.map((i) => ({ ...i, ...layout.placements[i.id] }))
const solidsOf = (items: Item[]) => items.filter((i) => i.inRoom && !isRugKind(i.kind))
const inside = (room: Room, r: Rect) => r.x0 >= -0.01 && r.y0 >= -0.01 && r.x1 <= room.w + 0.01 && r.y1 <= room.d + 0.01
const gap = (a: Item, b: Item) => Math.round(itemsGap(a, b) * 100) / 100

function preset(id: string, key: string): Item {
  const p = findPreset(id)
  if (!p) throw new Error(`no preset ${id}`)
  return { id: key, name: p.name, kind: p.kind, w: p.w, d: p.d, h: p.h, x: 0, y: 0, rot: 0, color: p.color, inRoom: true }
}

/** Something solid (other than a companion) stands in one of the piece's access strips. */
function blockedAccessStrips(item: Item, solids: Item[]) {
  const access = accessZones(item)
  if (!access) return []
  return access.zones.filter((z) => solids.some((o) => o.id !== item.id && !accessAllows(item, o) && polygonsIntersect(polygonOf(o), z.poly)))
}

/** A 60 cm strip beside a long side of a bed, inside the room and at least 60 % free of anything but a nightstand. */
function usableSides(room: Room, bed: Item, solids: Item[]) {
  const faces = bed.d >= bed.w ? (['left', 'right'] as const) : (['front', 'back'] as const)
  let usable = 0
  for (const face of faces) {
    const poly = faceZone(bed, face, 60)
    const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1])
    const strip: Rect = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
    const area = (strip.x1 - strip.x0) * (strip.y1 - strip.y0)
    const inRoom: Rect = { x0: Math.max(0, strip.x0), y0: Math.max(0, strip.y0), x1: Math.min(room.w, strip.x1), y1: Math.min(room.d, strip.y1) }
    const inArea = Math.max(0, inRoom.x1 - inRoom.x0) * Math.max(0, inRoom.y1 - inRoom.y0)
    if (inArea / area < 0.75) continue
    let covered = 0
    for (const o of solids) {
      if (o.id === bed.id || o.kind === 'nightstand') continue
      const r = rectOf(o)
      covered += Math.max(0, Math.min(r.x1, strip.x1) - Math.max(r.x0, strip.x0)) * Math.max(0, Math.min(r.y1, strip.y1) - Math.max(r.y0, strip.y0))
    }
    if ((inArea - covered) / area >= 0.6) usable++
  }
  return usable
}

/** True when the item's outline reaches into the quarter disc an in-swinging door sweeps (or the doorway strip). */
function inDoorSwing(room: Room, item: Item) {
  const poly = polygonOf(item)
  for (const door of room.doors) {
    if (polygonIntersectsRect(poly, wallStripRect(room, door.wall, door.offset, door.width, 40))) return true
    if (door.swing === 'out') continue
    const { hx, hy, r, leafDir } = doorSwing(room, door)
    for (let deg = 0; deg <= 90; deg += 5) {
      const [dx, dy] = leafDir(deg)
      for (let f = 0.1; f <= 1.001; f += 0.1) {
        const px = hx + dx * r * f, py = hy + dy * r * f
        const b = rectOf(item)
        if (px > b.x0 + 0.5 && px < b.x1 - 0.5 && py > b.y0 + 0.5 && py < b.y1 - 0.5) return true
      }
    }
  }
  return false
}

/** How far an item's box stays from the quarter disc an in-swinging door sweeps (0 when it reaches into it). */
function doorSwingDistance(room: Room, item: Item) {
  let best = Infinity
  const b = rectOf(item)
  for (const door of room.doors) {
    if (door.swing === 'out') continue
    const { hx, hy, r, leafDir } = doorSwing(room, door)
    for (let deg = 0; deg <= 90; deg += 5) {
      const [dx, dy] = leafDir(deg)
      for (let f = 0; f <= 1.001; f += 0.1) {
        const px = hx + dx * r * f, py = hy + dy * r * f
        best = Math.min(best, Math.hypot(Math.max(b.x0 - px, 0, px - b.x1), Math.max(b.y0 - py, 0, py - b.y1)))
      }
    }
  }
  return best
}

/** Pairs of solid pieces that do not belong together and stand closer than MIN_GAP. */
function tightPairs(solids: Item[]) {
  const out: [Item, Item, number][] = []
  for (let a = 0; a < solids.length; a++) {
    for (let b = a + 1; b < solids.length; b++) {
      if (areCompanions(solids[a], solids[b])) continue
      const g = gap(solids[a], solids[b])
      if (g < MIN_GAP) out.push([solids[a], solids[b], g])
    }
  }
  return out
}

/** The description owns up to a tight fit instead of claiming nothing is in the way. */
function expectHonest(items: Item[], layout: Layout) {
  const solids = solidsOf(apply(items, layout))
  const tight = tightPairs(solids)
  if (!tight.length) return
  expect(layout.description, `${layout.name} owns up to its tight fit`).toMatch(/Tight fit:/)
  expect(layout.description, `${layout.name} does not claim nothing is in the way`).not.toMatch(/Nothing is in the way/)
}

/**
 * A 60 cm wide person can walk from the door to within 15 cm of the target, on a 10 cm grid
 * (4-neighbour). The floor is sampled at cell centres, so brushing a piece by under 5 cm is fine.
 */
function pathFromDoor(room: Room, items: Item[], target: Item) {
  const solids = solidsOf(items).map(rectOf)
  const nx = Math.ceil(room.w / 10), ny = Math.ceil(room.d / 10)
  const free = (i: number, j: number) => {
    const box: Rect = { x0: (i + 0.5) * 10 - 30, y0: (j + 0.5) * 10 - 30, x1: (i + 0.5) * 10 + 30, y1: (j + 0.5) * 10 + 30 }
    if (box.x0 < -0.01 || box.y0 < -0.01 || box.x1 > room.w + 0.01 || box.y1 > room.d + 0.01) return false
    // blocked when some cell centre lies strictly inside both the box and a piece
    return !solids.some((s) => {
      const x0 = Math.max(s.x0, box.x0), x1 = Math.min(s.x1, box.x1), y0 = Math.max(s.y0, box.y0), y1 = Math.min(s.y1, box.y1)
      const hasCentre = (lo: number, hi: number) => Math.floor(lo / 10 - 0.5) + 1 <= Math.ceil(hi / 10 - 0.5) - 1
      return x1 > x0 && y1 > y0 && hasCentre(x0, x1) && hasCentre(y0, y1)
    })
  }
  const t = rectOf(target)
  const near: Rect = { x0: t.x0 - 15, y0: t.y0 - 15, x1: t.x1 + 15, y1: t.y1 + 15 }
  const touches = (i: number, j: number, r: Rect) => {
    const cx = (i + 0.5) * 10, cy = (j + 0.5) * 10
    return cx + 30 > r.x0 && cx - 30 < r.x1 && cy + 30 > r.y0 && cy - 30 < r.y1
  }
  return room.doors.every((door) => {
    const from = wallStripRect(room, door.wall, door.offset, door.width, 40)
    const seen = new Set<number>()
    const queue: [number, number][] = []
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (free(i, j) && touches(i, j, from)) { seen.add(j * nx + i); queue.push([i, j]) }
    while (queue.length) {
      const [i, j] = queue.shift()!
      if (touches(i, j, near)) return true
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di, nj = j + dj
        if (ni < 0 || nj < 0 || ni >= nx || nj >= ny || seen.has(nj * nx + ni) || !free(ni, nj)) continue
        seen.add(nj * nx + ni)
        queue.push([ni, nj])
      }
    }
    return false
  })
}

/** What every layout of every room must satisfy. */
function expectSound(room: Room, items: Item[], layout: Layout) {
  const placed = apply(items, layout)
  const solids = solidsOf(placed)
  const name = layout.name
  for (const it of solids) expect(inside(room, rectOf(it)), `${it.id} inside the room in ${name}`).toBe(true)
  const checks = runChecks(room, placed)
  expect(checks.filter((c) => c.level === 'bad').map((c) => c.text), `no red checks in ${name}`).toEqual([])
  expect(checks.filter(isAccessCheck).map((c) => c.text), `no access-space warnings in ${name}`).toEqual([])
  for (const it of solids) {
    if (it.kind === 'bed') continue
    expect(blockedAccessStrips(it, solids).map((z) => z.face), `${it.id}'s access space is free in ${name}`).toEqual([])
    expect(inDoorSwing(room, it), `${it.id} out of the door swing in ${name}`).toBe(false)
    for (const closet of room.closets) expect(polygonIntersectsRect(polygonOf(it), closetClearance(room, closet).rect), `${it.id} out of the closet clearance in ${name}`).toBe(false)
  }
  for (let a = 0; a < solids.length; a++) {
    for (let b = a + 1; b < solids.length; b++) {
      const A = solids[a], B = solids[b]
      if (A.kind === 'chair' && B.kind === 'desk' || A.kind === 'desk' && B.kind === 'chair') continue
      expect(itemsIntersect(A, B), `${A.id} and ${B.id} do not overlap in ${name}`).toBe(false)
    }
  }
  return { placed, solids }
}

/** Every pair that does not belong together keeps the walking gap. */
function expectSpaced(solids: Item[], name: string) {
  for (let a = 0; a < solids.length; a++) {
    for (let b = a + 1; b < solids.length; b++) {
      const A = solids[a], B = solids[b]
      if (areCompanions(A, B)) continue
      expect(gap(A, B), `${A.id} and ${B.id} are ${MIN_GAP} cm apart in ${name}`).toBeGreaterThanOrEqual(MIN_GAP)
    }
  }
}

const timed = (fn: () => Layout[]) => {
  const t0 = performance.now()
  const layouts = fn()
  return { layouts, ms: performance.now() - t0 }
}

describe("(a) Forest's Room", () => {
  const doc = forestsRoom()
  const room = doc.room
  const byId = (items: Item[], id: string) => items.find((i) => i.id === id)!

  const crib = (items: Item[]) => byId(items, 'forest-crib')

  const expectForest = (items: Item[], layouts: Layout[]) => {
    expect(layouts.length).toBeGreaterThanOrEqual(1)
    for (const l of layouts) {
      const { placed, solids } = expectSound(room, items, l)
      // the parked recliner stays parked
      expect(l.placements['forest-recliner-open'].inRoom).toBe(false)
      // the crib stands against a wall with one long side open (60 cm, at least 60 % free)
      const c = crib(placed)
      expect(c.inRoom, `crib in the room in ${l.name}`).toBe(true)
      const cr = rectOf(c)
      expect(cr.x0 <= 0.5 || cr.y0 <= 0.5 || cr.x1 >= room.w - 0.5 || cr.y1 >= room.d - 0.5, `crib on a wall in ${l.name}`).toBe(true)
      expect(usableSides(room, c, solids), `a long side of the crib is open in ${l.name}`).toBeGreaterThanOrEqual(1)
      // the dresser (76 cm tall) never blocks the sill: it may stand under the window only because it fits below it
      const dresser = byId(placed, 'forest-dresser')
      expect(dresser.h).toBeLessThanOrEqual(room.windows[0].sill)
      expect(runChecks(room, placed).some((ch) => /Dresser (blocks|stands .* above)/.test(ch.text)), `dresser clear of the sill in ${l.name}`).toBe(false)
      // recliner and side table sit together
      const recliner = byId(placed, 'forest-recliner'), side = byId(placed, 'forest-side')
      expect(recliner.inRoom && side.inRoom, `recliner and side table in the room in ${l.name}`).toBe(true)
      expect(areCompanions(recliner, side)).toBe(true)
      expect(gap(recliner, side), `side table right beside the recliner in ${l.name}`).toBeLessThanOrEqual(5)
      // a person can get from the door to the crib
      expect(pathFromDoor(room, placed, c), `a 60 cm path from the door to the crib in ${l.name}`).toBe(true)
    }
  }

  it('arranges the nursery cleanly with everything unlocked', () => {
    const { layouts, ms } = timed(() => suggestLayouts(room, doc.items))
    expect(ms).toBeLessThan(400)
    expectForest(doc.items, layouts)
    expect(layouts[0].recommended).toBe(true)
    expect(layouts[0].description).toMatch(/drawers face the room|tall cabinet can open/)
  })

  it('offers more than one arrangement, one of them the crib on the right wall by the window (the room as it is lived in)', () => {
    const layouts = suggestLayouts(room, doc.items)
    expect(layouts.length).toBeGreaterThanOrEqual(2)
    const onRightWall = layouts.filter((l) => {
      const c = crib(apply(doc.items, l))
      const r = rectOf(c)
      return r.x1 >= room.w - 0.5 && r.y0 <= 0.5 && c.rot === 90
    })
    expect(onRightWall.length, 'a layout with the crib along the right wall, up by the window wall').toBe(1)
    // the room is too small for a walking gap everywhere: each layout says so rather than claiming a clear room
    for (const l of layouts) expectHonest(doc.items, l)
    expect(layouts[0].description).toMatch(/Tight fit: the /)
  })

  it('keeps a locked crib exactly where it is and arranges around it', () => {
    const items = doc.items.map((i) => (i.id === 'forest-crib' ? { ...i, locked: true } : i))
    const original = crib(items)
    const { layouts, ms } = timed(() => suggestLayouts(room, items))
    expect(ms).toBeLessThan(400)
    expectForest(items, layouts)
    expect(layouts.length).toBeGreaterThanOrEqual(2)
    for (const l of layouts) {
      expect(l.placements['forest-crib']).toEqual({ x: original.x, y: original.y, rot: original.rot, inRoom: true })
      expect(l.description).toMatch(/Crib stays where you locked it/)
      // nothing stands in the crib's open side either
      const solids = solidsOf(apply(items, l))
      expect(usableSides(room, crib(solids), solids)).toBeGreaterThanOrEqual(1)
      // whatever has to be squeezed in this room, it is not squeezed against the crib: a full walking gap all round
      for (const o of solids) {
        if (o.id === 'forest-crib' || areCompanions(o, crib(solids))) continue
        expect(gap(o, crib(solids)), `${o.id} keeps ${MIN_GAP} cm from the crib in ${l.name}`).toBeGreaterThanOrEqual(MIN_GAP)
      }
      expectHonest(items, l)
    }
  })

  it('keeps the lock through a save, share link or import (migrateDoc keeps the flag)', () => {
    const items = doc.items.map((i) => (i.id === 'forest-crib' ? { ...i, locked: true } : i))
    const shared = migrateDoc(JSON.parse(JSON.stringify({ ...doc, items })))!
    expect(shared.items.find((i) => i.id === 'forest-crib')?.locked).toBe(true)
    const layouts = suggestLayouts(shared.room, shared.items)
    for (const l of layouts) {
      expect(l.placements['forest-crib']).toEqual({ x: crib(items).x, y: crib(items).y, rot: crib(items).rot, inRoom: true })
      expect(l.description).toMatch(/Crib stays where you locked it/)
    }
  })

  it('moves the crib again when locks are ignored', () => {
    const items = doc.items.map((i) => (i.id === 'forest-crib' ? { ...i, locked: true } : i))
    const layouts = suggestLayouts(room, items, { respectLocks: false })
    expect(layouts.map((l) => l.placements['forest-crib'])).toEqual(suggestLayouts(room, doc.items).map((l) => l.placements['forest-crib']))
  })
})

describe('(b) a fresh 305 × 366 room with the starter basics plus a nightstand, a desk chair and a BILLY', () => {
  const room = makeEmptyRoom('Fresh', 305, 366, 244)
  const items = [
    preset('double-bed', 'bed'),
    preset('dresser-wide-6', 'dresser'),
    preset('desk-small', 'desk'),
    preset('rug-round-160', 'rug'),
    preset('nightstand-40', 'ns'),
    preset('chair-desk', 'chair'),
    preset('ikea-billy', 'billy'),
  ]

  it('puts the bed head on a wall with both sides reachable, the nightstand at the head, the chair at the desk, fronts open, 45 cm apart', () => {
    const { layouts, ms } = timed(() => suggestLayouts(room, items))
    expect(ms).toBeLessThan(400)
    expect(layouts.length).toBeGreaterThanOrEqual(2)
    for (const l of layouts) {
      const { placed, solids } = expectSound(room, items, l)
      expect(placed.every((i) => i.inRoom), `everything placed in ${l.name}`).toBe(true)
      const bed = placed.find((i) => i.id === 'bed')!
      const br = rectOf(bed)
      // the head (the −d side) is against a wall
      const headOnWall = { 0: br.y0 <= 0.5, 90: br.x1 >= room.w - 0.5, 180: br.y1 >= room.d - 0.5, 270: br.x0 <= 0.5 }[bed.rot as 0 | 90 | 180 | 270]
      expect(headOnWall, `bed head on a wall in ${l.name}`).toBe(true)
      expect(usableSides(room, bed, solids), `both sides of the bed reachable in ${l.name}`).toBe(2)
      // the nightstand touches the bed, by the head end
      const ns = placed.find((i) => i.id === 'ns')!
      expect(gap(ns, bed), `nightstand beside the bed in ${l.name}`).toBeLessThanOrEqual(1)
      const nr = rectOf(ns)
      const nearHead = { 0: nr.y0 <= 0.5, 90: nr.x1 >= room.w - 0.5, 180: nr.y1 >= room.d - 0.5, 270: nr.x0 <= 0.5 }[bed.rot as 0 | 90 | 180 | 270]
      expect(nearHead, `nightstand at the head end in ${l.name}`).toBe(true)
      // the chair sits at the desk, in front of it
      const desk = placed.find((i) => i.id === 'desk')!, chair = placed.find((i) => i.id === 'chair')!
      expect(Math.hypot(desk.x - chair.x, desk.y - chair.y), `chair at the desk in ${l.name}`).toBeLessThanOrEqual(70)
      expect(polygonsIntersect(polygonOf(chair), faceZone(desk, 'front', 75)), `chair in front of the desk in ${l.name}`).toBe(true)
      // dresser and bookcase fronts face open floor inside the room
      for (const id of ['dresser', 'billy']) {
        const it = placed.find((i) => i.id === id)!
        const zone = accessZones(it)!.zones[0]
        expect(inside(room, zone.rect), `${id}'s front faces into the room in ${l.name}`).toBe(true)
        expect(blockedAccessStrips(it, solids), `${id}'s front is open in ${l.name}`).toEqual([])
      }
      expectSpaced(solids, l.name)
      // a bed beside the door swing has the sweep as its way in and out: the bed keeps a walking gap from the leaf
      expect(doorSwingDistance(room, bed), `bed clear of the door swing in ${l.name}`).toBeGreaterThanOrEqual(MIN_GAP)
    }
    // the recommended layout is one a person would pick: the bed on a side wall, not squeezed beside the door
    expect(layouts[0].name).toMatch(/^A · Bed against the (left|right) wall/)
  })

  it('does not score layouts by how much furniture gathers round the bed', () => {
    for (const l of suggestLayouts(room, items)) {
      const { parts } = explainScore(room, apply(items, l))
      // a "passage ok" line only exists for pieces within 120 cm of the bed, so it must not be worth points
      expect(parts.filter((p) => /Passage between/.test(p) && /\+1$/.test(p)), `no passage bonus in ${l.name}`).toEqual([])
    }
  })
})

describe('(c) a 400 × 500 bedroom with ten pieces', () => {
  const room = makeEmptyRoom('Big', 400, 500, 260)
  const items = [
    preset('queen-bed', 'bed'),
    preset('nightstand-40', 'ns1'),
    preset('nightstand-40', 'ns2'),
    preset('dresser-wide-6', 'dresser'),
    preset('ikea-pax-100', 'pax'),
    preset('desk-140', 'desk'),
    preset('chair-desk', 'chair'),
    preset('armchair', 'armchair'),
    preset('side-table', 'side'),
    preset('rug-160x230', 'rug'),
  ]

  it('follows the same rules and keeps a 60 cm path from the door to the bed', () => {
    const { layouts, ms } = timed(() => suggestLayouts(room, items))
    expect(ms).toBeLessThan(400)
    expect(layouts).toHaveLength(3)
    for (const l of layouts) {
      const { placed, solids } = expectSound(room, items, l)
      expect(placed.every((i) => i.inRoom), `everything placed in ${l.name}`).toBe(true)
      const bed = placed.find((i) => i.id === 'bed')!
      expect(usableSides(room, bed, solids), `both sides of the bed reachable in ${l.name}`).toBe(2)
      for (const id of ['ns1', 'ns2']) expect(gap(placed.find((i) => i.id === id)!, bed), `${id} beside the bed in ${l.name}`).toBeLessThanOrEqual(1)
      const desk = placed.find((i) => i.id === 'desk')!, chair = placed.find((i) => i.id === 'chair')!
      expect(polygonsIntersect(polygonOf(chair), faceZone(desk, 'front', 75)), `chair at the desk in ${l.name}`).toBe(true)
      const armchair = placed.find((i) => i.id === 'armchair')!, side = placed.find((i) => i.id === 'side')!
      expect(gap(armchair, side), `side table beside the armchair in ${l.name}`).toBeLessThanOrEqual(5)
      for (const id of ['dresser', 'pax']) {
        const it = placed.find((i) => i.id === id)!
        expect(inside(room, accessZones(it)!.zones[0].rect), `${id}'s front faces into the room in ${l.name}`).toBe(true)
      }
      expectSpaced(solids, l.name)
      expect(pathFromDoor(room, placed, bed), `a 60 cm path from the door to the bed in ${l.name}`).toBe(true)
      expect(l.description).toMatch(/drawers face the room/)
      expect(l.description).toMatch(/pax 100 can open/)
    }
  })

  it('is deterministic and keeps parked pieces parked', () => {
    const parked: Item = { ...preset('bean-bag', 'bag'), inRoom: false, x: 60, y: 590 }
    const a = suggestLayouts(room, [...items, parked])
    const b = suggestLayouts(room, [...items, parked])
    expect(a).toEqual(b)
    for (const l of a) expect(l.placements.bag).toEqual({ x: 60, y: 590, rot: 0, inRoom: false })
  })
})
