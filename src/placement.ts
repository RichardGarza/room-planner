import { doorSwing, footprint, intersects, isRugKind, rectOf, wallLength, wallStripRect } from './geometry'
export { isRugKind }
import type { Door, Item, Rect, Room, Rot, Wall } from './types'

/** Rugs lie under everything else: they never block a spot and nothing needs to avoid them. */

export interface Spot {
  x: number
  y: number
  rot: Rot
}

export interface PlacementOptions {
  /** Height of the new item. Anything taller than the window sill keeps off the window. */
  h?: number
  /** 'wall' (default) tries the walls first; 'centre' works outwards from the middle (rugs). */
  prefer?: 'wall' | 'centre'
}

const GRID = 10
/** Same strips checks.ts uses for window coverage and radiator clearance. */
const WINDOW_DEPTH = 12
const RADIATOR_CLEAR = 15

/** Rotation that turns an item's back (its −d side) to a wall. */
const BACK_TO_WALL: Record<Wall, Rot> = { top: 0, right: 90, bottom: 180, left: 270 }

/**
 * Find a centre for a new w×d item: inside the room, clear of every solid item and of the
 * door swing, preferably against a wall (turned so its back faces the wall), else on a
 * 10 cm grid over the floor, else the room centre.
 */
export function findFreeSpot(room: Room, items: Item[], w: number, d: number, opts: PlacementOptions = {}): Spot {
  const prefer = opts.prefer ?? 'wall'
  const solid = items.filter((i) => i.inRoom && !isRugKind(i.kind)).map(rectOf)
  const soft = softBlockers(room, opts.h)

  const isFree = (rect: Rect, strict: boolean) =>
    rect.x0 >= -0.01 && rect.y0 >= -0.01 && rect.x1 <= room.w + 0.01 && rect.y1 <= room.d + 0.01 &&
    !solid.some((s) => intersects(rect, s)) &&
    !doorBlocks(room, rect) &&
    (!strict || !soft.some((s) => intersects(rect, s)))

  const candidates = (): Iterable<Spot> =>
    prefer === 'centre' ? centreCandidates(room, w, d) : chain(wallCandidates(room, w, d), gridCandidates(room, w, d))

  // First keep clear of the window and radiator too; if that finds nothing, allow them.
  for (const strict of soft.length ? [true, false] : [false]) {
    for (const spot of candidates()) {
      const { fw, fd } = footprint({ w, d, rot: spot.rot })
      if (isFree(rectAt(spot.x, spot.y, fw, fd), strict)) return spot
    }
  }
  return { x: room.w / 2, y: room.d / 2, rot: 0 }
}

function rectAt(x: number, y: number, fw: number, fd: number): Rect {
  return { x0: x - fw / 2, y0: y - fd / 2, x1: x + fw / 2, y1: y + fd / 2 }
}

function* chain<T>(...parts: Iterable<T>[]) {
  for (const p of parts) yield* p
}

/** Strips that only cause a warning: the window (for tall items) and the radiator. */
function softBlockers(room: Room, h?: number): Rect[] {
  const out: Rect[] = []
  for (const win of room.windows) {
    if (h !== undefined && h > win.sill && win.width > 0) out.push(wallStripRect(room, win.wall, win.offset, win.width, WINDOW_DEPTH))
  }
  for (const rad of room.radiators) {
    if (rad.width > 0) out.push(wallStripRect(room, rad.wall, rad.offset, rad.width, rad.depth + RADIATOR_CLEAR))
  }
  return out
}

/** True when the rect reaches into the quarter circle the door leaf sweeps (or the doorway itself). */
function doorBlocks(room: Room, rect: Rect): boolean {
  return room.doors.some((door) => doorBlocksOne(room, door, rect))
}

