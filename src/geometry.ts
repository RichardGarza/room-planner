import type { CheckLevel, Closet, Door, Item, ItemKind, Rect, Room, Wall } from './types'

/** Rugs are walked over and lie under other furniture, so they never collide. */
export function isRugKind(kind: ItemKind) {
  return kind === 'rug' || kind === 'rugRect'
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Any angle in degrees brought into [0, 360), rounded to 0.01° so float noise never stops 90 from being 90. */
export function normalizeRot(deg: number): number {
  if (!Number.isFinite(deg)) return 0
  const r = Math.round((((deg % 360) + 360) % 360) * 100) / 100
  return r >= 360 ? 0 : r
}

/** True for 0 / 90 / 180 / 270: the item's edges run along the room's walls. */
export function isAxisAligned(rot: number) {
  return normalizeRot(rot) % 90 === 0
}

/** The multiple of 90 nearest to an angle (for code that only knows the four wall-facing directions). */
export function snap90(rot: number): 0 | 90 | 180 | 270 {
  return ((Math.round(normalizeRot(rot) / 90) * 90) % 360) as 0 | 90 | 180 | 270
}

/** cos / sin of a plan rotation; exact for multiples of 90 so axis-aligned corners stay exact. */
function rotTrig(rot: number): [number, number] {
  const r = normalizeRot(rot)
  if (r % 90 === 0) {
    const q = (r / 90) % 4
    return [[1, 0, -1, 0][q], [0, 1, 0, -1][q]]
  }
  const a = (r * Math.PI) / 180
  return [Math.cos(a), Math.sin(a)]
}

/**
 * Footprint size after rotation: the axis-aligned extents. Exact for 0 / 90 / 180 / 270; for any
 * other angle fw = |w cos θ| + |d sin θ|, fd = |w sin θ| + |d cos θ| (the rotated box's bounding box),
 * so everything that works with rectOf stays conservative.
 */
export function footprint(item: Pick<Item, 'w' | 'd' | 'rot'>) {
  const [c, s] = rotTrig(item.rot)
  return { fw: Math.abs(item.w * c) + Math.abs(item.d * s), fd: Math.abs(item.w * s) + Math.abs(item.d * c) }
}

/** Axis-aligned bounding box of the (possibly turned) item. */
export function rectOf(item: Item): Rect {
  const { fw, fd } = footprint(item)
  return { x0: item.x - fw / 2, y0: item.y - fd / 2, x1: item.x + fw / 2, y1: item.y + fd / 2 }
}

/** A convex polygon in room coordinates, corners in order. */
export type Polygon = [number, number][]

/** The item's four corners after rotation about its centre (same winding as SVG's rotate: clockwise on the plan). */
export function polygonOf(item: Pick<Item, 'w' | 'd' | 'rot' | 'x' | 'y'>): Polygon {
  const [c, s] = rotTrig(item.rot)
  const hw = item.w / 2, hd = item.d / 2
  const local: [number, number][] = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]]
  return local.map(([lx, ly]) => [item.x + lx * c - ly * s, item.y + lx * s + ly * c])
}

export function rectToPolygon(r: Rect): Polygon {
  return [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]]
}

export function polygonBounds(poly: Polygon): Rect {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const [x, y] of poly) {
    if (x < x0) x0 = x
    if (x > x1) x1 = x
    if (y < y0) y0 = y
    if (y > y1) y1 = y
  }
  return { x0, y0, x1, y1 }
}

/** True when every edge runs along x or y (the polygon is an axis-aligned box). */
function polygonIsAxisAligned(poly: Polygon) {
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % poly.length]
    if (Math.abs(ax - bx) > 1e-9 && Math.abs(ay - by) > 1e-9) return false
  }
  return true
}

/**
 * Separating-axis test for two convex polygons. Like `intersects` for rects, they only count as
 * overlapping when they share more than `tolerance` cm along every axis, so edges touching is fine.
 */
export function polygonsIntersect(a: Polygon, b: Polygon, tolerance = 0.5) {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % poly.length]
      const ex = bx - ax, ey = by - ay
      const len = Math.hypot(ex, ey)
      if (len < 1e-9) continue
      // the edge normal, unit length so the tolerance is in cm
      const nx = -ey / len, ny = ex / len
      let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity
      for (const [x, y] of a) { const p = x * nx + y * ny; if (p < minA) minA = p; if (p > maxA) maxA = p }
      for (const [x, y] of b) { const p = x * nx + y * ny; if (p < minB) minB = p; if (p > maxB) maxB = p }
      if (Math.min(maxA, maxB) - Math.max(minA, minB) <= tolerance) return false
    }
  }
  return true
}

/** Does a polygon reach into a rect (a wall strip, a doorway, the floor a closet needs)? Exact for turned items. */
export function polygonIntersectsRect(poly: Polygon, rect: Rect, tolerance = 0.5) {
  const bounds = polygonBounds(poly)
  if (!intersects(bounds, rect, tolerance)) return false
  if (polygonIsAxisAligned(poly)) return true
  return polygonsIntersect(poly, rectToPolygon(rect), tolerance)
}

