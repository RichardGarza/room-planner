import { runChecks } from './checks'
import { doorSwing, footprint, gapBetween, intersects, isRugKind, rectOf, wallLength, wallStripRect } from './geometry'
import type { Check, Item, ItemKind, ItemPlacement, Layout, Rect, Room, Rot, Wall } from './types'

/**
 * Layout suggestions: a few good "try this" arrangements for any room.
 *
 * The anchor (the biggest bed, else the biggest solid piece) is tried with its back against
 * every wall, sliding along it in 10 cm steps. For each anchor spot the other pieces are placed
 * greedily by priority — wardrobes, dressers, the desk with its chair, bookcases, nightstands by
 * the bed head, seating and the rest, rugs last — each on the best-scoring free spot, walls first.
 * Every complete arrangement is scored with the layout checks plus a few room-sense heuristics,
 * and the best few that differ in where the bed went are returned.
 *
 * Pure and deterministic: the same room and furniture always give the same layouts.
 */

export interface SuggestOptions {
  /** how many layouts to return (default 3) */
  max?: number
}

const GRID = 10
/** width a person needs to walk past something, and the strip needed beside a bed */
const PATH = 60
const WINDOW_DEPTH = 12
const RADIATOR_CLEAR = 15
const DOORWAY_DEPTH = 40
/** how many candidate spots one call may look at before it stops trying more anchor positions */
const BUDGET = 800_000
/** how far a headboard is pulled off a window wall so it does not count as standing under the window */
const HEAD_INSET = 15
/** most anchor positions tried per wall (the sweep gets coarser on long walls) */
const ANCHOR_STEPS = 14
const LETTERS = 'ABCDEFGH'

const WALLS: Wall[] = ['top', 'left', 'right', 'bottom']
/** Rotation that turns an item's back (its −d side, the headboard of a bed) to a wall. */
const BACK_TO_WALL: Record<Wall, Rot> = { top: 0, right: 90, bottom: 180, left: 270 }
const HEAD_WALL: Record<Rot, Wall> = { 0: 'top', 90: 'right', 180: 'bottom', 270: 'left' }
/** Unit vector an item's front faces at each rotation. */
const FRONT: Record<Rot, [number, number]> = { 0: [0, 1], 90: [-1, 0], 180: [0, -1], 270: [1, 0] }
const WALL_NAME: Record<Wall, string> = { top: 'back wall', bottom: 'front wall', left: 'left wall', right: 'right wall' }
const KIND_LABEL: Record<ItemKind, string> = {
  bed: 'bed', chair: 'chair', desk: 'desk', shelf: 'shelf', dresser: 'dresser', wardrobe: 'wardrobe', bookcase: 'bookcase',
  rug: 'rug', rugRect: 'rug', nightstand: 'nightstand', sofa: 'sofa', table: 'table', box: 'piece',
}
/** Placement priority of everything but the anchor (lower first). Chairs follow their desk. */
const PRIORITY: Record<ItemKind, number> = {
  wardrobe: 0, dresser: 1, desk: 2, bookcase: 3, shelf: 3, nightstand: 4, sofa: 5, table: 5, box: 6, bed: 6, chair: 7, rug: 9, rugRect: 9,
}
/** Space kept clear in front of a piece (doors, drawers, a chair) and how much a spot loses by taking it. */
const FRONT_ZONE: Partial<Record<ItemKind, { depth: number; penalty: number; allow?: ItemKind[] }>> = {
  wardrobe: { depth: 60, penalty: -4 },
  dresser: { depth: 45, penalty: -3 },
  desk: { depth: 70, penalty: -4, allow: ['chair'] },
  bookcase: { depth: 40, penalty: -2 },
  shelf: { depth: 40, penalty: -2 },
  sofa: { depth: 60, penalty: -2, allow: ['table'] },
  table: { depth: 50, penalty: -1, allow: ['chair', 'sofa'] },
  box: { depth: 30, penalty: -1 },
}

interface Spot { x: number; y: number; rot: Rot }
interface Zone { rect: Rect; penalty: number; allow?: ItemKind[] }
interface WindowInfo { rect: Rect; sill: number; height: number; wall: Wall; offset: number; width: number }

interface Ctx {
  room: Room
  windows: WindowInfo[]
  radiators: Rect[]
  /** strips 1 m deep in front of each door: keep them fairly clear */
  approaches: Rect[]
  doorWalls: Set<Wall>
  budget: number
}

interface Arrangement {
  placed: Map<string, Item>
  solids: { item: Item; rect: Rect }[]
  zones: Zone[]
}

interface Scored {
  items: Item[]
  score: number
  checks: Check[]
  /** which wall the anchor's back is on, and where along it (a window it spans, a corner, or the middle) */
  head: { wall: Wall; side: 'left' | 'right' | 'top' | 'bottom' | 'window' | 'middle'; corner?: Wall }
  deskByWindow: boolean
  pathsOk: boolean
  leftOut: Item[]
  order: number
}

/* ---------- small geometry helpers ---------- */

const round = (v: number) => Math.round(v)
const rectAt = (x: number, y: number, fw: number, fd: number): Rect => ({ x0: x - fw / 2, y0: y - fd / 2, x1: x + fw / 2, y1: y + fd / 2 })

