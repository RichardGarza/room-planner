import { closetClearance, doorSwing, footprint, intersects, isRugKind, rectOf, wallLength, wallStripRect } from './geometry'
export { isRugKind }
import type { Door, Item, ItemKind, Rect, Room, Rot, Wall } from './types'

/** Rugs lie under everything else: they never block a spot and nothing needs to avoid them. */

export interface Spot {
  x: number
  y: number
  rot: Rot
}

/** What findFreeSpot found: `fits` is false when no free spot exists and the spot is only the least bad place to put the item. */
export interface FreeSpot extends Spot {
  fits: boolean
}

export interface PlacementOptions {
  /** Height of the new item. Anything taller than the window sill keeps off the window. */
  h?: number
  /** 'wall' (default) tries the walls first; 'centre' works outwards from the middle (rugs). */
  prefer?: 'wall' | 'centre'
  /** What is being placed. Furniture (not beds, nightstands or rugs) keeps a walking gap beside the beds when it can. */
  kind?: ItemKind
}

const GRID = 10
/** gap kept between a new piece and a bed so there is still room to walk and climb in */
const BED_GAP = 60
/** gap kept past the foot of a bed so a dresser does not butt against it */
const FOOT_GAP = 45
/** how far each further item that has to fall back on the room centre is shifted, so nothing lands on top of another */
const STAGGER = 20
/** Same strips checks.ts uses for window coverage and radiator clearance. */
const WINDOW_DEPTH = 12
const RADIATOR_CLEAR = 15

/** Rotation that turns an item's back (its −d side) to a wall. */
const BACK_TO_WALL: Record<Wall, Rot> = { top: 0, right: 90, bottom: 180, left: 270 }
/** Unit vector an item's front faces at each rotation (the foot end of a bed). */
const FRONT: Record<Rot, [number, number]> = { 0: [0, 1], 90: [-1, 0], 180: [0, -1], 270: [1, 0] }

/**
 * Find a centre for a new w×d item: inside the room, clear of every solid item, of the
 * door swing and of the space closet doors need, preferably against a wall (turned so its
 * back faces the wall), else on a 10 cm grid over the floor. Such a spot comes back with
 * `fits: true`. When there is none, `fits` is false and the spot is the least bad place:
 * a grid spot on top of nothing (it may be in the door swing), else the room centre,
 * shifted 20 cm for every item already sitting there so nothing lands on top of another.
 * Furniture (not beds, nightstands or rugs) also prefers a spot that leaves a walking gap
 * beside the long sides of the beds and 45 cm past their foot, so a dresser does not end
 * up flush against one.
 */
export function findFreeSpot(room: Room, items: Item[], w: number, d: number, opts: PlacementOptions = {}): FreeSpot {
  const prefer = opts.prefer ?? 'wall'
  const solid = items.filter((i) => i.inRoom && !isRugKind(i.kind)).map(rectOf)
  const closets = (room.closets ?? []).map((c) => closetClearance(room, c).rect)
  const soft = softBlockers(room, opts.h)
  const keepsGap = prefer === 'wall' && opts.kind !== 'bed' && opts.kind !== 'nightstand' && !(opts.kind && isRugKind(opts.kind))
  const bedGaps = keepsGap ? bedGapStrips(items) : []

  const insideRoom = (rect: Rect) => rect.x0 >= -0.01 && rect.y0 >= -0.01 && rect.x1 <= room.w + 0.01 && rect.y1 <= room.d + 0.01
  const onNothing = (rect: Rect) => insideRoom(rect) && !solid.some((s) => intersects(rect, s))
  const isFree = (rect: Rect, strict: boolean, bedGap: boolean) =>
    onNothing(rect) &&
    !doorBlocks(room, rect) &&
    !closets.some((c) => intersects(rect, c)) &&
    (!strict || !soft.some((s) => intersects(rect, s))) &&
    (!bedGap || !bedGaps.some((s) => intersects(rect, s)))

  const floor = () => (prefer === 'centre' ? centreCandidates(room, w, d) : gridCandidates(room, w, d))
  const groups = (): Iterable<Spot>[] => (prefer === 'centre' ? [floor()] : [[...wallCandidates(room, w, d)], floor()])
  const rectFor = (spot: Spot) => {
    const { fw, fd } = footprint({ w, d, rot: spot.rot })
    return rectAt(spot.x, spot.y, fw, fd)
  }

  // First keep clear of the window and radiator too; if that finds nothing, allow them.
  // Within each group (walls, then the floor grid) a spot with a gap beside the beds beats one without.
  for (const strict of soft.length ? [true, false] : [false]) {
    for (const group of groups()) {
      const spots = bedGaps.length ? [...group] : group
      for (const bedGap of bedGaps.length ? [true, false] : [false]) {
        for (const spot of spots) if (isFree(rectFor(spot), strict, bedGap)) return { ...spot, fits: true }
      }
    }
  }
  // nothing is free: a spot on top of nothing (though in the door swing, say) still beats the room centre
  for (const spot of floor()) if (onNothing(rectFor(spot))) return { ...spot, fits: false }
  return { ...centreFallback(room, items, w, d), fits: false }
}

