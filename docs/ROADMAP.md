# Roadmap

Build in this order. Each milestone ends with a working app, passing tests and a commit. Don't start the next milestone before the previous one works.

## M0: scaffold
- Vite + React + TypeScript (strict), Vitest, ESLint + Prettier.
- Folders: `src/model` (types, project JSON, migrations), `src/solver` (pure, no React), `src/ui` (components), `src/tools` (drawing tools), `src/export`.
- 90s theme (CSS variables from `UI.md`), the empty layout from `UI.md`.

## M1: sketching
- SVG drawing area with zoom, pan, grid and snap.
- Rectangle and polygon tools create rooms; Select moves corners; Delete removes.
- Rooms tree and properties panel (name, height).
- Save/Open JSON, autosave, undo/redo.

## M2: solver (no UI)
- `fit(block)`: Levenberg–Marquardt as in `SOLVER.md`, constraints generated from the sketch (right angles where the sketch is within 5° of 90°).
- Residuals, rigidity check, flagging.
- All cases in `examples/solver-cases.md` as unit tests, passing.

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