function spotRect(item: Pick<Item, 'w' | 'd'>, spot: Spot): Rect {
  const { fw, fd } = footprint({ w: item.w, d: item.d, rot: spot.rot })
  return rectAt(spot.x, spot.y, fw, fd)
}

function insideRoom(room: Room, r: Rect) {
  return r.x0 >= -0.01 && r.y0 >= -0.01 && r.x1 <= room.w + 0.01 && r.y1 <= room.d + 0.01
}

function touchesWall(room: Room, r: Rect, wall: Wall, reach = 5) {
  switch (wall) {
    case 'top': return r.y0 <= reach
    case 'bottom': return r.y1 >= room.d - reach
    case 'left': return r.x0 <= reach
    case 'right': return r.x1 >= room.w - reach
  }
}

function wallsTouched(room: Room, r: Rect, reach = 5): Wall[] {
  return WALLS.filter((w) => touchesWall(room, r, w, reach))
}

function spanOf(r: Rect, wall: Wall) {
  return wall === 'top' || wall === 'bottom' ? { offset: r.x0, width: r.x1 - r.x0 } : { offset: r.y0, width: r.y1 - r.y0 }
}

function spanOverlap(a: { offset: number; width: number }, b: { offset: number; width: number }) {
  return Math.min(a.offset + a.width, b.offset + b.width) - Math.max(a.offset, b.offset)
}

/** Gap between two rects (0 when they touch or overlap). */
function rectDistance(a: Rect, b: Rect) {
  const dx = Math.max(0, Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1))
  const dy = Math.max(0, Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1))
  return Math.hypot(dx, dy)
}

/** Rect of `depth` cm in front of an item standing at `spot`. */
function frontZone(item: Pick<Item, 'w' | 'd'>, spot: Spot, depth: number): Rect {
  const [nx, ny] = FRONT[spot.rot]
  const dist = item.d / 2 + depth / 2
  const cx = spot.x + nx * dist, cy = spot.y + ny * dist
  const across = item.w
  return nx === 0 ? rectAt(cx, cy, across, depth) : rectAt(cx, cy, depth, across)
}

/** Does an item under a window stand under it in the sense the checks use? */
function underWindow(ctx: Ctx, r: Rect) {
  return ctx.windows.some((w) => touchesWall(ctx.room, r, w.wall, WINDOW_DEPTH) && spanOverlap(spanOf(r, w.wall), w) >= 20)
}

/** True when the rect reaches into the doorway or the quarter circle an inward door leaf sweeps. */
function doorBlocks(room: Room, rect: Rect): boolean {
  for (const door of room.doors) {
    const strip = wallStripRect(room, door.wall, door.offset, door.width, door.swing === 'out' ? Math.min(60, door.width) : DOORWAY_DEPTH)
    if (intersects(rect, strip)) return true
    if (door.swing === 'out') continue
    const { hx, hy, r, leafDir } = doorSwing(room, door)
    if (rect.x1 <= hx - r || rect.x0 >= hx + r || rect.y1 <= hy - r || rect.y0 >= hy + r) continue
    const inside = (px: number, py: number) => px > rect.x0 + 0.5 && px < rect.x1 - 0.5 && py > rect.y0 + 0.5 && py < rect.y1 - 0.5
    for (let deg = 0; deg <= 90; deg += 5) {
      const [dx, dy] = leafDir(deg)
      for (let f = 0.1; f <= 1.001; f += 0.1) if (inside(hx + dx * r * f, hy + dy * r * f)) return true
    }
    const u = leafDir(0), v = leafDir(90)
    const cx = (rect.x0 + rect.x1) / 2, cy = (rect.y0 + rect.y1) / 2
    for (const [px, py] of [[rect.x0, rect.y0], [rect.x1, rect.y0], [rect.x0, rect.y1], [rect.x1, rect.y1], [cx, cy]]) {
      const ex = px - hx, ey = py - hy
      if (ex * ex + ey * ey < r * r - 0.5 && ex * u[0] + ey * u[1] > 0.5 && ex * v[0] + ey * v[1] > 0.5) return true
    }
  }
  return false
}

function makeCtx(room: Room): Ctx {
  return {
    room,
    windows: room.windows
      .filter((w) => w.width > 0)
      .map((w) => ({ rect: wallStripRect(room, w.wall, w.offset, w.width, WINDOW_DEPTH), sill: w.sill, height: w.height, wall: w.wall, offset: w.offset, width: w.width })),
    radiators: room.radiators.filter((r) => r.width > 0).map((r) => wallStripRect(room, r.wall, r.offset, r.width, r.depth + RADIATOR_CLEAR)),
    approaches: room.doors.map((d) => wallStripRect(room, d.wall, Math.max(0, d.offset - PATH), d.width + 2 * PATH, 100)),
    doorWalls: new Set(room.doors.map((d) => d.wall)),
    budget: BUDGET,
  }
}

/* ---------- occupancy grid: free floor, walkable paths, wasted slivers ---------- */

class Occupancy {
  readonly room: Room
  readonly nx: number
  readonly ny: number
  private readonly sat: Int32Array

