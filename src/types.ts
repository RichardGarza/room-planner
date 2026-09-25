export type Wall = 'top' | 'bottom' | 'left' | 'right'
export type Rot = 0 | 90 | 180 | 270
export type ItemKind =
  | 'bed'
  | 'chair'
  | 'desk'
  | 'shelf'
  | 'dresser'
  | 'wardrobe'
  | 'bookcase'
  | 'rug'
  | 'box'

/** All lengths are centimetres. x runs left→right, y runs top→bottom on the plan. */
export interface Item {
  id: string
  name: string
  kind: ItemKind
  /** width across the item's own x axis (before rotation) */
  w: number
  /** depth across the item's own y axis (before rotation) */
  d: number
  h: number
  /** footprint centre */
  x: number
  y: number
  rot: Rot
  color: string
  inRoom: boolean
  /** free text shown in the selection panel */
  note?: string
}

export interface Opening {
  wall: Wall
  /** distance along the wall from its left/top end to the opening's start */
  offset: number
  width: number
  height: number
  /** height of the bottom edge above the floor */
  sill: number
}

export interface Door extends Opening {
  /** 'left' = hinge at the smaller offset along the wall, 'right' = at the larger one */
  hinge: 'left' | 'right'
}

export interface Radiator {
  wall: Wall
  offset: number
  width: number
  depth: number
  height: number
}

export interface Room {
  name: string
  subtitle: string
  w: number
  d: number
  h: number
  window: Opening
  door: Door
  radiator: Radiator
  wallColors: { left: string; right: string; top: string; bottom: string }
  floorColor: string
}

export type ItemPlacement = Pick<Item, 'x' | 'y' | 'rot' | 'inRoom'>

export interface Layout {
  id: string
  name: string
  description: string
  recommended?: boolean
  placements: Record<string, ItemPlacement>
  /** saved layouts keep the full furniture list (added items, sizes, names) */
  items?: Item[]
}

export type CheckLevel = 'ok' | 'warn' | 'bad'
export interface Check {
  level: CheckLevel
  text: string
  itemIds: string[]
}

/** Axis-aligned footprint in room coordinates. */
export interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}
