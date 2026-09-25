import { isAccessCheck, runChecks } from './checks'
import {
  accessRuleFor,
  accessAllows,
  accessZones,
  areCompanions,
  closetClearance,
  doorSwing,
  footprint,
  fractionInRoom,
  frontZone,
  intersects,
  isAxisAligned,
  isRealBed,
  isRugKind,
  isSideTable,
  itemsGap,
  localToRoom,
  overlapArea,
  polygonBounds,
  polygonDistance,
  polygonIntersectsRect,
  polygonOf,
  rectDistance,
  rectOf,
  rectToPolygon,
  snap90,
  wallLength,
  wallStripRect,
  type AccessRule,
  type Polygon,
} from './geometry'
import type { Check, Item, ItemKind, ItemPlacement, Layout, Rect, Room, Rot, Wall } from './types'

/**
 * Layout suggestions: a few good "try this" arrangements for any room.
 *
 * The anchor (the biggest bed, else the biggest solid piece) is tried with its back against
 * every wall, sliding along it in 10 cm steps. For each anchor spot the other pieces are placed
 * greedily by priority — wardrobes, dressers, the desk with its chair, bookcases, nightstands by
 * the bed head, seating with its side tables and the rest, rugs last — each on the best-scoring
 * free spot, walls first. A spot is only allowed when the piece's own access space (the floor its
 * drawers, doors or chair need, see accessRules in geometry.ts) faces open floor, and when it does
 * not stand in the access space of anything already placed. Pieces that do not belong together
 * (companions: nightstand and bed, chair and desk, side table and sofa) are kept 45 cm apart when
 * the room allows it. Every complete arrangement is scored with the layout checks plus a few
 * room-sense heuristics, and the best few that differ in where the anchor went are returned.
 *
 * Locked pieces stay exactly where they are in every layout and everything else is arranged
 * around them. Furniture the user has taken out of the room takes no part and stays out.
 *
 * Pure and deterministic: the same room and furniture always give the same layouts.
 */

export interface SuggestOptions {
  /** how many layouts to return (default 3) */
  max?: number
  /** keep locked pieces where they are and arrange the rest around them (default true) */
  respectLocks?: boolean
}

const GRID = 10
/** width a person needs to walk past something, and the strip needed beside a bed */
const PATH = 60
/** walking gap kept between solid pieces that do not belong together */
export const MIN_GAP = 45
const WINDOW_DEPTH = 12
const RADIATOR_CLEAR = 15
const DOORWAY_DEPTH = 40
/** how many candidate spots one call may look at before it stops trying more anchor positions */
const BUDGET = 800_000
/** how far a headboard is pulled off a window wall so it does not count as standing under the window */
const HEAD_INSET = 15
/** most anchor positions tried per wall (the sweep gets coarser on long walls) */
const ANCHOR_STEPS = 14
/** a bed side counts as usable while this much of its strip is inside the room and free */
const SIDE_FREE = 0.6
const LETTERS = 'ABCDEFGH'

const WALLS: Wall[] = ['top', 'left', 'right', 'bottom']
/** Rotation that turns an item's back (its −d side, the headboard of a bed) to a wall. */
const BACK_TO_WALL: Record<Wall, Rot> = { top: 0, right: 90, bottom: 180, left: 270 }
/** Suggestions only turn things by quarter turns; an item saved at any other angle counts as the nearest one. */
const HEAD_WALL: Record<0 | 90 | 180 | 270, Wall> = { 0: 'top', 90: 'right', 180: 'bottom', 270: 'left' }
/** Unit vector an item's front faces at each rotation. */
const FRONT: Record<0 | 90 | 180 | 270, [number, number]> = { 0: [0, 1], 90: [-1, 0], 180: [0, -1], 270: [1, 0] }
const WALL_NAME: Record<Wall, string> = { top: 'back wall', bottom: 'front wall', left: 'left wall', right: 'right wall' }
const KIND_LABEL: Record<ItemKind, string> = {
  bed: 'bed', chair: 'chair', desk: 'desk', shelf: 'shelf', dresser: 'dresser', wardrobe: 'wardrobe', bookcase: 'bookcase',
  rug: 'rug', rugRect: 'rug', nightstand: 'nightstand', sofa: 'sofa', table: 'table', plant: 'plant', box: 'piece',
}
/** Placement priority of everything but the anchor (lower first). Chairs follow their desk, side tables their sofa. */
const PRIORITY: Record<ItemKind, number> = {
  wardrobe: 0, dresser: 1, sofa: 1, desk: 2, bookcase: 3, shelf: 3, nightstand: 4, table: 5, box: 6, bed: 6, chair: 7, plant: 8, rug: 9, rugRect: 9,
}
/** Kinds that belong against a wall: one of them left standing in the open costs a layout dearly. */
const WALL_KINDS = new Set<ItemKind>(['wardrobe', 'dresser', 'sofa', 'desk', 'bookcase', 'shelf', 'bed'])

interface Spot { x: number; y: number; rot: Rot }
/** A solid piece already standing in the arrangement; `poly` only when it is turned off the axes (a locked piece). */
interface Solid { item: Item; rect: Rect; poly?: Polygon }
/**
 * Floor that a candidate should (or must) keep off. Access space of a placed piece carries its
 * `host` (companions may stand in it); the soft zones around a bed list the kinds they allow.
 */
interface Zone { rect: Rect; poly?: Polygon; penalty: number; hard: boolean; host?: Item; allow?: ItemKind[] }
interface WindowInfo { rect: Rect; sill: number; height: number; wall: Wall; offset: number; width: number }

interface Ctx {
  room: Room
  windows: WindowInfo[]
  radiators: Rect[]
  /** strips 1 m deep in front of each door: keep them fairly clear */
  approaches: Rect[]
  /** the floor closet doors need to open: nothing may stand there */
  closets: Rect[]
  doorWalls: Set<Wall>
  /** pieces that stay exactly where they are (obstacles in every arrangement) */
  locked: Item[]
  /** a side table is waiting to go at the end of a sofa, so a sofa spot should leave room for one */
  wantsSideTables: boolean
  budget: number
}