  constructor(room: Room, rects: Rect[]) {
    this.room = room
    this.nx = Math.max(1, Math.ceil(room.w / GRID))
    this.ny = Math.max(1, Math.ceil(room.d / GRID))
    const cells = new Uint8Array(this.nx * this.ny)
    for (const r of rects) {
      const [i0, i1] = this.range(r.x0, r.x1, this.nx)
      const [j0, j1] = this.range(r.y0, r.y1, this.ny)
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) cells[j * this.nx + i] = 1
    }
    this.sat = summedArea(cells, this.nx, this.ny)
  }

  /** Cells whose centre lies strictly inside [lo, hi]. */
  range(lo: number, hi: number, n: number): [number, number] {
    const a = Math.max(0, Math.floor(lo / GRID - 0.5) + 1)
    const b = Math.min(n - 1, Math.ceil(hi / GRID - 0.5) - 1)
    return [a, b]
  }

  /** Number of occupied cells whose centre lies inside the rect. */
  count(r: Rect) {
    const [i0, i1] = this.range(r.x0, r.x1, this.nx)
    const [j0, j1] = this.range(r.y0, r.y1, this.ny)
    if (i1 < i0 || j1 < j0) return 0
    return satSum(this.sat, this.nx, i0, j0, i1, j1)
  }
}

function summedArea(cells: Uint8Array, nx: number, ny: number) {
  const sat = new Int32Array((nx + 1) * (ny + 1))
  for (let j = 0; j < ny; j++) {
    let row = 0
    for (let i = 0; i < nx; i++) {
      row += cells[j * nx + i]
      sat[(j + 1) * (nx + 1) + i + 1] = sat[j * (nx + 1) + i + 1] + row
    }
  }
  return sat
}

function satSum(sat: Int32Array, nx: number, i0: number, j0: number, i1: number, j1: number) {
  const W = nx + 1
  return sat[(j1 + 1) * W + i1 + 1] - sat[j0 * W + i1 + 1] - sat[(j1 + 1) * W + i0] + sat[j0 * W + i0]
}

/** Cells where a person (a PATH×PATH square) fits with nothing in the way, plus their summed-area table. */
function walkable(occ: Occupancy) {
  const { nx, ny, room } = occ
  const cells = new Uint8Array(nx * ny)
  const half = PATH / 2
  for (let j = 0; j < ny; j++) {
    const cy = (j + 0.5) * GRID
    if (cy - half < -0.01 || cy + half > room.d + 0.01) continue
    for (let i = 0; i < nx; i++) {
      const cx = (i + 0.5) * GRID
      if (cx - half < -0.01 || cx + half > room.w + 0.01) continue
      if (occ.count({ x0: cx - half, y0: cy - half, x1: cx + half, y1: cy + half }) === 0) cells[j * nx + i] = 1
    }
  }
  return { cells, sat: summedArea(cells, nx, ny) }
}

/** Can a person walk from the door to the bed along a PATH-wide route? */
function pathExists(occ: Occupancy, walk: Uint8Array, from: Rect, to: Rect) {
  const { nx, ny } = occ
  const half = PATH / 2
  const boxOf = (i: number, j: number): Rect => {
    const cx = (i + 0.5) * GRID, cy = (j + 0.5) * GRID
    return { x0: cx - half, y0: cy - half, x1: cx + half, y1: cy + half }
  }
  const seen = new Uint8Array(nx * ny)
  const queue: number[] = []
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i
    if (walk[k] && intersects(boxOf(i, j), from, 0)) { seen[k] = 1; queue.push(k) }
  }
  for (let q = 0; q < queue.length; q++) {
    const k = queue[q]
    const i = k % nx, j = (k - i) / nx
    if (intersects(boxOf(i, j), to, 0)) return true
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj
      if (ni < 0 || nj < 0 || ni >= nx || nj >= ny) continue
      const nk = nj * nx + ni
      if (!walk[nk] || seen[nk]) continue
      seen[nk] = 1
      queue.push(nk)
    }
  }
  return false
}

/** Free floor that no PATH-wide square can reach: gaps behind and between things. In m². */
function sliverArea(occ: Occupancy, walkSat: Int32Array) {
  const { nx, ny } = occ
  const reach = Math.round(PATH / 2 / GRID)
  let slivers = 0
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const cell: Rect = { x0: i * GRID, y0: j * GRID, x1: (i + 1) * GRID, y1: (j + 1) * GRID }
    if (occ.count(cell) > 0) continue
    const i0 = Math.max(0, i - reach), i1 = Math.min(nx - 1, i + reach)
    const j0 = Math.max(0, j - reach), j1 = Math.min(ny - 1, j + reach)
    if (satSum(walkSat, nx, i0, j0, i1, j1) === 0) slivers++
  }
  return (slivers * GRID * GRID) / 10000
}

/* ---------- candidate spots ---------- */

/** Positions along a wall from lo to hi: the corners first, then working inwards. */
function* sweep(lo: number, hi: number, step = GRID) {
  if (hi < lo) return
  const pts: number[] = []
  for (let t = lo; t <= hi + 0.01; t += step) pts.push(t)
  if (pts[pts.length - 1] < hi - 0.01) pts.push(hi)
  for (let a = 0, b = pts.length - 1; a <= b; a++, b--) {
    yield pts[a]
    if (a !== b) yield pts[b]
  }
}

