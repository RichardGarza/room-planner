import { DOC_VERSION } from './migrate'
import type { Item, Room, RoomDoc } from './types'

/** inches → whole centimetres */
export const inch = (v: number) => Math.round(v * 2.54)

const SEED_TIME = '2026-09-24T12:00:00.000Z'

/**
 * Forest's Room — a nursery measured in inches with a tape:
 * room 141 × 116, ceiling 96; window 60 wide, 36 tall, sill 44; door 32 wide.
 * Everything is stored in cm (the app's unit) and shown in inches when that unit is selected.
 */
export function forestsRoom(): RoomDoc {
  const W = inch(141) // 358
  const D = inch(116) // 295
  const winW = inch(60)
  const doorW = inch(32)
  const room: Room = {
    name: "Forest's Room",
    subtitle: 'Nursery · 11′9″ × 9′8″',
    w: W,
    d: D,
    h: inch(96),
    windows: [{ id: 'w1', wall: 'top', offset: Math.round((W - winW) / 2), width: winW, height: inch(36), sill: inch(44) }],
    // door in the front-left corner; hinge on the corner side so it swings left as you walk in
    doors: [{ id: 'd1', wall: 'bottom', offset: 10, width: doorW, height: inch(80), sill: 0, hinge: 'left', swing: 'in' }],
    radiators: [],
    wallColors: { left: '#d8e2d3', right: '#d8e2d3', top: '#f3efe8', bottom: '#f3efe8' },
    floorColor: '#b08968',
  }

  const piece = (
    id: string,
    name: string,
    kind: Item['kind'],
    wIn: number,
    dIn: number,
    hIn: number,
    x: number,
    y: number,
    rot: Item['rot'],
    color: string,
    extra: Partial<Item> = {},
  ): Item => ({
    id,
    name,
    kind,
    w: inch(wIn),
    d: inch(dIn),
    h: inch(hIn),
    x,
    y,
    rot,
    color,
    inRoom: true,
    note: `${wIn} × ${dIn} × ${hIn} in`,
    ...extra,
  })

  // Positions are footprint centres in cm; x from the left wall, y from the back (window) wall.
  const items: Item[] = [
    // dresser under the window: 30 in tall against a 44 in sill
    piece('forest-dresser', 'Dresser', 'dresser', 58, 16, 30, W / 2, inch(16) / 2, 0, '#f7f4ef'),
    // changing table on the back wall, left of the dresser
    piece('forest-changing', 'Changing table', 'dresser', 30, 30, 40, 15 + inch(30) / 2, inch(30) / 2, 0, '#f7f4ef'),
    // crib along the right wall, up by the window wall
    piece('forest-crib', 'Crib', 'bed', 54, 30, 35, W - inch(30) / 2, inch(54) / 2, 90, '#e9dccd'),
    // tall cabinet on the left wall, between the changing table and the door swing
    piece('forest-cabinet', 'Tall cabinet', 'wardrobe', 46, 18, 79, inch(18) / 2, 148, 90, '#efe9df'),
    // recliner on the front wall to the right of the door swing, side table and hamper beside it
    piece('forest-recliner', 'Recliner', 'sofa', 41, 39, 40, 100 + inch(41) / 2, D - inch(39) / 2, 180, '#9aa88f', {
      note: '41 × 39 × 40 in. Reclines to 64 in deep (38 in closed).',
    }),
    piece('forest-side', 'Side table', 'nightstand', 22, 18, 25, 100 + inch(41) + 10 + inch(22) / 2, D - inch(18) / 2, 0, '#c9a27e'),
    piece('forest-hamper', 'Hamper', 'box', 13, 22, 24, 100 + inch(41) + 10 + inch(22) + 10 + inch(13) / 2, D - inch(22) / 2, 0, '#e5e0d8'),
    // the same recliner fully reclined, kept out of the room to test clearance
    piece('forest-recliner-open', 'Recliner, reclined', 'sofa', 41, 64, 40, 60, D + 90, 0, '#9aa88f', {
      inRoom: false,
      note: '41 × 64 × 40 in — the recliner fully open. Drag it in to check the clearance.',
    }),
  ]

  return {
    id: 'room-forest',
    name: "Forest's Room",
    group: 'Home',
    notes: 'Nursery. Sizes measured in inches; the window is centred on the back wall and the door is in the front-left corner and swings left as you walk in. Move anything that does not match the real room.',
    createdAt: SEED_TIME,
    updatedAt: SEED_TIME,
    room,
    items,
    layouts: [],
    settings: { daytime: true, doorAngle: 70, blinds: 30, bedding: true, walkHeight: 'adult', quality: 'best' },
    version: DOC_VERSION,
  }
}
