import type { CatalogEntry, ItemKind } from './types'

/**
 * Furniture presets people can drop into the room. Sizes are outer dimensions in
 * centimetres (w across, d front-to-back, h tall) taken from typical pieces and the
 * IKEA catalogue, so they are good enough to test whether something fits.
 */

/** Palette categories in display order. */
export const categories: string[] = [
  'Beds',
  'Dressers & chests',
  'Nightstands',
  'Wardrobes',
  'Desks & chairs',
  'Seating',
  'Tables',
  'Bookcases & shelves',
  'Rugs',
  'Kids & other',
  'Indoor plants',
]

const white = '#f7f4ef'
const cream = '#efe9df'
const oak = '#d8b98f'
const lightOak = '#e6d3b3'
const pink = '#f3c9d8'
const blue = '#bcd3e8'
const grey = '#cfd3d8'
const navy = '#5f6f86'
const walnut = '#3d3733'
const leaf = '#6f8f5a'
const deepLeaf = '#4f7a48'
const lightLeaf = '#8aa36b'

function preset(category: string, id: string, name: string, kind: ItemKind, w: number, d: number, h: number, color: string, note?: string): CatalogEntry {
  return note ? { id, name, kind, category, w, d, h, color, note } : { id, name, kind, category, w, d, h, color }
}