function wallSpot(room: Room, wall: Wall, t: number, fw: number, fd: number): Spot {
  const horizontal = wall === 'top' || wall === 'bottom'
  const depth = horizontal ? fd : fw
  const x = horizontal ? t : wall === 'left' ? depth / 2 : room.w - depth / 2
  const y = horizontal ? (wall === 'top' ? depth / 2 : room.d - depth / 2) : t
  return { x: round(x), y: round(y), rot: BACK_TO_WALL[wall] }
}

function* wallSpots(room: Room, item: Pick<Item, 'w' | 'd'>, walls: Wall[] = WALLS, step = GRID): Generator<Spot> {
  for (const wall of walls) {
    const { fw, fd } = footprint({ w: item.w, d: item.d, rot: BACK_TO_WALL[wall] })
    const horizontal = wall === 'top' || wall === 'bottom'
    const along = horizontal ? fw : fd
    const depth = horizontal ? fd : fw
    if (along > wallLength(room, wall) || depth > (horizontal ? room.d : room.w)) continue
    for (const t of sweep(along / 2, wallLength(room, wall) - along / 2, step)) yield wallSpot(room, wall, t, fw, fd)
  }
}

function* gridSpots(room: Room, item: Pick<Item, 'w' | 'd'>, step = 20): Generator<Spot> {
  const rots: Rot[] = item.w === item.d ? [0] : [0, 90]
  for (const rot of rots) {
    const { fw, fd } = footprint({ w: item.w, d: item.d, rot })
    if (fw > room.w || fd > room.d) continue
    for (let y = fd / 2; y <= room.d - fd / 2 + 0.01; y += step) {
      for (let x = fw / 2; x <= room.w - fw / 2 + 0.01; x += step) yield { x: round(x), y: round(y), rot }
    }
  }
}

/* ---------- scoring one spot for one item ---------- */

/**
 * How good a spot is for an item, or -Infinity when it is not allowed (outside the room,
 * on top of something, or in the way of a door).
 */
function evaluate(ctx: Ctx, arr: Arrangement, item: Item, spot: Spot, ignore?: Item): number {
  ctx.budget--
  const room = ctx.room
  const rect = spotRect(item, spot)
  if (!insideRoom(room, rect)) return -Infinity
  for (const s of arr.solids) if (s.item !== ignore && intersects(rect, s.rect)) return -Infinity
  if (doorBlocks(room, rect)) return -Infinity

  let score = 0
  const touched = wallsTouched(room, rect)
  if (touched.length) score += 3 + (touched.length > 1 ? 1 : 0)
  if (touched.some((w) => ctx.doorWalls.has(w))) score -= 1

  for (const w of ctx.windows) {
    if (intersects(rect, w.rect) && spanOverlap(spanOf(rect, w.wall), w) >= 20) {
      if (item.h > w.sill) score -= Math.min(item.h - w.sill, w.height) / w.height > 0.7 ? 8 : 5
      else score += item.kind === 'desk' ? 4 : 0.5
    } else if (item.kind === 'desk' && rectDistance(rect, w.rect) <= 80) {
      score += 2
    }
  }
  for (const r of ctx.radiators) if (intersects(rect, r)) score -= 3
  for (const a of ctx.approaches) if (intersects(rect, a)) score -= 3
  for (const z of arr.zones) if (!z.allow?.includes(item.kind) && intersects(rect, z.rect)) score += z.penalty

  // its own doors and drawers should open: nothing right in front of it
  const fz = FRONT_ZONE[item.kind]
  if (fz) {
    const front = frontZone(item, spot, Math.min(fz.depth, 50))
    if (arr.solids.some((s) => s.item !== ignore && !fz.allow?.includes(s.item.kind) && intersects(front, s.rect))) score -= 4
  }

  // sitting right next to something else along the wall keeps the floor tidy
  if (arr.solids.some((s) => { const g = gapBetween(rect, s.rect); return g !== null && g.gap >= -0.5 && g.gap <= 10 })) score += 1
  // a nightstand belongs right by the bed, a chair near the desk
  if (item.kind === 'nightstand' && arr.solids.some((s) => s.item.kind === 'bed' && rectDistance(rect, s.rect) <= 5)) score += 3
  if (item.kind === 'chair' && arr.solids.some((s) => s.item.kind === 'desk' && rectDistance(rect, s.rect) <= 30)) score += 3
  // the chair in front of a desk must not end up in the door swing
  if (item.kind === 'desk' && doorBlocks(room, frontZone(item, spot, 60))) score -= 5

  return score
}

/* ---------- building one arrangement ---------- */

function newArrangement(): Arrangement {
  return { placed: new Map(), solids: [], zones: [] }
}

function commit(arr: Arrangement, item: Item, spot: Spot) {
  const placed: Item = { ...item, x: spot.x, y: spot.y, rot: spot.rot, inRoom: true }
  arr.placed.set(item.id, placed)
  if (!isRugKind(item.kind)) {
    arr.solids.push({ item: placed, rect: rectOf(placed) })
    const fz = FRONT_ZONE[item.kind]
    if (fz) arr.zones.push({ rect: frontZone(item, spot, fz.depth), penalty: fz.penalty, allow: fz.allow })
  }
  return placed
}