function doorBlocksOne(room: Room, door: Door, rect: Rect): boolean {
  if (door.swing === 'out') {
    // the leaf swings away from the room; just keep the doorway itself clear
    return intersects(rect, wallStripRect(room, door.wall, door.offset, door.width, Math.min(60, door.width)))
  }
  const { hx, hy, r, leafDir } = doorSwing(room, door)
  // the quarter disc lies inside the r-square around the hinge
  if (rect.x1 <= hx - r || rect.x0 >= hx + r || rect.y1 <= hy - r || rect.y0 >= hy + r) return false
  const inside = (px: number, py: number) => px > rect.x0 + 0.5 && px < rect.x1 - 0.5 && py > rect.y0 + 0.5 && py < rect.y1 - 0.5
  for (let deg = 0; deg <= 90; deg += 5) {
    const [dx, dy] = leafDir(deg)
    for (let f = 0.1; f <= 1.001; f += 0.1) {
      if (inside(hx + dx * r * f, hy + dy * r * f)) return true
    }
  }
  // small rects can slip between the samples: check their corners and centre against the disc
  const u = leafDir(0), v = leafDir(90)
  const cx = (rect.x0 + rect.x1) / 2, cy = (rect.y0 + rect.y1) / 2
  for (const [px, py] of [[rect.x0, rect.y0], [rect.x1, rect.y0], [rect.x0, rect.y1], [rect.x1, rect.y1], [cx, cy]]) {
    const ex = px - hx, ey = py - hy
    if (ex * ex + ey * ey < r * r - 0.5 && ex * u[0] + ey * u[1] > 0.5 && ex * v[0] + ey * v[1] > 0.5) return true
  }
  return false
}

/** Positions along a wall from lo to hi: corners first, then working inwards in 10 cm steps. */
function* sweep(lo: number, hi: number) {
  if (hi < lo) return
  const pts: number[] = []
  for (let t = lo; t <= hi + 0.01; t += GRID) pts.push(t)
  if (pts[pts.length - 1] < hi - 0.01) pts.push(hi)
  for (let a = 0, b = pts.length - 1; a <= b; a++, b--) {
    yield pts[a]
    if (a !== b) yield pts[b]
  }
}

function* wallCandidates(room: Room, w: number, d: number): Generator<Spot> {
  const walls: Wall[] = ['top', 'left', 'right', 'bottom']
  const doorWalls = new Set(room.doors.map((dr) => dr.wall))
  const order = [...walls.filter((wl) => !doorWalls.has(wl)), ...walls.filter((wl) => doorWalls.has(wl))]
  for (const wall of order) {
    const rot = BACK_TO_WALL[wall]
    const { fw, fd } = footprint({ w, d, rot })
    const horizontal = wall === 'top' || wall === 'bottom'
    const along = horizontal ? fw : fd
    const depth = horizontal ? fd : fw
    const L = wallLength(room, wall)
    if (along > L || depth > (horizontal ? room.d : room.w)) continue
    for (const t of sweep(along / 2, L - along / 2)) {
      const x = horizontal ? t : wall === 'left' ? depth / 2 : room.w - depth / 2
      const y = horizontal ? (wall === 'top' ? depth / 2 : room.d - depth / 2) : t
      yield { x, y, rot }
    }
  }
}

function* gridCandidates(room: Room, w: number, d: number): Generator<Spot> {
  const rots: Rot[] = w === d ? [0] : [0, 90]
  const fits = rots.map((rot) => ({ rot, ...footprint({ w, d, rot }) })).filter((f) => f.fw <= room.w && f.fd <= room.d)
  if (!fits.length) return
  const minFd = Math.min(...fits.map((f) => f.fd)), minFw = Math.min(...fits.map((f) => f.fw))
  for (let y = minFd / 2; y <= room.d - minFd / 2 + 0.01; y += GRID) {
    for (let x = minFw / 2; x <= room.w - minFw / 2 + 0.01; x += GRID) {
      for (const f of fits) {
        if (x - f.fw / 2 < -0.01 || x + f.fw / 2 > room.w + 0.01 || y - f.fd / 2 < -0.01 || y + f.fd / 2 > room.d + 0.01) continue
        yield { x, y, rot: f.rot }
      }
    }
  }
}

function centreCandidates(room: Room, w: number, d: number): Spot[] {
  const cx = room.w / 2, cy = room.d / 2
  const dist = (s: Spot) => (s.x - cx) ** 2 + (s.y - cy) ** 2
  return [...gridCandidates(room, w, d)].sort((a, b) => dist(a) - dist(b))
}
