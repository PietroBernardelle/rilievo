# rilievo

Sketch a building roughly, then let the app walk you through the laser measurements and fit the sketch to them. Built for surveying a house room by room (later: other floors, the garden) and exporting clean plans.

Status: **M4 complete** — guided survey mode connects the sketch to the solver,
with room consistency checks, re-measure suggestions and undoable readings.
Attached unmeasured rooms follow fitted neighbours; small cyan dots mark active
sketch contacts. Contacts release once both rooms have done measurements.
Doors, windows, arches, heights and shared-wall surveys are implemented. Exports follow in M5.

## Development

Requires Node.js 22+ and npm. Tested with Node.js 22.10.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. The app has no backend, accounts, telemetry, or external font requests.

```sh
npm run build   # strict TypeScript check and production output in dist/
npm test        # run Vitest once
npm run lint    # ESLint and Prettier checks
```

Use `npm run test:watch` during development, `npm run format` to format files, and
`npm run preview` to serve the production build locally.

The Vite and lint tool versions support the installed Node.js 22.10 runtime.
The scoped `minimatch` override patches the lint parser's transitive dependency
([GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)); keep it until the parser upgrades its dependency.

## Try sketching

1. Press **R**, then click two opposite corners of a rectangle. The first room
   automatically creates **Piano terra**. New rooms start at **2.700 m** height.
2. Press **P** and click polygon corners. Press **Enter** or click the first corner
   to close. **Esc** discards the unfinished shape.
3. Press **V** to select a room or corner. Drag a corner to move it. **Delete**
   removes the selection; deleting a corner from a triangle removes its room.
4. Select a room in the drawing or tree. Edit its name or height in Properties;
   **Enter** or leaving the field commits one edit. Heights accept `2,700`, `270cm`,
   and `2700mm`. Area and perimeter use the sketch coordinates.
5. Use the wheel to zoom around the cursor, **Space+drag** or middle-button drag
   to pan, and **F** to fit all rooms. The white square identifies a snap target.
   Corners take priority over edges, then the 0.100 m grid; **Shift** disables snap.
6. **Ctrl+Z / Ctrl+Shift+Z** undo/redo completed edits, including New and Open.
   Command-key equivalents work on macOS. While typing in a property field,
   native text undo applies until the edit is committed.
7. **File > Save JSON** downloads the project; **File > Open** accepts the supplied
   `examples/sample-project.json`. Each committed edit autosaves to localStorage,
   and reloading restores it. Keep downloaded files as backups. Undo history lasts
   for the current session.

Live dimensions stay readable in screen pixels while zooming. At distant zoom
levels, grid dots are thinned for legibility; snapping always uses 0.100 m.
Moving a corner by hand updates both its current and sketch coordinates.
Circle (`C`) and Line (`L`) remain marked **Later** for M6.
Deleting geometry removes dependent wall/opening/join metadata and rejects affected
measurements while preserving their historical endpoints. Unaffected edge references
are reindexed. Invalid files and invalid polygon edits leave the project intact.

## Try survey mode

1. Sketch a roughly 4 × 3 rectangle, clicking its bottom-left corner first, then
   its top-right corner. Press **S**. The magenta arrow follows the clockwise
   queue from corner A; other rooms dim.
2. Enter **3**, **4**, **3**, **4**, **5**, **5**, pressing Enter after each value.
   After the walls the room is not rigid; after the first diagonal it is rigid
   but unchecked; after the second it becomes green and consistent.
3. Click the **D → C** reading and enter **4.040**. The room turns red and shows
   an ordered re-measure list, even though each residual is below 15 mm. Click
   that reading again and enter **4.000** to clear the inconsistency.

**Skip** keeps an unreachable request for later. **Blocked** lets you choose which
endpoint is blocked, then pick a point on an edge. **M** adds a custom distance
between two corners, jambs or edge points. Click queue rows to jump, and use their
up/down buttons to reorder. **Redo** re-measures the last reading; **Ctrl+Z** and
**Ctrl+Shift+Z** undo/redo the whole action, including its fit and queue position.
**Esc** cancels picking or clears input; **S** stops survey mode. S/M/F shortcuts
also work in an empty command field. Metres, comma decimals, cm and mm are accepted.

