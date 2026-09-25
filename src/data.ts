import type { Item, Layout, Room } from './types'

export const defaultRoom: Room = {
  name: "Mila's room",
  subtitle: 'New bed 140 × 200',
  w: 270,
  d: 370,
  h: 260,
  windows: [{ id: 'w1', wall: 'top', offset: 60, width: 150, height: 130, sill: 90 }],
  doors: [{ id: 'd1', wall: 'bottom', offset: 85, width: 80, height: 205, sill: 0, hinge: 'right', swing: 'in' }],
  radiators: [],
  wallColors: { left: '#e9c2d3', right: '#e9c2d3', top: '#f1ece6', bottom: '#f1ece6' },
  floorColor: '#8a4a34',
}

/** A fresh, empty room: one window centred on the back wall, one door on the front wall. */
export function makeEmptyRoom(name: string, w = 300, d = 400, h = 260): Room {
  const winW = Math.min(120, w - 40)
  return {
    ...defaultRoom,
    name,
    subtitle: '',
    w,
    d,
    h,
    windows: [{ id: 'w1', wall: 'top', offset: Math.round((w - winW) / 2), width: winW, height: 120, sill: 90 }],
    doors: [{ id: 'd1', wall: 'bottom', offset: 20, width: 80, height: 205, sill: 0, hinge: 'right', swing: 'in' }],
    radiators: [],
  }
}

/** Catalogue of everything in the room. Positions come from the layouts. */
export const defaultItems: Item[] = [
  {
    id: 'bed', name: 'New bed TUFJORD 140×200', kind: 'bed', w: 164, d: 223, h: 109,
    x: 188, y: 130, rot: 0, color: '#f3c9d8', inRoom: true,
    note: 'IKEA TUFJORD, mattress 140×200; outer size 164×223 cm, headboard 109 cm.',
  },
  { id: 'shelf', name: 'Shelf', kind: 'shelf', w: 49, d: 40, h: 110, x: 35, y: 30, rot: 0, color: '#f7f4ef', inRoom: true },
  { id: 'desk', name: 'Desk', kind: 'desk', w: 73, d: 50, h: 75, x: 25, y: 105, rot: 90, color: '#f7f4ef', inRoom: true },
  { id: 'chair', name: 'Kids chair', kind: 'chair', w: 56, d: 56, h: 86, x: 68, y: 105, rot: 0, color: '#f2a7c3', inRoom: true },
  { id: 'dresser', name: 'Dresser', kind: 'dresser', w: 160, d: 48, h: 85, x: 24, y: 224, rot: 90, color: '#f7f4ef', inRoom: true },
  { id: 'rug', name: 'Rug', kind: 'rug', w: 120, d: 120, h: 1, x: 120, y: 240, rot: 0, color: '#5f6f86', inRoom: true },
  { id: 'bookcase', name: 'Bookcase', kind: 'bookcase', w: 60, d: 30, h: 120, x: 32, y: 335, rot: 0, color: '#f7f4ef', inRoom: true },
  { id: 'wardrobe', name: 'Wardrobe', kind: 'wardrobe', w: 100, d: 58, h: 200, x: 218, y: 335, rot: 0, color: '#efe9df', inRoom: true },
]

const base = Object.fromEntries(defaultItems.map((i) => [i.id, { x: i.x, y: i.y, rot: i.rot, inRoom: i.inRoom }]))

export const presetLayouts: Layout[] = [
  {
    id: 'A',
    name: 'A · Bed along the right wall',
    recommended: true,
    description:
      'The wardrobe stays in the corner by the door and the bed runs along the right wall with the headboard toward the window. Dresser, desk and shelf stay where they are.',
    placements: { ...base },
  },
  {
    id: 'B',
    name: 'B · Bed along the left wall',
    description:
      'Bed moves to the left wall under the shelf. Desk, chair and dresser swap to the right wall so the window stays clear.',
    placements: {
      ...base,
      bed: { x: 82, y: 185, rot: 0, inRoom: true },
      shelf: { x: 235, y: 30, rot: 0, inRoom: true },
      desk: { x: 245, y: 95, rot: 90, inRoom: true },
      chair: { x: 200, y: 95, rot: 0, inRoom: true },
      dresser: { x: 246, y: 232, rot: 90, inRoom: true },
      rug: { x: 190, y: 250, rot: 0, inRoom: true },
      bookcase: { x: 32, y: 345, rot: 0, inRoom: true },
    },
  },
  {
    id: 'C',
    name: 'C · Bed across under the window',
    description:
      'Bed turned sideways with the headboard against the window wall. Frees the long walls but covers part of the window, and the shelf has to go.',
    placements: {
      ...base,
      bed: { x: 135, y: 82, rot: 90, inRoom: true },
      shelf: { x: 35, y: 30, rot: 0, inRoom: false },
      desk: { x: 25, y: 225, rot: 90, inRoom: true },
      chair: { x: 68, y: 225, rot: 0, inRoom: true },
      dresser: { x: 246, y: 258, rot: 90, inRoom: true },
      rug: { x: 140, y: 265, rot: 0, inRoom: true },
      bookcase: { x: 240, y: 354, rot: 0, inRoom: true },
      wardrobe: { x: 29, y: 318, rot: 90, inRoom: true },
    },
  },
  {
    id: 'now',
    name: 'Now (no bed)',
    description: 'The room as it is today, before the new bed arrives.',
    placements: { ...base, bed: { x: 188, y: 130, rot: 0, inRoom: false } },
  },
]