export const catalog: CatalogEntry[] = [
  // Beds — outer size of the frame, height is the headboard
  preset('Beds', 'crib', 'Crib', 'bed', 70, 130, 90, white, 'Cot for a 60×120 mattress.'),
  preset('Beds', 'toddler-bed', 'Toddler bed', 'bed', 77, 143, 60, pink, 'For a 70×140 mattress.'),
  preset('Beds', 'single-bed', 'Single bed 90×200', 'bed', 90, 200, 50, blue, 'Mattress size only — add about 10 cm for a frame.'),
  preset('Beds', 'single-bed-frame', 'Single bed with frame', 'bed', 100, 210, 90, white, 'Frame around a 90×200 mattress.'),
  preset('Beds', 'double-bed', 'Double bed 140×200', 'bed', 150, 210, 95, cream, 'Frame around a 140×200 mattress.'),
  preset('Beds', 'queen-bed', 'Queen bed 160×200', 'bed', 170, 212, 95, cream, 'Frame around a 160×200 mattress.'),
  preset('Beds', 'king-bed', 'King bed 180×200', 'bed', 190, 212, 95, cream, 'Frame around a 180×200 mattress.'),
  preset('Beds', 'bunk-bed', 'Bunk bed', 'bed', 100, 205, 160, white, 'Two 90×200 beds stacked; check the ceiling height.'),
  preset('Beds', 'daybed', 'Daybed', 'bed', 95, 200, 85, blue, 'Sits along a wall like a sofa; the back is 85 cm.'),
  preset('Beds', 'ikea-tufjord-140', 'IKEA TUFJORD 140×200', 'bed', 164, 223, 109, pink, 'IKEA TUFJORD upholstered bed, mattress 140×200; outer size 164×223 cm, headboard 109 cm.'),

  // Dressers & chests
  preset('Dressers & chests', 'dresser-short-3', 'Short dresser, 3 drawers', 'dresser', 80, 45, 80, white),
  preset('Dressers & chests', 'chest-tall', 'Tall chest of drawers', 'dresser', 60, 45, 130, cream),
  preset('Dressers & chests', 'dresser-wide-6', 'Wide dresser, 6 drawers', 'dresser', 160, 48, 85, white),
  preset('Dressers & chests', 'ikea-malm-6', 'IKEA MALM 6-drawer', 'dresser', 160, 48, 78, '#f4f4f2', 'IKEA MALM chest of 6 drawers, 160×48×78 cm.'),
  preset('Dressers & chests', 'ikea-hemnes-8', 'IKEA HEMNES 8-drawer', 'dresser', 160, 50, 96, cream, 'IKEA HEMNES chest of 8 drawers, 160×50×96 cm.'),
  preset('Dressers & chests', 'changing-table', 'Changing table', 'dresser', 90, 55, 95, white, 'Chest of drawers with a changing top.'),

  // Nightstands
  preset('Nightstands', 'nightstand-40', 'Nightstand 40×40', 'nightstand', 40, 40, 55, white),
  preset('Nightstands', 'nightstand-50', 'Nightstand 50×40', 'nightstand', 50, 40, 60, lightOak),

  // Wardrobes
  preset('Wardrobes', 'wardrobe-single', 'Single wardrobe', 'wardrobe', 50, 58, 200, cream),
  preset('Wardrobes', 'wardrobe-double', 'Double wardrobe', 'wardrobe', 100, 58, 200, cream),
  preset('Wardrobes', 'wardrobe-triple', 'Triple wardrobe', 'wardrobe', 150, 58, 220, cream),
  preset('Wardrobes', 'ikea-pax-100', 'IKEA PAX 100', 'wardrobe', 100, 58, 236, '#f7f6f3', 'IKEA PAX frame 100×58×236 cm; needs 236 cm of ceiling height.'),
  preset('Wardrobes', 'ikea-pax-150', 'IKEA PAX 150', 'wardrobe', 150, 58, 236, '#f7f6f3', 'IKEA PAX frame 150×58×236 cm; needs 236 cm of ceiling height.'),

  // Desks & chairs
  preset('Desks & chairs', 'desk-kids', 'Kids desk', 'desk', 73, 50, 62, white),
  preset('Desks & chairs', 'desk-small', 'Small desk', 'desk', 100, 50, 75, white),
  preset('Desks & chairs', 'desk-140', 'Desk 140', 'desk', 140, 60, 75, lightOak),
  preset('Desks & chairs', 'chair-desk', 'Desk chair', 'chair', 56, 56, 86, grey, 'Swivel chair; leave room to push it back.'),
  preset('Desks & chairs', 'chair-kids', 'Kids chair', 'chair', 40, 40, 60, '#f2a7c3'),
  preset('Desks & chairs', 'chair-dining', 'Dining chair', 'chair', 45, 50, 90, oak),

  // Seating
  preset('Seating', 'armchair', 'Armchair', 'sofa', 80, 85, 90, pink),
  preset('Seating', 'loveseat', 'Loveseat', 'sofa', 160, 90, 85, blue),
  preset('Seating', 'sofa', 'Sofa', 'sofa', 220, 95, 85, grey),
  preset('Seating', 'bean-bag', 'Bean bag', 'box', 80, 80, 60, '#9fb7cf'),

  // Tables
  preset('Tables', 'coffee-table', 'Coffee table', 'table', 100, 60, 45, oak),
  preset('Tables', 'side-table', 'Side table', 'table', 50, 50, 55, lightOak),
  preset('Tables', 'dining-table', 'Dining table', 'table', 160, 90, 75, oak),
  preset('Tables', 'round-table-110', 'Round table Ø110', 'table', 110, 110, 75, oak, 'Round top, 110 cm across.'),

  // Bookcases & shelves
  preset('Bookcases & shelves', 'ikea-billy', 'IKEA BILLY', 'bookcase', 80, 28, 202, white, 'IKEA BILLY bookcase 80×28×202 cm.'),
  preset('Bookcases & shelves', 'ikea-kallax-2x2', 'IKEA KALLAX 2×2', 'shelf', 77, 39, 77, white, 'IKEA KALLAX 4 cubes, 77×39×77 cm.'),
  preset('Bookcases & shelves', 'ikea-kallax-4x2', 'IKEA KALLAX 4×2', 'shelf', 77, 39, 147, white, 'IKEA KALLAX 8 cubes, 77×39×147 cm.'),
  preset('Bookcases & shelves', 'bookcase-low', 'Low bookcase', 'bookcase', 80, 30, 80, lightOak),
  preset('Bookcases & shelves', 'wall-shelf', 'Wall shelf', 'shelf', 60, 25, 30, white, 'Wall-mounted, height is the shelf itself.'),

  // Rugs
  preset('Rugs', 'rug-round-120', 'Round rug Ø120', 'rug', 120, 120, 1, navy),
  preset('Rugs', 'rug-round-160', 'Round rug Ø160', 'rug', 160, 160, 1, '#9fb7cf'),
  preset('Rugs', 'rug-round-200', 'Round rug Ø200', 'rug', 200, 200, 1, '#e9c2d3'),
  preset('Rugs', 'rug-120x170', 'Rug 120×170', 'rugRect', 120, 170, 1, '#c9bfb4'),
  preset('Rugs', 'rug-160x230', 'Rug 160×230', 'rugRect', 160, 230, 1, navy),
  preset('Rugs', 'rug-200x300', 'Rug 200×300', 'rugRect', 200, 300, 1, '#d8cfc4'),

  // Kids & other
  preset('Kids & other', 'toy-chest', 'Toy chest', 'box', 90, 45, 50, blue),
  preset('Kids & other', 'play-kitchen', 'Play kitchen', 'dresser', 85, 40, 95, pink),
  preset('Kids & other', 'upright-piano', 'Upright piano', 'box', 150, 60, 125, walnut, 'Leave about 60 cm in front for the stool.'),
  preset('Kids & other', 'tv-stand', 'TV stand', 'dresser', 120, 40, 45, oak),
  preset('Kids & other', 'treadmill', 'Treadmill', 'box', 180, 80, 140, grey),
  preset('Kids & other', 'radiator-cover', 'Radiator cover', 'box', 120, 20, 80, white, 'Sits over the radiator; keep the top free.'),
  preset('Kids & other', 'floor-lamp', 'Floor lamp', 'box', 30, 30, 160, cream),

  // Indoor plants — w × d is how wide the leaves spread, h the total height with the pot
  preset('Indoor plants', 'olive-baby', 'Baby olive tree in pot', 'plant', 60, 60, 150, leaf, 'Young olive tree in a terracotta pot.'),
  preset('Indoor plants', 'olive-tall', 'Olive tree, taller', 'plant', 80, 80, 200, leaf, 'Standard olive tree in a terracotta pot; check the ceiling height.'),
  preset('Indoor plants', 'fiddle-leaf-fig', 'Fiddle-leaf fig', 'plant', 70, 70, 180, deepLeaf, 'Big glossy leaves; likes a bright spot near the window.'),
  preset('Indoor plants', 'potted-shrub', 'Potted shrub', 'plant', 50, 50, 80, lightLeaf),
  preset('Indoor plants', 'snake-plant', 'Snake plant', 'plant', 30, 30, 90, deepLeaf, 'Upright sword leaves; fine on a dresser or in a corner.'),
  preset('Indoor plants', 'small-palm', 'Small palm', 'plant', 90, 90, 170, lightLeaf, 'Fronds spread wide; leave room around it.'),
  preset('Indoor plants', 'monstera', 'Monstera', 'plant', 80, 80, 120, deepLeaf, 'Split leaves that spread wider than the pot.'),
  preset('Indoor plants', 'room-bush', 'Room bush', 'plant', 100, 100, 110, lightLeaf, 'A big rounded shrub for an empty corner.'),
]

export function findPreset(id: string): CatalogEntry | undefined {
  return catalog.find((p) => p.id === id)
}