/** Exact overlap test between two items: their bounding boxes when both stand square, else their turned outlines. */
export function itemsIntersect(a: Item, b: Item, tolerance = 0.5) {
  if (isAxisAligned(a.rot) && isAxisAligned(b.rot)) return intersects(rectOf(a), rectOf(b), tolerance)
  const pa = polygonOf(a), pb = polygonOf(b)
  if (!intersects(polygonBounds(pa), polygonBounds(pb), tolerance)) return false
  return polygonsIntersect(pa, pb, tolerance)
}

/** Strictly inside a convex polygon (points on the outline do not count), whichever way it winds. */
export function pointInPolygon(px: number, py: number, poly: Polygon) {
  let sign = 0
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % poly.length]
    const cross = (bx - ax) * (py - ay) - (by - ay) * (px - ax)
    if (Math.abs(cross) < 1e-9) return false
    const s = cross > 0 ? 1 : -1
    if (sign === 0) sign = s
    else if (s !== sign) return false
  }
  return true
}

export function overlapArea(a: Rect, b: Rect) {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0)
  return w > 0 && h > 0 ? w * h : 0
}

export function intersects(a: Rect, b: Rect, tolerance = 0.5) {
  return a.x0 < b.x1 - tolerance && a.x1 > b.x0 + tolerance && a.y0 < b.y1 - tolerance && a.y1 > b.y0 + tolerance
}

/** Gap between two rects along x or y when they overlap on the other axis. null when they are diagonal. */
export function gapBetween(a: Rect, b: Rect): { axis: 'x' | 'y'; gap: number } | null {
  const overlapY = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0)
  const overlapX = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)
  if (overlapY > 10) {
    const gap = a.x0 < b.x0 ? b.x0 - a.x1 : a.x0 - b.x1
    return { axis: 'x', gap }
  }
  if (overlapX > 10) {
    const gap = a.y0 < b.y0 ? b.y0 - a.y1 : a.y0 - b.y1
    return { axis: 'y', gap }
  }
  return null
}

/** Rect that an opening / radiator occupies against its wall, projected `depth` cm into the room. */
export function wallStripRect(room: Room, wall: Wall, offset: number, width: number, depth: number): Rect {
  switch (wall) {
    case 'top':
      return { x0: offset, y0: 0, x1: offset + width, y1: depth }
    case 'bottom':
      return { x0: offset, y0: room.d - depth, x1: offset + width, y1: room.d }
    case 'left':
      return { x0: 0, y0: offset, x1: depth, y1: offset + width }
    case 'right':
      return { x0: room.w - depth, y0: offset, x1: room.w, y1: offset + width }
  }
}

/** Unit tangent along a wall (direction of increasing offset) and the normal pointing into the room. */
export function wallAxes(wall: Wall): { along: [number, number]; normal: [number, number] } {
  switch (wall) {
    case 'top': return { along: [1, 0], normal: [0, 1] }
    case 'bottom': return { along: [1, 0], normal: [0, -1] }
    case 'left': return { along: [0, 1], normal: [1, 0] }
    case 'right': return { along: [0, 1], normal: [-1, 0] }
  }
}

/** Point on a wall line at distance `t` along it from its start (x=0 or y=0 end). */
export function wallPoint(room: Room, wall: Wall, t: number): [number, number] {
  switch (wall) {
    case 'top': return [t, 0]
    case 'bottom': return [t, room.d]
    case 'left': return [0, t]
    case 'right': return [room.w, t]
  }
}

export function wallLength(room: Room, wall: Wall) {
  return wall === 'top' || wall === 'bottom' ? room.w : room.d
}

/**
 * Door swing: hinge point, and the leaf direction as a function of the opening angle.
 * `hinge: 'left'` means the hinge sits at the smaller offset along the wall.
 * A door that swings "out" sweeps away from the room: the wall normal is mirrored.
 */
export function doorSwing(room: Room, door: Door) {
  const { along, normal: inward } = wallAxes(door.wall)
  const out = door.swing === 'out'
  const normal: [number, number] = out ? [-inward[0], -inward[1]] : inward
  const sign = door.hinge === 'left' ? 1 : -1
  const [hx, hy] = wallPoint(room, door.wall, door.hinge === 'left' ? door.offset : door.offset + door.width)
  const leafDir = (deg: number): [number, number] => {
    const a = (deg * Math.PI) / 180
    return [sign * along[0] * Math.cos(a) + normal[0] * Math.sin(a), sign * along[1] * Math.cos(a) + normal[1] * Math.sin(a)]
  }
  return { hx, hy, r: door.width, leafDir, sign, out }
}

/** Strip `depth` cm into the room in front of a door: what must stay clear to walk through it. */
export function doorwayRect(room: Room, door: Door, depth = 40): Rect {
  return wallStripRect(room, door.wall, door.offset, door.width, depth)
}

