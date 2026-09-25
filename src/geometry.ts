import type { CheckLevel, Closet, Door, Item, ItemKind, Rect, Room, Wall } from './types'

/** Rugs are walked over and lie under other furniture, so they never collide. */
export function isRugKind(kind: ItemKind) {
  return kind === 'rug' || kind === 'rugRect'
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Footprint size after rotation. */
export function footprint(item: Pick<Item, 'w' | 'd' | 'rot'>) {
  const swapped = item.rot === 90 || item.rot === 270
  return { fw: swapped ? item.d : item.w, fd: swapped ? item.w : item.d }
}

export function rectOf(item: Item): Rect {
  const { fw, fd } = footprint(item)
  return { x0: item.x - fw / 2, y0: item.y - fd / 2, x1: item.x + fw / 2, y1: item.y + fd / 2 }
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
    const rc = rectOf(it)
    for (let deg = 5; deg <= 90; deg += 5) {
      const [dx, dy] = leafDir(deg)
      let hit = false
      for (const f of [0.3, 0.5, 0.7, 0.85, 1]) {
        const px = hx + dx * r * f
        const py = hy + dy * r * f
        if (px > rc.x0 && px < rc.x1 && py > rc.y0 && py < rc.y1) { hit = true; break }
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