/** The room centre, moved out 20 cm at a time (alternating sides) past every item already centred there. */
function centreFallback(room: Room, items: Item[], w: number, d: number): Spot {
  const cx = room.w / 2, cy = room.d / 2
  const { fw, fd } = footprint({ w, d, rot: 0 })
  const inRoom = fw <= room.w && fd <= room.d
  const taken = (x: number, y: number) => items.some((i) => i.inRoom && Math.abs(i.x - x) < 1 && Math.abs(i.y - y) < 1)
  const at = (k: number): Spot => {
    const shift = Math.ceil(k / 2) * STAGGER * (k % 2 ? 1 : -1)
    const x = inRoom ? Math.min(Math.max(cx + shift, fw / 2), room.w - fw / 2) : cx
    const y = inRoom ? Math.min(Math.max(cy + shift, fd / 2), room.d - fd / 2) : cy
    return { x, y, rot: 0 }
  }
  let spot = at(0)
  for (let k = 1; taken(spot.x, spot.y) && k <= 2 * items.length; k++) spot = at(k)
  return spot
}

/**
 * Strips a new piece should not stand in: BED_GAP wide along the long sides of every bed in
 * the room, and FOOT_GAP deep past its foot (the side its front faces).
 */
function bedGapStrips(items: Item[]): Rect[] {
  const out: Rect[] = []
  for (const bed of items) {
    if (!bed.inRoom || bed.kind !== 'bed') continue
    const r = rectOf(bed)
    if (r.y1 - r.y0 >= r.x1 - r.x0) {
      out.push({ x0: r.x0 - BED_GAP, y0: r.y0, x1: r.x0, y1: r.y1 }, { x0: r.x1, y0: r.y0, x1: r.x1 + BED_GAP, y1: r.y1 })
    } else {
      out.push({ x0: r.x0, y0: r.y0 - BED_GAP, x1: r.x1, y1: r.y0 }, { x0: r.x0, y0: r.y1, x1: r.x1, y1: r.y1 + BED_GAP })
    }
    const [nx, ny] = FRONT[bed.rot]
    if (ny > 0) out.push({ x0: r.x0, y0: r.y1, x1: r.x1, y1: r.y1 + FOOT_GAP })
    else if (ny < 0) out.push({ x0: r.x0, y0: r.y0 - FOOT_GAP, x1: r.x1, y1: r.y0 })
    else if (nx > 0) out.push({ x0: r.x1, y0: r.y0, x1: r.x1 + FOOT_GAP, y1: r.y1 })
    else out.push({ x0: r.x0 - FOOT_GAP, y0: r.y0, x1: r.x0, y1: r.y1 })
  }
  return out
}

function rectAt(x: number, y: number, fw: number, fd: number): Rect {
  return { x0: x - fw / 2, y0: y - fd / 2, x1: x + fw / 2, y1: y + fd / 2 }
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