Set placement uncertainty in **Survey → Settings** or **Edit → Settings**. The
setting affects new and re-measured readings only. Project JSON and autosave retain
the queue, skipped requests, old rejected values and settings; press S after reload
to resume pending work. The queue continues with openings, heights and joins.

## Try openings and shared walls

1. Sketch two touching rooms. Select the first, press **D**, and click their shared
   edge. A paired door appears on the other room; Properties show **0.300 m ·
   unmeasured**. Rooms stay touching until that thickness is measured.
2. With **V**, drag the opening or its square end handles. Movement and resizing
   snap to **0.050 m**. Properties edit width, offset, height, hinge and swing.
   Use **W** for windows and **A** for arches. **Unlink pair** keeps both openings;
   select another compatible opening in Properties to link them manually.
3. Press **S**. After walls and diagonals, enter both jamb distances from the
   indicated corner, opening height, window sill/thickness, and two room heights.
   The doorway step asks for wall thickness and the neighbour's jamb positions.
   A **0.300** thickness separates the faces by 30 cm while aligning the jambs.
4. The room panel lists both heights and flags differences above **0.020 m**.
   Expand **Wall thickness per edge** to edit exterior thickness. **Delete** on
   either paired door removes both and their join; **Ctrl+Z** restores them.

## Backups and recovery

Use **File > Download backup (JSON)** for a dated copy outside the browser.
The app retains five rolling autosaves; **File > Restore autosave 1–5** opens an
earlier state, and **Ctrl+Z** undoes that restore. On reload, a missing, damaged or
older autosave recovers from the newest usable local backup and shows a warning.
The latest requested JSON download is also retained locally for that comparison.
Downloaded files remain ordinary schema-2 project JSON and open with **File > Open**.
The app cannot scan your Downloads folder; keep the downloaded file in case browser
storage is cleared.

## Source layout

- `src/model`: pure project types, editing, geometry, JSON validation, and undo history.
- `src/solver`: pure LM fitting, rigidity, consistency, residuals, and leave-one-out diagnostics.
- `src/survey`: pure queue rules, point picking, measurement prompts and survey transactions.
- `src/ui`: React components and the CAD theme.
- `src/tools`: pure snapping and viewport helpers.
- `src/export`: export formats (M5).

Vitest runs in Node by default, and ESLint restricts UI imports and browser globals
in the model and solver. Run `npm test -- src/solver` for the seven documented
solver cases and numerical/diagnostic tests. See `docs/SOLVER.md` for the API.
Run `npm test -- src/survey` for survey workflow tests.
Saves use schema version 2. Existing version-1 files migrate automatically; unsupported future versions are rejected.

IBM Plex Mono regular and semibold Latin webfonts are bundled under `public/fonts`
from [Google Fonts](https://fonts.google.com/specimen/IBM+Plex+Mono), including
Italian accented characters. Their SIL Open Font License is in `public/fonts/OFL.txt`.

## How it works (in one minute)

1. **Sketch.** Draw rooms as rough rectangles or polygons. Proportions only need to be approximately right.
2. **Survey.** The app picks the next measurement, draws an arrow on the plan and asks for the number. You read the laser and type it.
3. **Fit.** After each entry, a least-squares solver moves the corners so the plan matches every measurement. It flags any measurement that doesn't fit.
4. **Export.** SVG, PDF (to scale, with dimensions), DXF (for CAD/architects), PNG, and the native JSON project.

## Docs

| File                 | What                                                   |
| -------------------- | ------------------------------------------------------ |
| `docs/SPEC.md`       | Product spec: concepts, features, measurement workflow |
| `docs/DATA_MODEL.md` | Project file format (JSON)                             |
| `docs/SOLVER.md`     | Geometry fitting and measurement planning              |
| `docs/UI.md`         | Interface and 80s/90s CAD look                         |
| `docs/ROADMAP.md`    | Milestones, in build order                             |
| `AGENTS.md`          | Instructions for the coding agent (Codex)              |
| `examples/`          | Sample project and solver test cases                   |

## Stack

TypeScript, Vite, React, SVG rendering. The app runs in the browser with no backend. Laptop first; tablet and phone later as a PWA.
