# Room Planner

Will the new bed fit? Room Planner is a small app for trying furniture layouts in a real room before you buy or move anything. Drag furniture around a 2D floor plan, see it in 3D, walk through the room at adult or child eye height, and get a plain-English list of what is in the way. Rooms are saved so you can come back to them when it is time to renovate.

It runs in the browser and as a native Mac app.

Inspired by [this post](https://x.com/scheemunai/status/2103059885361598633), where Claude built a one-off planner for a kid's bedroom.

## What it does

- **Rooms library.** The app opens on your saved rooms. Create a room with a name and a group (for example "Home" or "2027 renovation"), reopen it later, duplicate it, rename it, export it as JSON, or import one. Every change is saved automatically about a second after you stop editing. The first launch seeds an example room.
- **Floor plan.** Drag items, press `R` to rotate, drag them into the "out of the room" strip to remove them. The selected item shows its distance to the nearest walls.
- **3D view.** Orbit from outside with the near walls cut away, or walk through the room with the mouse and `WASD`. Day and evening lighting. Click and drag furniture directly in 3D.
- **Furniture catalogue.** About 55 real-size presets: beds from crib to king, dressers and chests, nightstands, wardrobes, desks and chairs, sofas, tables, bookcases and shelves, rugs, and kids' pieces. New items are placed automatically against a free wall, clear of the door swing. Anything can be renamed, recoloured, resized, or deleted, and "Custom size" adds something that is not in the list.
- **Windows, doors, radiators.** A room can have any number of each, on any wall, with its own size. Doors have a hinge side and swing in or out of the room.
- **Checks.** Overlaps, furniture through walls, whether a dresser fits under a window (and by how much), radiator coverage, how far each door can open, passage widths beside the bed, and whether you can still get out of bed.
- **Layouts.** Preset layouts A, B, C, and "Now" for the example room, plus your own saved layouts per room, undo and redo, and a Share button that puts the whole room in a link.
- **Display settings.** Door opening angle, blind height, bedding on or off, eye height, render quality.

## Run it in the browser

```bash
npm install
npm run dev
```

Then open the printed local URL. `npm run build` produces a static site in `dist/`. In the browser, rooms are kept in the browser's local storage.

## Run it as a Mac app

The Mac app is built with [Tauri v2](https://v2.tauri.app). You need Rust (via rustup) and the Xcode command line tools.

```bash
npm run app:dev     # native window with hot reload
npm run app:build   # release build
```

The build produces `src-tauri/target/release/bundle/macos/Room Planner.app` and a disk image at `src-tauri/target/release/bundle/dmg/Room Planner_<version>_aarch64.dmg` (Apple Silicon; add `-- --target x86_64-apple-darwin` for Intel Macs). If the dmg step fails on your machine, which can happen because it drives Finder to lay out the image window, `npx tauri build --bundles app` builds just the app.

In the Mac app every room is a JSON file in `~/Documents/Room Planner/`, named `<room-name>--<id>.json`. You can back up, sync, or share that folder. Export and Import use the normal macOS save and open dialogs. macOS asks once for permission to use your Documents folder.

The app is not code-signed or notarized. The first time you open it, right-click (or Control-click) `Room Planner.app` and choose Open, then confirm. After that it opens normally.

To regenerate the app icon from a 1024×1024 PNG: `npx tauri icon src-tauri/app-icon.png`.

## Windows, doors, and radiators

Open the Room card in the sidebar and use "+ Add window", "+ Add door", or "+ Add radiator". Each row has a wall selector, a distance from the corner, a width and height, and for windows a sill height. "From corner" is measured from the left end of the back or front wall, or from the back end of a side wall. Remove a row with its ×.

Doors have a hinge side (Near corner puts the hinge at the smaller offset, Far corner at the larger one) and a swing. A door that opens into the room is checked for furniture in its swing. A door that opens out is instead checked for anything standing in the 40 cm strip in front of the doorway. On the plan an out-swinging door draws its arc outside the room, and in 3D the leaf swings into the hallway. The "Room door" slider in Display settings opens every door.

Window checks estimate fit. An item standing against the wall under a window is reported as "fits under the window with N cm to spare" when it is lower than the sill, "stands N cm above the window sill" when it is taller, or "blocks the window" when it rises through most of the glass. With several openings the checks and labels say "window 2", "door 2".

## Adding furniture

The "Add furniture" card holds the catalogue. Type in the search box or pick a category chip, then click a row to add it. Sizes are outer dimensions in centimetres (width × depth × height). A preset's note shows as a tooltip and in the selection panel.

New items go against a free wall when possible, corners first, turned so their back faces the wall. Otherwise they go on a 10 cm grid over the floor, or in the middle of the room. Placement keeps clear of other furniture and the door swing and tries to keep tall pieces away from windows. Rugs go in the middle. Drag the item afterwards if you want it somewhere else.

To remove something, select it and press Delete, or use the Delete button in the selection card.

## Change the defaults

The UI can edit everything, but the example room and its furniture live in `src/data.ts`, and the catalogue in `src/catalog.ts`.

## Stack

Vite, React 19, TypeScript, Three.js via react-three-fiber and drei, zustand for state, Tauri v2 for the Mac shell, vitest for tests, Playwright for screenshot checks. No backend.

## Layout of the code

| Path | What it holds |
| --- | --- |
| `src/types.ts` | Room, opening, item, layout, check, catalogue, and document types |
| `src/data.ts` | The example room, its furniture, preset layouts, `makeEmptyRoom` |
| `src/catalog.ts` | The furniture catalogue |
| `src/placement.ts` | `findFreeSpot`: where a new item goes |
| `src/geometry.ts` | Footprints, overlaps, gaps, door swing and doorway maths |
| `src/checks.ts` | The rules that produce the checks list |
| `src/migrate.ts` | Loads rooms saved by older versions |
| `src/store.ts` | Planner state: items, undo/redo, layouts, view, settings, share link |
| `src/library.ts` | Rooms library: documents, groups, autosave, import/export |
| `src/storage/` | Storage backends: browser local storage and Tauri files |
| `src/components/Library.tsx` | The home screen |
| `src/components/FloorPlan.tsx` | SVG floor plan with drag and dimension lines |
| `src/scene/` | The 3D scene: lights, cameras, walls and openings, floor, furniture |
| `src/components/Sidebar.tsx` | Layout notes, checks, selection, catalogue, room editor, settings |
| `src/components/TopBar.tsx` | Back to rooms, room name, layout tabs, save state, undo/redo, share |
| `src-tauri/` | The Mac app shell, capabilities, and icons |
| `scripts/shots.mjs` | Drives the app in headless Chromium and saves screenshots |

## Development

```bash
npm run typecheck   # tsc
npm test            # vitest
node scripts/shots.mjs http://localhost:5173 shots   # screenshots of the running app
```

Units are centimetres in the data and metres in the 3D scene. Sizes for the example room came from photos and a catalogue, so treat them as roughly ±2 cm.
