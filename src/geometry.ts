import type { Door, Item, ItemKind, Rect, Room, Wall } from './types'

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

export function wallLabel(w: Wall) {
  return { top: 'window wall', bottom: 'door wall', left: 'left wall', right: 'right wall' }[w]
}