interface Arrangement {
  placed: Map<string, Item>
  solids: Solid[]
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
  /** some pair stands closer than MIN_GAP, or a nightstand or side table is away from its bed or sofa */
  crowded: boolean
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

/** Pieces with a front (drawers, doors, a headboard) only count as "on a wall" when their back is against one. */
function hasBack(item: Pick<Item, 'kind' | 'w' | 'd'>) {
  return item.kind === 'bed' || accessRuleFor(item)?.mode === 'all'
}

/** Is the wall behind the piece's back (its −d side) a room wall? Anything without a front just needs to touch one. */
function onWall(room: Room, item: Pick<Item, 'kind' | 'w' | 'd' | 'rot'>, r: Rect) {
  if (!hasBack(item)) return wallsTouched(room, r).length > 0
  return touchesWall(room, r, HEAD_WALL[snap90(item.rot)])
}

function spanOf(r: Rect, wall: Wall) {
  return wall === 'top' || wall === 'bottom' ? { offset: r.x0, width: r.x1 - r.x0 } : { offset: r.y0, width: r.y1 - r.y0 }
}

function spanOverlap(a: { offset: number; width: number }, b: { offset: number; width: number }) {
  return Math.min(a.offset + a.width, b.offset + b.width) - Math.max(a.offset, b.offset)
}

/** Does an axis-aligned rect reach into a solid or zone (its turned outline when it has one)? */
function hits(rect: Rect, target: { rect: Rect; poly?: Polygon }) {
  if (!intersects(rect, target.rect)) return false
  return !target.poly || polygonIntersectsRect(target.poly, rect)
}

/** Gap between an axis-aligned rect and a solid (0 when they touch). */
function gapTo(rect: Rect, s: Solid) {
  return s.poly ? polygonDistance(rectToPolygon(rect), s.poly) : rectDistance(rect, s.rect)
}

/** The item as it would stand at a spot. */
function at(item: Item, spot: Spot): Item {
  return { ...item, x: spot.x, y: spot.y, rot: spot.rot, inRoom: true }
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

function makeCtx(room: Room, locked: Item[] = []): Ctx {
  return {
    room,
    windows: room.windows
      .filter((w) => w.width > 0)
      .map((w) => ({ rect: wallStripRect(room, w.wall, w.offset, w.width, WINDOW_DEPTH), sill: w.sill, height: w.height, wall: w.wall, offset: w.offset, width: w.width })),
    radiators: room.radiators.filter((r) => r.width > 0).map((r) => wallStripRect(room, r.wall, r.offset, r.width, r.depth + RADIATOR_CLEAR)),
    approaches: room.doors.map((d) => wallStripRect(room, d.wall, Math.max(0, d.offset - PATH), d.width + 2 * PATH, 100)),
    closets: (room.closets ?? []).map((c) => closetClearance(room, c).rect),
    doorWalls: new Set(room.doors.map((d) => d.wall)),
    locked,
    wantsSideTables: false,
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

/**
 * Can a person walk a PATH-wide (60 cm) route from every door to within reach of `target`,
 * past the solid furniture in `items`? Exported so tests can assert it on a layout.
 */
export function walkablePath(room: Room, items: Item[], target: Item): boolean {
  const occ = new Occupancy(room, items.filter((i) => i.inRoom && !isRugKind(i.kind)).map(rectOf))
  const walk = walkable(occ)
  const t = rectOf(target)
  const near: Rect = { x0: t.x0 - 15, y0: t.y0 - 15, x1: t.x1 + 15, y1: t.y1 + 15 }
  return room.doors.every((door) => pathExists(occ, walk.cells, wallStripRect(room, door.wall, door.offset, door.width, DOORWAY_DEPTH), near))
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

/**
 * A spot's centre rounded to whole centimetres without leaving the room: an odd-sized piece
 * against the far wall is rounded inwards, not half a centimetre through the wall.
 */
function snapInside(room: Room, item: Pick<Item, 'w' | 'd'>, spot: Spot): Spot {
  const { fw, fd } = footprint({ w: item.w, d: item.d, rot: spot.rot })
  const x = fw > room.w ? round(spot.x) : Math.min(Math.max(round(spot.x), Math.ceil(fw / 2)), Math.floor(room.w - fw / 2))
  const y = fd > room.d ? round(spot.y) : Math.min(Math.max(round(spot.y), Math.ceil(fd / 2)), Math.floor(room.d - fd / 2))
  return { x, y, rot: spot.rot }
}

function wallSpot(room: Room, wall: Wall, t: number, item: Pick<Item, 'w' | 'd'>): Spot {
  const rot = BACK_TO_WALL[wall]
  const { fw, fd } = footprint({ w: item.w, d: item.d, rot })
  const horizontal = wall === 'top' || wall === 'bottom'
  const depth = horizontal ? fd : fw
  const x = horizontal ? t : wall === 'left' ? depth / 2 : room.w - depth / 2
  const y = horizontal ? (wall === 'top' ? depth / 2 : room.d - depth / 2) : t
  return snapInside(room, item, { x, y, rot })
}

/**
 * Centres to try along a wall for a piece `along` cm wide: a sweep from the corners inwards in
 * `step` cm, plus spots flush against, and a walking gap away from, everything already standing
 * in the arrangement (and the closet clearance), so a piece can slot exactly between two others
 * even when that spot is off the grid. Empty when the piece is wider than the wall.
 */
function wallPositions(ctx: Ctx, arr: Arrangement, wall: Wall, along: number, step: number): number[] {
  const L = wallLength(ctx.room, wall)
  const lo = along / 2, hi = L - along / 2
  if (hi < lo) return []
  const out: number[] = [...sweep(lo, hi, step)]
  const seen = new Set(out.map((t) => round(t)))
  const horizontal = wall === 'top' || wall === 'bottom'
  const edges: number[] = []
  for (const r of [...arr.solids.map((s) => s.rect), ...arr.zones.filter((z) => z.hard).map((z) => z.rect), ...ctx.closets]) {
    edges.push(horizontal ? r.x0 : r.y0, horizontal ? r.x1 : r.y1)
  }
  for (const e of edges) {
    for (const t of [e + along / 2, e + MIN_GAP + along / 2, e - along / 2, e - MIN_GAP - along / 2]) {
      const v = round(t)
      if (v < lo - 0.01 || v > hi + 0.01 || seen.has(v)) continue
      seen.add(v)
      out.push(v)
    }
  }
  return out
}

/** Wall spots for the pieces placed after the anchor: a 20 cm sweep, plus the spots flush against (and a gap away from) what already stands there. */
function* wallSpots(ctx: Ctx, arr: Arrangement, item: Pick<Item, 'w' | 'd'>, walls: Wall[] = WALLS, step = 2 * GRID): Generator<Spot> {
  const room = ctx.room
  for (const wall of walls) {
    const { fw, fd } = footprint({ w: item.w, d: item.d, rot: BACK_TO_WALL[wall] })
    const horizontal = wall === 'top' || wall === 'bottom'
    const along = horizontal ? fw : fd
    const depth = horizontal ? fd : fw
    if (along > wallLength(room, wall) || depth > (horizontal ? room.d : room.w)) continue
    for (const t of wallPositions(ctx, arr, wall, along, step)) yield wallSpot(room, wall, t, item)
  }
}

/** Spots on a coarse grid over the floor; a piece with a front is tried facing all four ways so it can face open floor. */
function* gridSpots(room: Room, item: Pick<Item, 'w' | 'd' | 'kind'>, step = 20): Generator<Spot> {
  const faced = accessZones({ ...item, x: 0, y: 0, rot: 0 }) !== null
  const rots: Rot[] = faced ? [0, 90, 180, 270] : item.w === item.d ? [0] : [0, 90]
  for (const rot of rots) {
    const { fw, fd } = footprint({ w: item.w, d: item.d, rot })
    if (fw > room.w || fd > room.d) continue
    for (let y = fd / 2; y <= room.d - fd / 2 + 0.01; y += step) {
      for (let x = fw / 2; x <= room.w - fw / 2 + 0.01; x += step) yield snapInside(room, item, { x, y, rot })
    }
  }
}

/* ---------- scoring one spot for one item ---------- */

/** The strips an access rule asks for around a piece standing square at a spot (quarter turns only), as plain rects. */
function zoneRects(item: Pick<Item, 'w' | 'd'>, spot: Spot, rule: AccessRule): Rect[] {
  const [nx, ny] = FRONT[snap90(spot.rot)]
  const strip = (dx: number, dy: number, across: number, depth: number, off: number): Rect => {
    const cx = spot.x + dx * (off + depth / 2), cy = spot.y + dy * (off + depth / 2)
    return dx === 0 ? rectAt(cx, cy, across, depth) : rectAt(cx, cy, depth, across)
  }
  const front = (): Rect => strip(nx, ny, item.w, rule.depth, item.d / 2)
  const back = (): Rect => strip(-nx, -ny, item.w, rule.depth, item.d / 2)
  // the item's local +x axis in room coordinates is the front vector turned a quarter back
  const sides = (): Rect[] => [strip(-ny, nx, item.d, rule.depth, item.w / 2), strip(ny, -nx, item.d, rule.depth, item.w / 2)]
  if (rule.faces === 'front') return [front()]
  if (rule.faces === 'all') return [front(), back(), ...sides()]
  return item.d >= item.w ? sides() : [front(), back()]
}

/**
 * How good a spot is for an item, or -Infinity when it is not allowed: outside the room, on
 * top of something, in the way of a door or of the closet doors, in the access space of a piece
 * already placed (unless the two belong together), or with its own drawers, doors or chair
 * facing a wall or another piece.
 */
function evaluate(ctx: Ctx, arr: Arrangement, item: Item, spot: Spot, ignore?: Item): number {
  ctx.budget--
  const room = ctx.room
  const rect = spotRect(item, spot)
  if (!insideRoom(room, rect)) return -Infinity
  for (const s of arr.solids) if (s.item !== ignore && hits(rect, s)) return -Infinity
  if (doorBlocks(room, rect)) return -Infinity
  for (const c of ctx.closets) if (intersects(rect, c)) return -Infinity

  let score = 0
  // the access space of what already stands there is off limits, unless the two belong together
  for (const z of arr.zones) {
    if (z.host && (z.host === ignore || accessAllows(z.host, item))) continue
    if (!z.host && z.allow?.includes(item.kind)) continue
    if (!hits(rect, z)) continue
    if (z.hard) return -Infinity
    score += z.penalty
  }
  // its own drawers, doors or chair need free floor in front: never facing a wall or another piece
  const rule = accessRuleFor(item)
  if (rule) {
    const zones = zoneRects(item, spot, rule)
    let clear = 0
    for (const z of zones) {
      if (rule.mode === 'all' ? !insideRoom(room, z) : fractionInRoom(room, z) < SIDE_FREE) continue
      if (arr.solids.some((s) => s.item !== ignore && !accessAllows(item, s.item) && hits(z, s))) continue
      clear++
    }
    if (rule.mode === 'all' ? clear < zones.length : clear === 0) return -Infinity
  }

  const touched = wallsTouched(room, rect)
  if (onWall(room, { ...item, rot: spot.rot }, rect)) score += 3 + (touched.length > 1 ? 1 : 0)
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

  // breathing room: anything that does not belong right next to this piece should be a walking gap away
  for (const s of arr.solids) {
    if (s.item === ignore || areCompanions(item, s.item)) continue
    const g = gapTo(rect, s)
    if (g < MIN_GAP) score -= 3 + 5 * (1 - g / MIN_GAP)
  }
  // a nightstand belongs right by the bed, a chair near the desk, a side table by the sofa
  if (item.kind === 'nightstand' && arr.solids.some((s) => s.item.kind === 'bed' && rectDistance(rect, s.rect) <= 5)) score += 3
  if (item.kind === 'chair' && arr.solids.some((s) => s.item.kind === 'desk' && rectDistance(rect, s.rect) <= 30)) score += 3
  if (isSideTable(item) && arr.solids.some((s) => s.item.kind === 'sofa' && rectDistance(rect, s.rect) <= 5)) score += 3
  // the chair in front of a desk must not end up in the door swing or in someone else's access space,
  // and wants its own breathing room from the neighbours too
  if (item.kind === 'desk') {
    const chairArea = polygonBounds(frontZone(at(item, spot), 60))
    if (doorBlocks(room, chairArea)) score -= 5
    if (arr.zones.some((z) => z.hard && z.host && !accessAllows(z.host, { kind: 'chair', w: 50, d: 50, h: 90 }) && hits(chairArea, z))) score -= 6
    const seat = polygonBounds(frontZone(at(item, spot), 40))
    for (const s of arr.solids) {
      if (s.item === ignore || s.item.kind === 'chair') continue
      const g = gapTo(seat, s)
      if (g < MIN_GAP) score -= 3 + 5 * (1 - g / MIN_GAP)
    }
  }
  // a sofa with a side table to come should leave room for it at one end
  if (item.kind === 'sofa' && ctx.wantsSideTables && !sideSlotFree(ctx, arr, at(item, spot), ignore)) score -= 5

  return score
}

/** Would a 50 × 50 side table fit at either end of this sofa (inside the room, on nothing, out of every hard zone)? */
function sideSlotFree(ctx: Ctx, arr: Arrangement, sofa: Item, ignore?: Item) {
  const table: Item = { ...sofa, id: `${sofa.id}-side`, kind: 'table', w: 50, d: 50, h: 55 }
  return sofaSideSpots(ctx.room, sofa, table).some((s) => {
    const r = spotRect(table, s)
    if (!insideRoom(ctx.room, r) || doorBlocks(ctx.room, r)) return false
    if (arr.solids.some((o) => o.item !== ignore && o.item !== sofa && hits(r, o))) return false
    if (ctx.closets.some((c) => intersects(r, c))) return false
    return !arr.zones.some((z) => z.hard && z.host && z.host !== ignore && !accessAllows(z.host, table) && hits(r, z))
  })
}

/* ---------- building one arrangement ---------- */

/** An empty arrangement with the locked pieces already standing where they are. */
function newArrangement(ctx: Ctx): Arrangement {
  const arr: Arrangement = { placed: new Map(), solids: [], zones: [] }
  for (const it of ctx.locked) commit(ctx, arr, it, { x: it.x, y: it.y, rot: it.rot })
  return arr
}

function commit(ctx: Ctx, arr: Arrangement, item: Item, spot: Spot) {
  const placed = at(item, spot)
  arr.placed.set(item.id, placed)
  if (!isRugKind(item.kind)) {
    const square = isAxisAligned(placed.rot)
    const solid: Solid = { item: placed, rect: rectOf(placed) }
    if (!square) solid.poly = polygonOf(placed)
    arr.solids.push(solid)
    const access = accessZones(placed)
    if (access) {
      // every strip a dresser, wardrobe, desk or dining table needs is a hard no-go; a bed's or a small
      // table's sides only need to be mostly free (one of them), so they are soft — strongly so when
      // just one is left inside the room
      const hard = access.rule.mode === 'all'
      const zones = hard ? access.zones : access.zones.filter((z) => fractionInRoom(ctx.room, z.rect) >= SIDE_FREE)
      const penalty = hard ? -4 : zones.length <= 1 ? -6 : -4
      for (const z of zones) arr.zones.push({ rect: z.rect, poly: square ? undefined : z.poly, penalty, hard, host: placed })
    }
  }
  return placed
}

/** The strip past a bed's foot, and the slots for nightstands at its head. */
function bedZones(bed: Item, spot: Spot, wantNightstands: boolean): Zone[] {
  const r = spotRect(bed, spot)
  const zones: Zone[] = []
  zones.push({ rect: polygonBounds(frontZone(at(bed, spot), 50)), penalty: -2, hard: false })
  if (wantNightstands) {
    // 50 cm beside each end of the headboard, against the same wall
    const head = HEAD_WALL[snap90(spot.rot)]
    const depth = 45
    const slot = (side: -1 | 1): Rect => {
      switch (head) {
        case 'top': return side < 0 ? { x0: r.x0 - 50, y0: 0, x1: r.x0, y1: depth } : { x0: r.x1, y0: 0, x1: r.x1 + 50, y1: depth }
        case 'bottom': return side < 0 ? { x0: r.x0 - 50, y0: r.y1 - depth, x1: r.x0, y1: r.y1 } : { x0: r.x1, y0: r.y1 - depth, x1: r.x1 + 50, y1: r.y1 }
        case 'left': return side < 0 ? { x0: 0, y0: r.y0 - 50, x1: depth, y1: r.y0 } : { x0: 0, y0: r.y1, x1: depth, y1: r.y1 + 50 }
        case 'right': return side < 0 ? { x0: r.x1 - depth, y0: r.y0 - 50, x1: r.x1, y1: r.y0 } : { x0: r.x1 - depth, y0: r.y1, x1: r.x1, y1: r.y1 + 50 }
      }
    }
    zones.push({ rect: slot(-1), penalty: -3, hard: false, allow: ['nightstand'] }, { rect: slot(1), penalty: -3, hard: false, allow: ['nightstand'] })
  }
  return zones
}

/** The two spots beside a bed's head for a nightstand, back to the same wall as the headboard. */
function nightstandSpots(room: Room, bed: Item, ns: Item): Spot[] {
  const head = HEAD_WALL[snap90(bed.rot)]
  const b = footprint(bed)
  const n = footprint({ w: ns.w, d: ns.d, rot: bed.rot })
  const out: Spot[] = []
  for (const side of [-1, 1]) {
    if (head === 'top' || head === 'bottom') {
      const x = bed.x + side * (b.fw / 2 + n.fw / 2)
      const y = head === 'top' ? n.fd / 2 : room.d - n.fd / 2
      out.push(snapInside(room, ns, { x, y, rot: bed.rot }))
    } else {
      const y = bed.y + side * (b.fd / 2 + n.fd / 2)
      const x = head === 'left' ? n.fw / 2 : room.w - n.fw / 2
      out.push(snapInside(room, ns, { x, y, rot: bed.rot }))
    }
  }
  return out
}

/** The two spots at the ends of a sofa for a side table, its back in line with the sofa's, facing the same way. */
function sofaSideSpots(room: Room, sofa: Item, table: Item): Spot[] {
  const out: Spot[] = []
  for (const side of [-1, 1]) {
    const [x, y] = localToRoom(sofa, side * (sofa.w / 2 + table.w / 2), -(sofa.d / 2 - table.d / 2))
    out.push(snapInside(room, table, { x, y, rot: sofa.rot }))
  }
  return out
}

/** Where a chair goes to be tucked in front of a desk, facing it. */
function chairSpot(room: Room, desk: Item, chair: Item): Spot {
  const [nx, ny] = FRONT[snap90(desk.rot)]
  const tuck = Math.min(20, chair.d * 0.35)
  const dist = desk.d / 2 + chair.d / 2 - tuck
  return snapInside(room, chair, { x: desk.x + nx * dist, y: desk.y + ny * dist, rot: (snap90(desk.rot) + 180) % 360 })
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
  consider(wallSpots(ctx, arr, item))
  // storage, desks, seating and beds belong against a wall: when no wall has room they stay out
  // rather than stand in the open; anything else may take a spot on the floor grid
  if (!best && !WALL_KINDS.has(item.kind)) consider(gridSpots(ctx.room, item))
  return best
}

/** Rugs go where the floor is most open, centred in that open area. */
function rugSpot(ctx: Ctx, arr: Arrangement, rug: Item): Spot | null {
  const room = ctx.room
  const blocked = arr.solids.map((s) => s.rect)
  for (const p of arr.placed.values()) if (isRugKind(p.kind)) blocked.push(rectOf(p))
  const occ = new Occupancy(room, blocked)
  // a rug under the door leaf or the closet doors is only mildly annoying, so it counts for a third
  const swing = new Occupancy(room, [...room.doors.map((d) => wallStripRect(room, d.wall, d.offset, d.width, Math.min(d.width, 90))), ...ctx.closets])
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

const byPriority = (a: Item, b: Item) => PRIORITY[a.kind] - PRIORITY[b.kind] || b.w * b.d - a.w * a.d || a.id.localeCompare(b.id)
/** Biggest first, rugs and chairs still last: another order each anchor position is tried with. */
const bySize = (a: Item, b: Item) => Math.max(PRIORITY[a.kind], 6) - Math.max(PRIORITY[b.kind], 6) || b.w * b.d - a.w * a.d || a.id.localeCompare(b.id)
/** Tallest first (the pieces that must keep off the window), then biggest: the third order tried. */
const byHeight = (a: Item, b: Item) => Math.max(PRIORITY[a.kind], 6) - Math.max(PRIORITY[b.kind], 6) || b.h - a.h || b.w * b.d - a.w * a.d || a.id.localeCompare(b.id)

/** The nightstands (up to two) that go beside the anchor's head — only when the anchor is a bed people climb into. */
function bedsideNightstands(anchor: Item, items: Item[]): Item[] {
  if (!isRealBed(anchor)) return []
  return items.filter((i) => i.kind === 'nightstand').sort(byPriority).slice(0, 2)
}

/**
 * Everything but the anchor, in placement order: the bed's nightstands first, then by priority
 * (or by size); each desk is followed by a chair and each sofa by up to two side tables when there are any.
 */
function placementOrder(anchor: Item, items: Item[], by: (a: Item, b: Item) => number = byPriority): Item[] {
  const sorted = [...items].sort(by)
  const chairs = sorted.filter((i) => i.kind === 'chair')
  const bedside = bedsideNightstands(anchor, sorted)
  const spare = sorted.filter((i) => isSideTable(i) && !bedside.includes(i))
  const followers = new Set([...bedside, ...spare])
  const out: Item[] = [...bedside]
  if (anchor.kind === 'sofa') out.push(...spare.splice(0, 2))
  for (const it of sorted) {
    if (it.kind === 'chair' || followers.has(it)) continue
    out.push(it)
    if (it.kind === 'desk' && chairs.length) out.push(chairs.shift()!)
    if (it.kind === 'sofa') out.push(...spare.splice(0, 2))
  }
  return [...out, ...spare, ...chairs]
}

function pickAnchor(items: Item[]): Item | null {
  const area = (i: Item) => i.w * i.d
  const solid = items.filter((i) => !isRugKind(i.kind))
  const beds = solid.filter((i) => i.kind === 'bed')
  const pool = beds.length ? beds : solid
  return pool.reduce<Item | null>((best, i) => (!best || area(i) > area(best) ? i : best), null)
}

function buildArrangement(ctx: Ctx, anchor: Item, anchorSpot: Spot, rest: Item[], rugs: Item[]): Arrangement {
  const arr = newArrangement(ctx)
  const bed = commit(ctx, arr, anchor, anchorSpot)
  const bedside = new Set(bedsideNightstands(anchor, rest).map((i) => i.id))
  if (anchor.kind === 'bed') arr.zones.push(...bedZones(anchor, anchorSpot, bedside.size > 0))
  let nsCandidates: Spot[] = []
  let lastDesk: Item | null = null
  let lastSofa: Item | null = anchor.kind === 'sofa' ? bed : null
  let sideSlots: Spot[] = []
  for (const item of rest) {
    let spot: Spot | null = null
    if (item.kind === 'chair' && lastDesk) {
      const s = chairSpot(ctx.room, lastDesk, item)
      if (evaluate(ctx, arr, item, s, lastDesk) > -Infinity) spot = s
      lastDesk = null
    } else if (bedside.has(item.id)) {
      if (!nsCandidates.length) nsCandidates = nightstandSpots(ctx.room, bed, item)
      const idx = nsCandidates.findIndex((s) => evaluate(ctx, arr, item, s) > -Infinity)
      if (idx >= 0) spot = nsCandidates.splice(idx, 1)[0]
    } else if (isSideTable(item) && lastSofa) {
      if (!sideSlots.length) sideSlots = sofaSideSpots(ctx.room, lastSofa, item)
      const idx = sideSlots.findIndex((s) => evaluate(ctx, arr, item, s) > -Infinity)
      if (idx >= 0) spot = sideSlots.splice(idx, 1)[0]
    }
    if (!spot) spot = bestSpot(ctx, arr, item)
    if (spot) {
      const placed = commit(ctx, arr, item, spot)
      if (item.kind === 'desk') lastDesk = placed
      if (item.kind === 'sofa') { lastSofa = placed; sideSlots = [] }
    }
  }
  repairPath(ctx, arr, bed)
  for (const rug of rugs) {
    const spot = rugSpot(ctx, arr, rug)
    if (spot) commit(ctx, arr, rug, spot)
  }
  return arr
}

/** The arrangement without one piece (its outline and its access space). */
function without(arr: Arrangement, id: string): Arrangement {
  const placed = new Map(arr.placed)
  placed.delete(id)
  return { placed, solids: arr.solids.filter((s) => s.item.id !== id), zones: arr.zones.filter((z) => z.host?.id !== id) }
}

/** Small pieces (a hamper, a plant, a spare chair) that are free to move: not sitting with a desk, sofa or bed. */
function loosePieces(arr: Arrangement): Item[] {
  const solids = arr.solids.map((s) => s.item)
  return solids.filter((i) => {
    if (WALL_KINDS.has(i.kind) || i.locked) return false
    const near = (kind: ItemKind, reach: number) => solids.some((o) => o.kind === kind && rectDistance(rectOf(i), rectOf(o)) <= reach)
    if (i.kind === 'chair' && (near('desk', 30) || near('table', 30))) return false
    if (isSideTable(i) && (near('sofa', 5) || near('bed', 5))) return false
    return true
  })
}

/**
 * When a small piece has cut off the way from the door to the anchor (a hamper squeezed into the
 * only gap, say), move it to the best other spot that opens the way again.
 */
function repairPath(ctx: Ctx, arr: Arrangement, anchor: Item) {
  const room = ctx.room
  if (!room.doors.length) return
  const items = () => [...arr.placed.values()]
  if (walkablePath(room, items(), anchor)) return
  for (const piece of loosePieces(arr)) {
    const rest = without(arr, piece.id)
    // no point moving this one when the way is blocked without it too
    if (!walkablePath(room, [...rest.placed.values()], anchor)) continue
    let best: Spot | null = null
    let bestScore = -Infinity
    for (const spot of wallSpots(ctx, rest, piece)) {
      const s = evaluate(ctx, rest, piece, spot)
      if (s <= bestScore) continue
      if (!walkablePath(room, [...rest.placed.values(), at(piece, spot)], anchor)) continue
      best = spot
      bestScore = s
    }
    if (best) {
      arr.placed = rest.placed
      arr.solids = rest.solids
      arr.zones = rest.zones
      commit(ctx, arr, piece, best)
      return
    }
  }
}

/* ---------- scoring a whole arrangement ---------- */

function headSide(ctx: Ctx, bed: Item): Scored['head'] {
  const wall = HEAD_WALL[snap90(bed.rot)]
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

/**
 * How many of a bed's long sides can be used to get in: a side counts while most of its
 * 60 cm strip is inside the room and not taken by anything but a nightstand.
 */
export function usableBedSides(room: Room, bed: Item, items: Item[]): number {
  const access = accessZones(bed)
  if (!access) return 0
  let usable = 0
  for (const z of access.zones) {
    const area = (z.rect.x1 - z.rect.x0) * (z.rect.y1 - z.rect.y0)
    const inRoom = fractionInRoom(room, z.rect)
    const covered = items
      .filter((o) => o !== bed && o.id !== bed.id && o.inRoom && !isRugKind(o.kind) && !accessAllows(bed, o))
      .reduce((sum, o) => sum + overlapArea(rectOf(o), z.rect), 0) / Math.max(1, area)
    // at least 45 of the 60 cm must exist inside the room, and most of the strip must be free
    if (inRoom >= 0.75 && inRoom - covered >= SIDE_FREE) usable++
  }
  return usable
}

/** Pairs of solid pieces that do not belong together and stand closer than MIN_GAP (touching counts double). */
function crowding(solid: Item[]): { close: number; touching: number } {
  let close = 0, touching = 0
  for (let a = 0; a < solid.length; a++) {
    for (let b = a + 1; b < solid.length; b++) {
      if (areCompanions(solid[a], solid[b])) continue
      const g = itemsGap(solid[a], solid[b])
      if (g <= 0.5) touching++
      else if (g < MIN_GAP) close++
    }
  }
  return { close, touching }
}

/** Nothing left out, everyone reachable, no crowding, no red or access check: another placement order cannot beat this. */
function flawless(s: Scored) {
  return s.pathsOk && !s.leftOut.length && !s.crowded && !s.checks.some((c) => c.level === 'bad' || isAccessCheck(c))
}

function scoreArrangement(ctx: Ctx, anchor: Item, all: Item[], order: number, parts?: string[]): Scored {
  const note = (label: string, v: number) => { if (parts && v) parts.push(`${label} ${v > 0 ? '+' : ''}${Math.round(v * 10) / 10}`); return v }
  const room = ctx.room
  const placed = all.filter((i) => i.inRoom)
  const solid = placed.filter((i) => !isRugKind(i.kind))
  const leftOut = all.filter((i) => !i.inRoom)
  const checks = runChecks(room, all).filter((c) => !nightstandPassage(all, c))
  let score = 0
  for (const c of checks) score += note(`check "${c.text}"`, c.level === 'bad' ? -12 : c.level === 'warn' ? -3 : 1)

  const bed = placed.find((i) => i.id === anchor.id) ?? null
  const head = bed ? headSide(ctx, bed) : { wall: 'top' as Wall, side: 'middle' as const }
  if (bed && bed.kind === 'bed' && !underWindow(ctx, rectOf(bed))) score += note('bed off the window', 3)
  // the anchor crowding the way in from the door is as bad as any other piece doing so
  if (bed && ctx.approaches.some((a) => intersects(rectOf(bed), a))) score += note('anchor in the door approach', -3)
  // a nightstand that could not go beside the bed head is a nightstand in the wrong place
  if (bed) for (const ns of bedsideNightstands(anchor, solid)) if (rectDistance(rectOf(ns), rectOf(bed)) > 5) score += note(`${ns.id} away from the bed`, -8)

  const deskByWindow = deskNearWindow(ctx, placed)
  if (deskByWindow) score += note('desk by the window', 3)

  // the bed people sleep in: reachable from both sides is best, from neither is bad
  const mainBed = solid.filter(isRealBed).sort((a, b) => b.w * b.d - a.w * a.d)[0] ?? null
  if (mainBed) {
    const sides = usableBedSides(room, mainBed, solid)
    // a double bed wants both sides; a single is fine along a wall
    const double = Math.min(mainBed.w, mainBed.d) >= 120
    score += note(`${sides} bed sides usable`, double ? (sides === 2 ? 6 : sides === 1 ? 0 : -4) : sides === 2 ? 2 : sides === 1 ? 1 : -3)
  }

  const occ = new Occupancy(room, solid.map(rectOf))
  const walk = walkable(occ)
  let pathsOk = true
  // the way in must reach the bed (a crib too), else whatever the room is arranged around
  const target = solid.filter((i) => i.kind === 'bed').sort((a, b) => b.w * b.d - a.w * a.d)[0] ?? bed
  if (target) {
    const t = rectOf(target)
    const near: Rect = { x0: t.x0 - 15, y0: t.y0 - 15, x1: t.x1 + 15, y1: t.y1 + 15 }
    for (const door of room.doors) {
      if (!pathExists(occ, walk.cells, wallStripRect(room, door.wall, door.offset, door.width, DOORWAY_DEPTH), near)) pathsOk = false
    }
  }
  if (pathsOk) score += note('path from the door', 5)

  score += note('pieces on walls', Math.min(8, solid.filter((i) => onWall(room, i, rectOf(i))).length))
  // storage, desks, seating and beds belong with their back against a wall; one left standing in the open spoils the room
  score += note('wall pieces in the open', -10 * solid.filter((i) => WALL_KINDS.has(i.kind) && !onWall(room, i, rectOf(i))).length)
  // a hamper, plant or box adrift in the middle of the floor is untidy too (chairs and side tables sit with their host)
  score += note('loose pieces adrift', -6 * solid.filter((i) => !WALL_KINDS.has(i.kind) && i.kind !== 'chair' && !isSideTable(i) && !onWall(room, i, rectOf(i))).length)
  // a side table that did not make it to the end of a sofa
  if (solid.some((i) => i.kind === 'sofa')) {
    const bedside = new Set(bedsideNightstands(anchor, solid).map((i) => i.id))
    for (const t of solid.filter((i) => isSideTable(i) && !bedside.has(i.id))) {
      if (!solid.some((s) => s.kind === 'sofa' && rectDistance(rectOf(t), rectOf(s)) <= 5)) score += note(`${t.id} away from the sofa`, -5)
    }
  }
  score += note('wasted slivers', -sliverArea(occ, walk.sat) * 3)
  const crowd = crowding(solid)
  score += note('crowding', -(2 * crowd.close + 6 * crowd.touching))
  // companions that did not make it to their host count as crowding too: another order may do better
  const stranded = (bed ? bedsideNightstands(anchor, solid).some((ns) => rectDistance(rectOf(ns), rectOf(bed)) > 5) : false) ||
    solid.some((t) => isSideTable(t) && !bedsideNightstands(anchor, solid).includes(t) && solid.some((o) => o.kind === 'sofa') && !solid.some((o) => o.kind === 'sofa' && rectDistance(rectOf(t), rectOf(o)) <= 5))
  const crowded = crowd.close + crowd.touching > 0 || stranded
  // a piece that could not be placed is worse than any single check: the room is supposed to hold it
  score += note('left out', -20 * leftOut.length)

  return { items: all, score, checks, head, deskByWindow, pathsOk, leftOut, crowded, order }
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

const capitalise = (text: string) => text.replace(/^./, (c) => c.toUpperCase())

/** The biggest solid piece standing in the room apart from the anchor, if any. */
function largestPlaced(anchor: Item, s: Scored): Item | null {
  return s.items
    .filter((i) => i.inRoom && !isRugKind(i.kind) && i.id !== anchor.id)
    .reduce<Item | null>((best, i) => (!best || i.w * i.d > best.w * best.d ? i : best), null)
}

function titleOf(ctx: Ctx, anchor: Item, s: Scored) {
  const placed = s.items.find((i) => i.id === anchor.id)?.inRoom ?? false
  let title: string
  if (!placed) {
    // the anchor did not fit: name the layout after the biggest piece that did
    const big = largestPlaced(anchor, s)
    title = big ? `${capitalise(shortName(big))} ${whereIs(ctx, big)}` : `Without the ${shortName(anchor)}`
  } else if (anchor.kind !== 'bed') {
    const piece = capitalise(shortName(anchor))
    const { wall, side, corner } = s.head
    const at = wall === 'top' ? '' : ` on the ${WALL_NAME[wall]}`
    if (side === 'window') title = `${piece} under the window${at}${corner ? `, ${cornerName([wall, corner])} corner` : ''}`
    else if (side === 'middle') title = `${piece} against the ${WALL_NAME[wall]}`
    else title = `${piece} in the ${cornerName([wall, side])} corner`
  } else {
    const piece = 'Bed'
    const { wall, side } = s.head
    if (side === 'window') title = `${piece} under the window${wall === 'top' ? '' : ` on the ${WALL_NAME[wall]}`}${s.head.corner ? `, along the ${WALL_NAME[s.head.corner]}` : ''}`
    else if (side === 'middle') title = `${piece} against the ${WALL_NAME[wall]}`
    else if (wall === 'top') title = `${piece} along the ${WALL_NAME[side]}`
    else if (wall === 'bottom') title = `${piece} along the ${WALL_NAME[side]}, head to the front`
    else title = `${piece} head against the ${WALL_NAME[wall]}, ${side === 'top' ? 'back' : 'front'} corner`
  }
  if (s.deskByWindow && s.items.some((i) => i.inRoom && i.kind === 'desk') && anchor.kind !== 'desk') title += ', desk by the window'
  return title
}

function listNames(items: Item[]) {
  const names = items.map((i) => shortName(i))
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

function joinPhrases(phrases: string[]) {
  if (phrases.length <= 1) return phrases.join('')
  return `${phrases.slice(0, -1).join(', ')} and ${phrases[phrases.length - 1]}`
}

/** "Drawers face the room and the wardrobe can open." — only when every piece's access space is free. */
function accessNote(s: Scored) {
  if (s.checks.some(isAccessCheck)) return ''
  const placed = s.items.filter((i) => i.inRoom && !isRugKind(i.kind))
  const phrases: string[] = []
  if (placed.some((i) => i.kind === 'dresser' || i.kind === 'nightstand')) phrases.push('the drawers face the room')
  const wardrobe = placed.find((i) => i.kind === 'wardrobe')
  if (wardrobe) phrases.push(`the ${shortName(wardrobe)} can open`)
  if (!phrases.length && placed.some((i) => i.kind === 'desk')) phrases.push('there is room to pull up to the desk')
  if (!phrases.length && placed.some((i) => i.kind === 'sofa')) phrases.push('there is legroom in front of the seating')
  return phrases.length ? ` ${capitalise(joinPhrases(phrases.slice(0, 2)))}.` : ''
}

function describe(ctx: Ctx, anchor: Item, s: Scored) {
  const placed = s.items.filter((i) => i.inRoom && !isRugKind(i.kind) && i.id !== anchor.id)
  const big = placed
    .filter((i) => !['chair', 'nightstand'].includes(i.kind))
    .sort((a, b) => b.w * b.d - a.w * a.d)
    .slice(0, 3)
  const bed = s.items.find((i) => i.id === anchor.id)!
  // without the anchor the layout is named after the biggest piece that did fit, even a chair: say where it went
  if (!bed.inRoom && !big.length) { const b = largestPlaced(anchor, s); if (b) big.push(b) }
  const anchorSentence = !bed.inRoom
    ? `The ${shortName(anchor)} does not fit in this room`
    : anchor.kind === 'bed' ? `The bed ${bedWhere(ctx, bed, s)}` : `The ${shortName(anchor)} stands ${whereIs(ctx, bed)}`
  const others = big.map((i) => `the ${shortName(i)} ${i.kind === 'desk' ? 'sits' : 'stands'} ${whereIs(ctx, i)}`)
  const first = others.length ? `${anchorSentence}; ${others.length > 1 ? `${others.slice(0, -1).join(', ')} and ${others[others.length - 1]}` : others[0]}.` : `${anchorSentence}.`
  const bad = s.checks.filter((c) => c.level === 'bad')
  const warn = s.checks.filter((c) => c.level === 'warn')
  let second: string
  if (bad.length) second = `Watch out: ${bad[0].text}${bad.length > 1 ? ` (and ${bad.length - 1} more)` : ''}.`
  else if (warn.length) second = `Trade-off: ${warn[0].text}${warn.length > 1 ? ` (and ${warn.length - 1} more)` : ''}.`
  else second = ctx.room.doors.length && s.pathsOk ? 'Nothing is in the way and the door opens fully.' : 'Nothing is in the way.'
  const locked = s.items.filter((i) => i.inRoom && ctx.locked.some((l) => l.id === i.id))
  const kept = locked.length ? ` ${capitalise(listNames(locked))} ${locked.length > 1 ? 'stay' : 'stays'} where you locked ${locked.length > 1 ? 'them' : 'it'}.` : ''
  // the anchor's own absence is already the first sentence
  const leftOut = s.leftOut.filter((i) => i.id !== anchor.id)
  const out = leftOut.length ? ` ${capitalise(listNames(leftOut))} did not fit and ${leftOut.length > 1 ? 'stay' : 'stays'} out of the room.` : ''
  return `${first} ${second}${accessNote(s)}${kept}${out}`
}

/* ---------- public API ---------- */

function toLayout(ctx: Ctx, anchor: Item, s: Scored, parked: Item[], i: number): Layout {
  const letter = LETTERS[i] ?? String(i + 1)
  const placements: Record<string, ItemPlacement> = {}
  for (const it of s.items) placements[it.id] = { x: it.x, y: it.y, rot: it.rot, inRoom: it.inRoom }
  for (const it of parked) placements[it.id] = { x: it.x, y: it.y, rot: it.rot, inRoom: false }
  const layout: Layout = {
    id: `sug-${letter.toLowerCase()}`,
    name: `${letter} · ${titleOf(ctx, anchor, s)}`,
    description: describe(ctx, anchor, s),
    placements,
  }
  if (i === 0) layout.recommended = true
  return layout
}

/**
 * A few good arrangements of `items` in `room`, best first; the best one is marked recommended.
 * Every item id gets a placement: what could not be placed keeps its position with inRoom false,
 * what was already out of the room (parked below the plan) stays out, where it is, and a locked
 * piece keeps its exact position and angle in every layout (unless `respectLocks` is false).
 */
export function suggestLayouts(room: Room, items: Item[], opts: SuggestOptions = {}): Layout[] {
  const max = Math.max(1, opts.max ?? 3)
  const respectLocks = opts.respectLocks ?? true
  const active = items.filter((i) => i.inRoom)
  const parked = items.filter((i) => !i.inRoom)
  const locked = respectLocks ? active.filter((i) => i.locked) : []
  const free = active.filter((i) => !locked.includes(i))
  const ctx = makeCtx(room, locked)
  const anchor = pickAnchor(free)
  if (!anchor) {
    if (!locked.length) return []
    // everything in the room is locked: the one layout is the room as it stands
    const keep = pickAnchor(locked)!
    const s = scoreArrangement(ctx, keep, active.map((i) => ({ ...i })), 0)
    const layout = toLayout(ctx, keep, s, parked, 0)
    return [{ ...layout, name: 'A · Everything stays where it is' }]
  }
  const rugs = free.filter((i) => isRugKind(i.kind))
  const others = free.filter((i) => i !== anchor && !isRugKind(i.kind))
  const rest = placementOrder(anchor, others)
  // each anchor position is also tried placing the biggest pieces first, which helps in tight rooms
  const orders = [rest, placementOrder(anchor, others, bySize), placementOrder(anchor, others, byHeight)].filter((o, i, all) => all.findIndex((p) => p.map((x) => x.id).join() === o.map((x) => x.id).join()) === i)
  const bedside = new Set(bedsideNightstands(anchor, rest).map((i) => i.id))
  ctx.wantsSideTables = rest.some((i) => isSideTable(i) && !bedside.has(i.id))

  const results: Scored[] = []
  let order = 0
  const base = newArrangement(ctx)
  for (const wall of WALLS) {
    const { fw, fd } = footprint({ w: anchor.w, d: anchor.d, rot: BACK_TO_WALL[wall] })
    const horizontal = wall === 'top' || wall === 'bottom'
    const along = horizontal ? fw : fd
    const depth = horizontal ? fd : fw
    const L = wallLength(room, wall)
    if (along > L || depth > (horizontal ? room.d : room.w)) continue
    const span = L - along
    const step = Math.max(GRID, Math.ceil(span / ANCHOR_STEPS / GRID) * GRID)
    for (const t of wallPositions(ctx, base, wall, along, step)) {
      if (ctx.budget <= 0) break
      const spot = wallSpot(room, wall, t, anchor)
      const variants = [spot]
      // a tall headboard under a window: also try it pulled a little off the wall, as people do
      const rect = spotRect(anchor, spot)
      if (ctx.windows.some((w) => w.wall === wall && anchor.h > w.sill && spanOverlap(spanOf(rect, wall), w) >= 20)) {
        const [nx, ny] = FRONT[snap90(spot.rot)]
        variants.push({ x: spot.x + nx * HEAD_INSET, y: spot.y + ny * HEAD_INSET, rot: spot.rot })
      }
      for (const v of variants) {
        // the anchor itself must be allowed there: clear of the door, the closets, the locked pieces and their access space
        if (evaluate(ctx, base, anchor, v) === -Infinity) continue
        let best: Scored | null = null
        const seen = new Set<string>()
        for (const o of orders) {
          const arr = buildArrangement(ctx, anchor, v, o, rugs)
          const all = active.map((i) => arr.placed.get(i.id) ?? { ...i, inRoom: false })
          // two orders often end in the same arrangement: score it once
          const key = all.map((i) => `${i.id}:${i.inRoom ? `${i.x},${i.y},${i.rot}` : 'out'}`).join(';')
          if (seen.has(key)) continue
          seen.add(key)
          const scored = scoreArrangement(ctx, anchor, all, order)
          if (!best || scored.score > best.score) best = scored
          // the other orders are for tight rooms: an arrangement with nothing wrong is not going to improve
          if (flawless(scored)) break
        }
        if (best) results.push(best)
        order++
      }
    }
  }

  if (!results.length) {
    // nothing fits against a wall (the anchor is too big for the room): leave it out, place the rest
    const arr = newArrangement(ctx)
    for (const item of rest) { const spot = bestSpot(ctx, arr, item); if (spot) commit(ctx, arr, item, spot) }
    for (const rug of rugs) { const spot = rugSpot(ctx, arr, rug); if (spot) commit(ctx, arr, rug, spot) }
    const all = active.map((i) => arr.placed.get(i.id) ?? { ...i, inRoom: false })
    results.push(scoreArrangement(ctx, anchor, all, 0))
  }

  results.sort((a, b) => b.score - a.score || a.order - b.order)
  // only layouts with nothing to apologise for (no red check, every drawer and door can open, every
  // piece in, a way from the door to the bed) are offered — unless there is none, then the best of the rest
  const clean = (r: Scored) => r.pathsOk && !r.leftOut.length && !r.checks.some((c) => c.level === 'bad' || isAccessCheck(c))
  const pool = results.some(clean) ? results.filter(clean) : results
  // keep the best few that put the anchor somewhere meaningfully different
  const chosen: Scored[] = []
  const anchorOf = (r: Scored) => r.items.find((i) => i.id === anchor.id)!
  const similar = (a: Scored, b: Scored) => {
    if (`${a.head.wall}/${a.head.side}/${a.head.corner ?? ''}` === `${b.head.wall}/${b.head.side}/${b.head.corner ?? ''}`) return true
    const A = anchorOf(a), B = anchorOf(b)
    if (A.rot !== B.rot || !A.inRoom || !B.inRoom) return false
    return Math.hypot(A.x - B.x, A.y - B.y) < Math.max(PATH, 0.25 * wallLength(room, a.head.wall))
  }
  for (const r of pool) {
    if (chosen.some((c) => similar(c, r))) continue
    chosen.push(r)
    if (chosen.length >= max) break
  }

  return chosen.map((s, i) => toLayout(ctx, anchor, s, parked, i))
}

/** Plain-English summary of a layout applied to these items (what the suggestions use as their description). */
export function describeLayout(room: Room, items: Item[], layout: Layout): string {
  const ctx = makeCtx(room)
  // what was out of the room and stays out took no part in the layout, so it did not "fail to fit"
  const all = items
    .filter((i) => i.inRoom || (layout.placements[i.id]?.inRoom ?? false))
    .map((i) => (layout.placements[i.id] ? { ...i, ...layout.placements[i.id] } : i))
  const anchor = pickAnchor(all.filter((i) => i.inRoom)) ?? pickAnchor(all)
  if (!anchor) return layout.description
  return describe(ctx, anchor, scoreArrangement(ctx, anchor, all, 0))
}

/** The score a layout gets from the suggestion engine, with what made it (for tests and tuning). */
export function explainScore(room: Room, items: Item[], opts: Pick<SuggestOptions, 'respectLocks'> = {}): { score: number; parts: string[] } {
  const active = items.filter((i) => i.inRoom)
  const locked = (opts.respectLocks ?? true) ? active.filter((i) => i.locked) : []
  const ctx = makeCtx(room, locked)
  const anchor = pickAnchor(active.filter((i) => !locked.includes(i))) ?? pickAnchor(active)
  if (!anchor) return { score: 0, parts: [] }
  const parts: string[] = []
  const { score } = scoreArrangement(ctx, anchor, active, 0, parts)
  return { score, parts }
}