/** Strips beside a bed's long sides, past its foot, and the slots for nightstands at its head. */
function bedZones(bed: Item, spot: Spot, wantNightstands: boolean): Zone[] {
  const r = spotRect(bed, spot)
  const zones: Zone[] = []
  const alongY = spot.rot === 0 || spot.rot === 180
  const sideA: Rect = alongY ? { x0: r.x0 - PATH, y0: r.y0, x1: r.x0, y1: r.y1 } : { x0: r.x0, y0: r.y0 - PATH, x1: r.x1, y1: r.y0 }
  const sideB: Rect = alongY ? { x0: r.x1, y0: r.y0, x1: r.x1 + PATH, y1: r.y1 } : { x0: r.x0, y0: r.y1, x1: r.x1, y1: r.y1 + PATH }
  zones.push({ rect: sideA, penalty: -4, allow: ['nightstand'] }, { rect: sideB, penalty: -4, allow: ['nightstand'] })
  zones.push({ rect: frontZone(bed, spot, 50), penalty: -2 })
  if (wantNightstands) {
    // 50 cm beside each end of the headboard, against the same wall
    const head = HEAD_WALL[spot.rot]
    const depth = 45
    const slot = (side: -1 | 1): Rect => {
      switch (head) {
        case 'top': return side < 0 ? { x0: r.x0 - 50, y0: 0, x1: r.x0, y1: depth } : { x0: r.x1, y0: 0, x1: r.x1 + 50, y1: depth }
        case 'bottom': return side < 0 ? { x0: r.x0 - 50, y0: r.y1 - depth, x1: r.x0, y1: r.y1 } : { x0: r.x1, y0: r.y1 - depth, x1: r.x1 + 50, y1: r.y1 }
        case 'left': return side < 0 ? { x0: 0, y0: r.y0 - 50, x1: depth, y1: r.y0 } : { x0: 0, y0: r.y1, x1: depth, y1: r.y1 + 50 }
        case 'right': return side < 0 ? { x0: r.x1 - depth, y0: r.y0 - 50, x1: r.x1, y1: r.y0 } : { x0: r.x1 - depth, y0: r.y1, x1: r.x1, y1: r.y1 + 50 }
      }
    }
    zones.push({ rect: slot(-1), penalty: -3, allow: ['nightstand'] }, { rect: slot(1), penalty: -3, allow: ['nightstand'] })
  }
  return zones
}

/** The two spots beside a bed's head for a nightstand, back to the same wall as the headboard. */
function nightstandSpots(room: Room, bed: Item, ns: Item): Spot[] {
  const head = HEAD_WALL[bed.rot]
  const b = footprint(bed)
  const n = footprint({ w: ns.w, d: ns.d, rot: bed.rot })
  const out: Spot[] = []
  for (const side of [-1, 1]) {
    if (head === 'top' || head === 'bottom') {
      const x = bed.x + side * (b.fw / 2 + n.fw / 2)
      const y = head === 'top' ? n.fd / 2 : room.d - n.fd / 2
      out.push({ x: round(x), y: round(y), rot: bed.rot })
    } else {
      const y = bed.y + side * (b.fd / 2 + n.fd / 2)
      const x = head === 'left' ? n.fw / 2 : room.w - n.fw / 2
      out.push({ x: round(x), y: round(y), rot: bed.rot })
    }
  }
  return out
}

/** Where a chair goes to be tucked in front of a desk, facing it. */
function chairSpot(desk: Item, chair: Item): Spot {
  const [nx, ny] = FRONT[desk.rot]
  const tuck = Math.min(20, chair.d * 0.35)
  const dist = desk.d / 2 + chair.d / 2 - tuck
  return { x: round(desk.x + nx * dist), y: round(desk.y + ny * dist), rot: ((desk.rot + 180) % 360) as Rot }
}

/** Best free spot for an item: along a wall if any wall spot is allowed, else on a coarse grid. */
function bestSpot(ctx: Ctx, arr: Arrangement, item: Item): Spot | null {
  let best: Spot | null = null
  let bestScore = -Infinity
  const consider = (spots: Iterable<Spot>) => {
    for (const spot of spots) {
      const s = evaluate(ctx, arr, item, spot)
      if (s > bestScore) { bestScore = s; best = spot }
    }
  }
  consider(wallSpots(ctx.room, item))
  if (!best) consider(gridSpots(ctx.room, item))
  return best
}

/** Rugs go where the floor is most open, centred in that open area. */
function rugSpot(ctx: Ctx, arr: Arrangement, rug: Item): Spot | null {
  const room = ctx.room
  const blocked = arr.solids.map((s) => s.rect)
  for (const p of arr.placed.values()) if (isRugKind(p.kind)) blocked.push(rectOf(p))
  const occ = new Occupancy(room, blocked)
  // a rug under the door leaf is only mildly annoying, so it counts for a third
  const swing = new Occupancy(room, room.doors.map((d) => wallStripRect(room, d.wall, d.offset, d.width, Math.min(d.width, 90))))
  // centroid of the free floor
  let fx = 0, fy = 0, free = 0
  for (let j = 0; j < occ.ny; j++) for (let i = 0; i < occ.nx; i++) {
    const cell: Rect = { x0: i * GRID, y0: j * GRID, x1: (i + 1) * GRID, y1: (j + 1) * GRID }
    if (occ.count(cell) === 0) { fx += (i + 0.5) * GRID; fy += (j + 0.5) * GRID; free++ }
  }
  if (free) { fx /= free; fy /= free } else { fx = room.w / 2; fy = room.d / 2 }
  let best: Spot | null = null
  let bestCovered = Infinity
  let bestDist = Infinity
  for (const spot of gridSpots(room, rug, GRID)) {
    ctx.budget--
    const r = spotRect(rug, spot)
    const covered = occ.count(r) * 3 + swing.count(r)
    const dist = (spot.x - fx) ** 2 + (spot.y - fy) ** 2
    if (covered < bestCovered || (covered === bestCovered && dist < bestDist)) { best = spot; bestCovered = covered; bestDist = dist }
  }
  return best
}