/**
 * Max angle (deg, 0..90) one door can open before hitting an item.
 * An out-swinging leaf never meets the furniture, so it always reports 90.
 */
export function doorClearanceFor(room: Room, door: Door, items: Item[]) {
  let best = 90
  let blocker: Item | null = null
  if (door.swing === 'out') return { maxAngle: best, blocker }
  const { hx, hy, r, leafDir } = doorSwing(room, door)
  for (const it of items) {
    if (!it.inRoom || isRugKind(it.kind)) continue
    const poly = polygonOf(it)
    const rc = polygonBounds(poly)
    for (let deg = 5; deg <= 90; deg += 5) {
      const [dx, dy] = leafDir(deg)
      let hit = false
      for (const f of [0.3, 0.5, 0.7, 0.85, 1]) {
        const px = hx + dx * r * f
        const py = hy + dy * r * f
        if (px > rc.x0 && px < rc.x1 && py > rc.y0 && py < rc.y1 && pointInPolygon(px, py, poly)) { hit = true; break }
      }
      if (hit) {
        if (deg - 5 < best) { best = deg - 5; blocker = it }
        break
      }
    }
  }
  return { maxAngle: best, blocker }
}

/** Worst clearance over all the room's doors (90 with nothing in the way). */
export function doorClearance(room: Room, items: Item[]) {
  let result: { maxAngle: number; blocker: Item | null; door: Door | null } = { maxAngle: 90, blocker: null, door: null }
  for (const door of room.doors) {
    const c = doorClearanceFor(room, door, items)
    if (c.maxAngle < result.maxAngle) result = { ...c, door }
  }
  return result
}

/* ---------- closets ---------- */

/** Default height of a closet opening (cm). */
export const CLOSET_HEIGHT = 203

/** The closet opening as a strip on the wall line, projected `depth` cm into the room (0 = the line itself). */
export function closetOpeningRect(room: Room, closet: Closet, depth = 0): Rect {
  return wallStripRect(room, closet.wall, closet.offset, closet.width, depth)
}

/** The recess itself: the closet's depth beyond the wall line, outside the room. */
export function closetRecessRect(room: Room, closet: Closet): Rect {
  const { normal } = wallAxes(closet.wall)
  const strip = closetOpeningRect(room, closet, 0)
  const dx = -normal[0] * closet.depth, dy = -normal[1] * closet.depth
  return {
    x0: Math.min(strip.x0, strip.x0 + dx), y0: Math.min(strip.y0, strip.y0 + dy),
    x1: Math.max(strip.x1, strip.x1 + dx), y1: Math.max(strip.y1, strip.y1 + dy),
  }
}

/** How deep the floor in front of a closet must stay free for its doors to work (or for you to reach in). */
export function closetClearanceDepth(closet: Closet): number {
  switch (closet.doors) {
    case 'hinged': return Math.round(closet.width / 2 + 10)
    case 'bifold': return Math.round(closet.width / 4 + 15)
    case 'sliding': return 40
    case 'none': return 40
  }
}

export interface ClosetClearance {
  /** the floor area inside the room that should stay free */
  rect: Rect
  /** hinged and bi-fold doors cannot open at all when blocked; a sliding or open closet is only awkward */
  level: Exclude<CheckLevel, 'ok'>
  /** the check text for an item standing in the rect; `label` is "the closet" or "closet 2" */
  text: (itemName: string, label?: string) => string
}

/**
 * The area in front of a closet that must stay free, and the check it raises when something stands there:
 * no doors → 40 cm (warn: you can still reach in), sliding → 40 cm (warn), bi-fold → width/4 + 15 cm (bad),
 * hinged → width/2 + 10 cm, two leaves each half the width swinging into the room (bad).
 */
export function closetClearance(room: Room, closet: Closet): ClosetClearance {
  const rect = closetOpeningRect(room, closet, closetClearanceDepth(closet))
  const blocksDoors = closet.doors === 'hinged' || closet.doors === 'bifold'
  return {
    rect,
    level: blocksDoors ? 'bad' : 'warn',
    text: (itemName, label = 'the closet') => (blocksDoors ? `${itemName} blocks ${label === 'the closet' ? 'the closet doors' : `the doors of ${label}`}` : `${itemName} is in front of ${label}`),
  }
}

/**
 * How far the plan's parking strip has to move down to clear a closet recess on the front wall
 * (the strip normally starts 30 cm below the room, with 10 cm to spare beyond the recess).
 */
export function frontRecessPad(room: Room): number {
  return Math.max(0, ...(room.closets ?? []).filter((c) => c.wall === 'bottom').map((c) => c.depth + 10 - 30))
}

/** "the closet" with one, "closet 2" with several (1-based). */
export function closetLabel(i: number, count: number) {
  return count > 1 ? `closet ${i + 1}` : 'the closet'
}

export function wallLabel(w: Wall) {
  return { top: 'window wall', bottom: 'door wall', left: 'left wall', right: 'right wall' }[w]
}
