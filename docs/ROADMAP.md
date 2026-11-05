# Roadmap

Build in this order. Each milestone ends with a working app, passing tests and a commit. Don't start the next milestone before the previous one works.

## M0: scaffold

- [x] Vite + React + TypeScript (strict), Vitest, ESLint + Prettier.
- [x] Folders: `src/model` (types, project JSON, migrations), `src/solver` (pure, no React), `src/ui` (components), `src/tools` (drawing tools), `src/export`.
- [x] 90s theme (CSS variables from `UI.md`), the empty layout from `UI.md`.

M0 includes locally bundled IBM Plex Mono, disabled placeholders for future actions,
and a Vitest smoke test for the empty workspace. Build, tests, lint, and browser
layout checks pass.

## M1: sketching

- [x] SVG drawing area with zoom, pan, grid and snap.
- [x] Rectangle and polygon tools create rooms; Select moves corners; Delete removes.
- [x] Rooms tree and properties panel (name, height).
- [x] Save/Open JSON, autosave, undo/redo.

M1 includes cursor-centred zoom, Space/middle-button pan, fit all, grid/corner/edge
snapping with Shift override, and live three-decimal edge dimensions. New rooms
start at 2.700 m; deleting a triangle's corner removes the room. Room quantities
use sketch coordinates. File New/Open and all committed edits are undoable.
Schema 1 is unchanged, including a lossless round-trip of the sample project.
Model, history, snapping, and viewport tests pass. Browser checks cover drawing,
properties, drag/delete, undo/redo, navigation, file handling, and autosave recovery.

## M1.1: geometry conventions and labels

- [x] Normalise room winding to CCW, preserving edge-based references.
- [x] Round snapped and stored corner coordinates to 0.0001 m.
- [x] Place dimensions outside rooms and hide labels on short screen edges.
- [x] Reserve separate space for the left and bottom axis labels.

## M2: solver (no UI)

- [x] `fit(block)`: Levenberg–Marquardt as in `SOLVER.md`, constraints generated from the sketch (right angles where the sketch is within 5° of 90°).
- [x] Residuals, rigidity check, flagging.
- [x] All cases in `examples/solver-cases.md` as unit tests, passing.

M2 is a pure solver API with central-difference Jacobians, dense damped solves,
explicit hard constraints, doorway alignment, and optional leave-one-out diagnostics.
It is not wired into the UI. The schema-1 doorway pairing rule and API are documented
in `SOLVER.md`. Tests, build, and lint pass.

## M2.1: consistency and independent fits

- [x] Chi-square consistency tests per room and connected group at p < 0.01.
- [x] Measurement redundancy, standardised residuals, ordered suspects and unchecked distances.
- [x] Name a probable wrong measurement only when leave-one-out uniquely identifies it.
- [x] Fit independent rooms separately, retaining their placement and the 15 mm flags.
- [x] Regression cases, including an eight-room fit with one bad wall below 500 ms.

Case 3 now distinguishes detecting an error from localising it. Diagnostics are
transient output; the JSON schema and sketch UI are unchanged.

## M3: survey mode

- Rule-based measurement queue per room.
- Animated arrow and prompt, value entry in the command line, fit after each entry, residual colours.
- Skip / blocked (choose a point on an edge instead) / redo / custom measurement (`M`).

## M4: openings, heights, joins

- Door, window and arch tools on edges; their measurements are added to the queue.
- Room heights. Wall thickness at doorways. Joins between rooms, fitted together.

## M5: export

- SVG (true metres, viewBox), PDF (jsPDF + svg2pdf.js; A4/A3; 1:50/1:100; title block; dimension lines; room names and areas), DXF R12 (layers WALLS, ROOMS, OPENINGS, DIMS, TEXT, FEATURES), PNG.
- Light print theme for exports.

## M6: more blocks

- Add a block (floor / site / other), switch blocks, links between blocks, placing a block from its links.
- Garden features: circle, polyline, rectangle with labels.

## M7: smart survey and devices

- Next measurement by largest predicted variance (`SOLVER.md` v2).
- Responsive layout, touch, PWA offline.