/** Everything but the anchor, in placement order; each desk is followed by a chair when there is one. */
function placementOrder(items: Item[]): Item[] {
  const area = (i: Item) => i.w * i.d
  const sorted = [...items].sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind] || area(b) - area(a) || a.id.localeCompare(b.id))
  const chairs = sorted.filter((i) => i.kind === 'chair')
  const out: Item[] = []
  for (const it of sorted) {
    if (it.kind === 'chair') continue
    out.push(it)
    if (it.kind === 'desk' && chairs.length) out.push(chairs.shift()!)
  }
  return [...out, ...chairs]
}

function pickAnchor(items: Item[]): Item | null {
  const area = (i: Item) => i.w * i.d
  const solid = items.filter((i) => !isRugKind(i.kind))
  const beds = solid.filter((i) => i.kind === 'bed')
  const pool = beds.length ? beds : solid
  return pool.reduce<Item | null>((best, i) => (!best || area(i) > area(best) ? i : best), null)
}

function buildArrangement(ctx: Ctx, anchor: Item, anchorSpot: Spot, rest: Item[], rugs: Item[]): Arrangement {
  const arr = newArrangement()
  const bed = commit(arr, anchor, anchorSpot)
  if (anchor.kind === 'bed') arr.zones.push(...bedZones(anchor, anchorSpot, rest.some((i) => i.kind === 'nightstand')))
  const nsSlots = anchor.kind === 'bed' ? rest.filter((i) => i.kind === 'nightstand').length : 0
  let nsCandidates: Spot[] = []
  let lastDesk: Item | null = null
  for (const item of rest) {
    let spot: Spot | null = null
    if (item.kind === 'chair' && lastDesk) {
      const s = chairSpot(lastDesk, item)
      if (evaluate(ctx, arr, item, s, lastDesk) > -Infinity) spot = s
      lastDesk = null
    } else if (item.kind === 'nightstand' && nsSlots) {
      if (!nsCandidates.length) nsCandidates = nightstandSpots(ctx.room, bed, item)
      const idx = nsCandidates.findIndex((s) => evaluate(ctx, arr, item, s) > -Infinity)
      if (idx >= 0) spot = nsCandidates.splice(idx, 1)[0]
    }
    if (!spot) spot = bestSpot(ctx, arr, item)
    if (spot) {
      const placed = commit(arr, item, spot)
      if (item.kind === 'desk') lastDesk = placed
    }
  }
  for (const rug of rugs) {
    const spot = rugSpot(ctx, arr, rug)
    if (spot) commit(arr, rug, spot)
  }
  return arr
}

/* ---------- scoring a whole arrangement ---------- */

function headSide(ctx: Ctx, bed: Item): Scored['head'] {
  const wall = HEAD_WALL[bed.rot]
  const r = rectOf(bed)
  const corner = wallsTouched(ctx.room, r).find((w) => w !== wall)
  if (ctx.windows.some((w) => w.wall === wall && spanOverlap(spanOf(r, wall), w) >= 20)) return corner ? { wall, side: 'window', corner } : { wall, side: 'window' }
  if (corner) return { wall, side: corner, corner }
  return { wall, side: 'middle' }
}

/** The checks warn about anything closer than 60 cm to the bed — a nightstand is meant to be. */
function nightstandPassage(items: Item[], c: Check) {
  return c.level === 'warn' && c.text.startsWith('Passage between') && c.itemIds.some((id) => items.find((i) => i.id === id)?.kind === 'nightstand')
}

function deskNearWindow(ctx: Ctx, items: Item[]) {
  return items.some((i) => i.inRoom && i.kind === 'desk' && ctx.windows.some((w) => rectDistance(rectOf(i), w.rect) <= 80))
}

