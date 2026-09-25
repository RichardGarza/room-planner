# Room Planner

Will the new bed fit? A small web app for trying furniture layouts in a real room before you buy anything. Drag furniture around a 2D floor plan, see it in 3D, walk through the room at adult or child eye height, and get a list of things that are in the way.

Inspired by [this post](https://x.com/scheemunai/status/2103059885361598633) where Claude built a one-off planner for a kid's bedroom.

## What it does

- **Floor plan** on the left. Drag items, press `R` to rotate, drag them into the "out of the room" strip to remove them. The selected item shows its distance to the nearest walls.
- **3D view** in the middle. Orbit from outside (near walls are cut away), or walk through the room with the mouse and `WASD`. Day and evening lighting. You can also click and drag furniture directly in 3D.
- **Layouts**: preset options A, B, C and "now", plus your own saved versions (kept in the browser).
- **Checks**: overlaps, furniture through walls, window and radiator coverage, whether the door can still open, passage widths next to the bed, and whether you can still get out of bed.
- **Display settings**: door opening angle, blind height, bedding on or off, eye height, render quality.
- **Share**: the Share button copies a link that encodes the whole layout in the URL hash.

## Run it

```bash
npm install
npm run dev
```

Then open the printed local URL. `npm run build` produces a static site in `dist/`.

## Change the room

Everything about the room and furniture lives in `src/data.ts`: room size, window, door (with hinge side), radiator, wall colours, and the furniture catalogue with sizes in centimetres. The preset layouts are in the same file as position overrides per item.

## Stack

Vite, React 19, TypeScript, Three.js via react-three-fiber and drei, zustand for state. No backend.

## Layout of the code

| File | What it holds |
| --- | --- |
| `src/types.ts` | Room, item, layout and check types |
| `src/data.ts` | The room, furniture catalogue and preset layouts |
| `src/geometry.ts` | Footprints, overlaps, gaps, door swing maths |
| `src/checks.ts` | The rules that produce the checks list |
| `src/store.ts` | zustand store: items, undo/redo, layouts, view state, share URL |
| `src/components/FloorPlan.tsx` | SVG floor plan with drag and dimension lines |
| `src/components/Scene3D.tsx` | 3D room, walls with openings, door, blinds, furniture, walk controls |
| `src/components/Sidebar.tsx` | Layout notes, checks, selection, display settings, saved layouts |
| `src/components/TopBar.tsx` | Room title, layout tabs, undo/redo, share |

## Notes

- Units are centimetres in the data and metres in the 3D scene.
- Furniture is drawn from simple boxes so anything can be added by giving it a size and a kind.
- Sizes for the sample room came from photos and a catalogue, so treat them as roughly ±2 cm.