function scoreArrangement(ctx: Ctx, anchor: Item, all: Item[], order: number): Scored {
  const room = ctx.room
  const placed = all.filter((i) => i.inRoom)
  const solid = placed.filter((i) => !isRugKind(i.kind))
  const leftOut = all.filter((i) => !i.inRoom)
  const checks = runChecks(room, all).filter((c) => !nightstandPassage(all, c))
  let score = 0
  for (const c of checks) score += c.level === 'bad' ? -12 : c.level === 'warn' ? -3 : 1

  const bed = placed.find((i) => i.id === anchor.id) ?? null
  const head = bed ? headSide(ctx, bed) : { wall: 'top' as Wall, side: 'middle' as const }
  if (bed && bed.kind === 'bed' && !underWindow(ctx, rectOf(bed))) score += 3

  const deskByWindow = deskNearWindow(ctx, placed)
  if (deskByWindow) score += 3

  const occ = new Occupancy(room, solid.map(rectOf))
  const walk = walkable(occ)
  let pathsOk = true
  if (bed) {
    const target = rectOf(bed)
    const near: Rect = { x0: target.x0 - 15, y0: target.y0 - 15, x1: target.x1 + 15, y1: target.y1 + 15 }
    for (const door of room.doors) {
      if (!pathExists(occ, walk.cells, wallStripRect(room, door.wall, door.offset, door.width, DOORWAY_DEPTH), near)) pathsOk = false
    }
  }
  if (pathsOk) score += 5

  score += Math.min(8, solid.filter((i) => wallsTouched(room, rectOf(i)).length > 0).length)
  score -= sliverArea(occ, walk.sat) * 3
  score -= 8 * leftOut.length

  return { items: all, score, checks, head, deskByWindow, pathsOk, leftOut, order }
}

/* ---------- words ---------- */

function shortName(item: Item) {
  return item.kind === 'box' ? item.name.toLowerCase() : item.name.length <= 16 ? item.name.toLowerCase() : KIND_LABEL[item.kind]
}

function cornerName(walls: Wall[]) {
  const v = walls.includes('top') ? 'back' : 'front'
  const h = walls.includes('left') ? 'left' : 'right'
  return `${v}-${h}`
}

function whereIs(ctx: Ctx, item: Item) {
  const r = rectOf(item)
  if (underWindow(ctx, r)) return 'under the window'
  const touched = wallsTouched(ctx.room, r)
  if (touched.length >= 2) return `in the ${cornerName(touched)} corner`
  if (touched.length === 1) return `against the ${WALL_NAME[touched[0]]}`
  return 'in the middle of the room'
}

function bedWhere(ctx: Ctx, bed: Item, s: Scored) {
  const { wall, side, corner } = s.head
  const at = wall === 'top' ? '' : ` on the ${WALL_NAME[wall]}`
  const off = touchesWall(ctx.room, rectOf(bed), wall) ? '' : `, its head ${HEAD_INSET} cm off the wall to clear the window sill`
  if (side === 'window') return `stands under the window${at}${corner ? `, along the ${WALL_NAME[corner]}` : ''}${off}`
  if (side === 'middle') return `stands against the ${WALL_NAME[wall]}${off}`
  return `runs along the ${WALL_NAME[side]} with its head to the ${WALL_NAME[wall]}${off}`
}

function titleOf(anchor: Item, s: Scored) {
  const piece = anchor.kind === 'bed' ? 'Bed' : shortName(anchor).replace(/^./, (c) => c.toUpperCase())
  const { wall, side } = s.head
  let title: string
  if (side === 'window') title = `${piece} under the window${wall === 'top' ? '' : ` on the ${WALL_NAME[wall]}`}${s.head.corner ? `, along the ${WALL_NAME[s.head.corner]}` : ''}`
  else if (side === 'middle') title = `${piece} against the ${WALL_NAME[wall]}`
  else if (wall === 'top') title = `${piece} along the ${WALL_NAME[side]}`
  else if (wall === 'bottom') title = `${piece} along the ${WALL_NAME[side]}, head to the front`
  else title = `${piece} head against the ${WALL_NAME[wall]}, ${side === 'top' ? 'back' : 'front'} corner`
  if (s.deskByWindow && s.items.some((i) => i.inRoom && i.kind === 'desk') && anchor.kind !== 'desk') title += ', desk by the window'
  return title
}

function listNames(items: Item[]) {
  const names = items.map((i) => shortName(i))
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

function describe(ctx: Ctx, anchor: Item, s: Scored) {
  const placed = s.items.filter((i) => i.inRoom && !isRugKind(i.kind) && i.id !== anchor.id)
  const big = placed
    .filter((i) => !['chair', 'nightstand'].includes(i.kind))
    .sort((a, b) => b.w * b.d - a.w * a.d)
    .slice(0, 3)
  const bed = s.items.find((i) => i.id === anchor.id)!
  const anchorSentence = anchor.kind === 'bed' ? `The bed ${bedWhere(ctx, bed, s)}` : `The ${shortName(anchor)} stands ${whereIs(ctx, s.items.find((i) => i.id === anchor.id)!)}`
  const others = big.map((i) => `the ${shortName(i)} ${i.kind === 'desk' ? 'sits' : 'stands'} ${whereIs(ctx, i)}`)
  const first = others.length ? `${anchorSentence}; ${others.length > 1 ? `${others.slice(0, -1).join(', ')} and ${others[others.length - 1]}` : others[0]}.` : `${anchorSentence}.`
  const bad = s.checks.filter((c) => c.level === 'bad')
  const warn = s.checks.filter((c) => c.level === 'warn')
  let second: string
  if (bad.length) second = `Watch out: ${bad[0].text}${bad.length > 1 ? ` (and ${bad.length - 1} more)` : ''}.`
  else if (warn.length) second = `Trade-off: ${warn[0].text}${warn.length > 1 ? ` (and ${warn.length - 1} more)` : ''}.`
  else second = ctx.room.doors.length && s.pathsOk ? 'Nothing is in the way and the door opens fully.' : 'Nothing is in the way.'
  const out = s.leftOut.length ? ` ${listNames(s.leftOut).replace(/^./, (c) => c.toUpperCase())} did not fit and ${s.leftOut.length > 1 ? 'stay' : 'stays'} out of the room.` : ''
  return `${first} ${second}${out}`
}

/* ---------- public API ---------- */

/**
 * A few good arrangements of `items` in `room`, best first; the best one is marked recommended.
 * Every item id gets a placement; what could not be placed keeps its position with inRoom false.
 */
export function suggestLayouts(room: Room, items: Item[], opts: SuggestOptions = {}): Layout[] {
  const max = Math.max(1, opts.max ?? 3)
  const ctx = makeCtx(room)
  const anchor = pickAnchor(items)
  if (!anchor) return []
  const rugs = items.filter((i) => isRugKind(i.kind))
  const rest = placementOrder(items.filter((i) => i !== anchor && !isRugKind(i.kind)))

  const results: Scored[] = []
  let order = 0
  for (const wall of WALLS) {
    const { fw, fd } = footprint({ w: anchor.w, d: anchor.d, rot: BACK_TO_WALL[wall] })
    const horizontal = wall === 'top' || wall === 'bottom'
    const along = horizontal ? fw : fd
    const depth = horizontal ? fd : fw
    const L = wallLength(room, wall)
    if (along > L || depth > (horizontal ? room.d : room.w)) continue
    const span = L - along
    const step = Math.max(GRID, Math.ceil(span / ANCHOR_STEPS / GRID) * GRID)
    for (const t of sweep(along / 2, L - along / 2, step)) {
      if (ctx.budget <= 0) break
      const spot = wallSpot(room, wall, t, fw, fd)
      const variants = [spot]
      // a tall headboard under a window: also try it pulled a little off the wall, as people do
      const rect = spotRect(anchor, spot)
      if (ctx.windows.some((w) => w.wall === wall && anchor.h > w.sill && spanOverlap(spanOf(rect, wall), w) >= 20)) {
        const [nx, ny] = FRONT[spot.rot]
        variants.push({ x: spot.x + nx * HEAD_INSET, y: spot.y + ny * HEAD_INSET, rot: spot.rot })
      }
      for (const v of variants) {
        const r = spotRect(anchor, v)
        if (!insideRoom(room, r) || doorBlocks(room, r)) continue
        const arr = buildArrangement(ctx, anchor, v, rest, rugs)
        const all = items.map((i) => arr.placed.get(i.id) ?? { ...i, inRoom: false })
        results.push(scoreArrangement(ctx, anchor, all, order++))
      }
    }
  }

  if (!results.length) {
    // nothing fits against a wall (the anchor is too big for the room): leave it out, place the rest
    const arr = newArrangement()
    for (const item of rest) { const spot = bestSpot(ctx, arr, item); if (spot) commit(arr, item, spot) }
    for (const rug of rugs) { const spot = rugSpot(ctx, arr, rug); if (spot) commit(arr, rug, spot) }
    const all = items.map((i) => arr.placed.get(i.id) ?? { ...i, inRoom: false })
    results.push(scoreArrangement(ctx, anchor, all, 0))
  }

  results.sort((a, b) => b.score - a.score || a.order - b.order)
  // keep the best few that put the anchor somewhere meaningfully different
  const chosen: Scored[] = []
  const anchorOf = (r: Scored) => r.items.find((i) => i.id === anchor.id)!
  const similar = (a: Scored, b: Scored) => {
    if (`${a.head.wall}/${a.head.side}/${a.head.corner ?? ''}` === `${b.head.wall}/${b.head.side}/${b.head.corner ?? ''}`) return true
    const A = anchorOf(a), B = anchorOf(b)
    if (A.rot !== B.rot || !A.inRoom || !B.inRoom) return false
    return Math.hypot(A.x - B.x, A.y - B.y) < Math.max(PATH, 0.25 * wallLength(room, a.head.wall))
  }
  for (const r of results) {
    if (chosen.some((c) => similar(c, r))) continue
    chosen.push(r)
    if (chosen.length >= max) break
  }

  return chosen.map((s, i) => {
    const letter = LETTERS[i] ?? String(i + 1)
    const placements: Record<string, ItemPlacement> = {}
    for (const it of s.items) placements[it.id] = { x: it.x, y: it.y, rot: it.rot, inRoom: it.inRoom }
    const layout: Layout = {
      id: `sug-${letter.toLowerCase()}`,
      name: `${letter} · ${titleOf(anchor, s)}`,
      description: describe(ctx, anchor, s),
      placements,
    }
    if (i === 0) layout.recommended = true
    return layout
  })
}

/** Plain-English summary of a layout applied to these items (what the suggestions use as their description). */
export function describeLayout(room: Room, items: Item[], layout: Layout): string {
  const ctx = makeCtx(room)
  const all = items.map((i) => (layout.placements[i.id] ? { ...i, ...layout.placements[i.id] } : i))
  const anchor = pickAnchor(all.filter((i) => i.inRoom)) ?? pickAnchor(all)
  if (!anchor) return layout.description
  return describe(ctx, anchor, scoreArrangement(ctx, anchor, all, 0))
}
