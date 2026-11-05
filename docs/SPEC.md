# rilievo: product spec

## Goal
Produce an accurate 2D plan of a building (and later its garden) from a rough sketch plus laser distance measurements, with as few measurements as possible and with built-in error checks. First real use: one floor of a family house in northern Italy before a renovation.

## Users and setting
- Two people: one holds the laser (Makita, **no Bluetooth**), one types on a laptop.
- Old house: walls are not perfectly straight or square, and rooms are full of furniture.
- Laser precision is about ±2 mm. Placement error (where the laser sits on the wall) is about ±5 mm.

## Core concepts
| Concept | Meaning |
|---|---|
| **Project** | One property. Holds blocks, links between blocks, and settings (units, author). |
| **Block** | A self-contained survey area: a floor (`floor`), the garden (`site`), a staircase, a facade (`other`). Each block has its own coordinates and its own fit. |
| **Room** | A closed polygon of corners (the inside face of the walls), with a name and a height. |
| **Corner / vertex** | A point in a block. Rooms share no vertices; rooms are connected through **joins** (see below). |
| **Wall** | An edge of a room polygon. Optional properties: thickness, exterior/interior. |
| **Opening** | A door, window or arch on a wall: position along the wall, width, height, sill height. |
| **Feature** | A non-room shape: circle (tree, column), polyline (path, fence), rectangle (bed, shed). Mostly for the garden. |
| **Measurement** | A distance between two points (corner, point on a wall, opening jamb) with a value and an uncertainty. |
| **Join** | A rule tying two rooms together, e.g. "these two walls are the same wall, thickness 0.30 m, door jambs aligned". |
| **Link** | Ties two blocks together through shared reference points (e.g. a staircase corner on both floors, an outside corner of the house in the garden block). |

The block design keeps everything modular. Nonna's floor is block 1. The upper floor and the garden come later as new blocks and are attached through links, without redoing block 1.

## Features, v1 (one floor)
1. **Sketching:** rectangle, polygon, circle, and line tools. Snap to a grid and to other corners. Move or delete corners. Name rooms.
2. **Openings:** place doors and windows on a wall by clicking it.
3. **Survey mode** (the core feature):
   - Pick a block. The app builds a **measurement queue** (see "Measurement workflow").
   - The current measurement is shown as an animated arrow between two highlighted points, plus a text prompt: `Measure KITCHEN: north wall, corner A to corner B`.
   - Type the value (metres, e.g. `3.425`) and press Enter. The fit updates and the app moves to the next measurement.
   - Actions: **skip** (can't reach), **blocked** (the app proposes an alternative, e.g. split the wall at a point), **redo**, **undo**.
   - Each measurement shows its **residual**, i.e. how far the fitted plan disagrees with it. Anything over the tolerance (default 15 mm, or 3σ) turns red, and the app suggests re-measuring it.
4. **Heights:** room height, door and window heights, sill heights.
5. **Wall thickness:** measured at door frames and windows. Rooms are joined using door jambs plus thickness.
6. **Save/load:** the project is a JSON file. Autosave to local storage, plus explicit File > Save / Open.
7. **Export:** SVG, PDF (A4/A3, scale 1:50 or 1:100, title block, dimension lines, room names and areas), DXF (R12 ASCII, layers), PNG.
8. **Areas:** floor area per room and total, wall lengths, and perimeter shown in a side panel and on exports.

## Later
- More blocks: the upper floor, the garden (site plan with features), links between blocks.
- Smart next-measurement choice using uncertainty (see `SOLVER.md`).
- Tablet and phone layout, touch input, PWA (offline).
- Voice entry of numbers.
- Photo per measurement or per room.
- 3D extrusion preview (walls × heights).
- Renovation layer: mark walls to demolish or build, and furniture.

## Measurement workflow (v1 rules)
For each room, in this order:
1. **Perimeter:** walls clockwise from the corner nearest the entrance door. In M3,
   start at corner A (the first stored corner); schema 1 has no entrance marker.
   Click a queue item to start elsewhere, or use its up/down controls to reorder.
2. **Diagonals:** for a 4-corner room, both diagonals. One makes it rigid; the second checks it. For an n-corner room, add diagonals until it is rigid (2n−3 independent distances), plus at least one extra as a check.
3. **Openings:** for each door or window, the distance from the nearest corner to each jamb, the width, the height, and the sill.
4. **Height:** room height, at 2 points if the ceiling may slope.
5. **Joins:** at each door between two rooms, the wall thickness, and the jamb positions measured from both sides.
6. **Exterior** (when reachable): outside lengths of the building. The inside rooms plus walls must add up to these, which is the best overall check.

The user can reorder, skip or add a custom measurement (click two points, then type a value) at any time.

### M3 survey controls and feedback

- Press **S** or use **Survey → Start survey**. The selected room's pending queue
  comes first; subsequent pending readings follow queue order. M4 continues after walls and diagonals with openings, room heights and joins.
- Type a value and press Enter. The reading and its converged fit commit together,
  then the next prompt receives focus. Invalid input or a failed solve leaves the
  reading, plan and queue unchanged. Sketch positions are retained.
- Room status is **not rigid**, **rigid but unchecked** (measure the second
  diagonal), **consistent** (green), or **inconsistent** (red). Red rooms show
  ordered **Re-measure** suggestions even when every individual residual is below
  15 mm. Individual unchecked distances remain marked in the queue.
- **Skip** retains an inaccessible request as skipped. Click it later to measure
  it. **Blocked** lets you choose the start or end corner, then a reachable point
  inside an edge; the original request is skipped and an alternative is queued.
  The chosen point uses the existing edge-fraction reference and follows the edge
  when the plan fits. Choose the same marked point when taking the reading.
- **Redo** re-measures the last reading; clicking a completed queue item or a
  suggestion re-measures that item. The previous reading becomes rejected history.
  **Undo / Ctrl+Z** restores the reading, geometry and cursor together;
  **Ctrl+Shift+Z** restores the undone action. Command-key equivalents work on macOS.
- **M** starts a custom distance: click two corners, jambs or edge points. **Esc**
  cancels point picking or clears the current input. **S** stops survey mode.
  In the command field, S/M/F shortcuts work when the input is empty, so unit
  suffixes such as `3m` still work.
- **Survey → Settings** (also under Edit) edits `placementSigma` in metres; comma
  decimals and cm/mm are accepted. New and re-measured values store
  `hypot(laserSigma, placementSigma)` as their sigma. Existing readings keep their
  recorded sigma. Settings edits are undoable and saved with the project.

## Non-goals (v1)
- No official or legal drawings. Those come from the geometra or architect.
- No automatic photo or LiDAR scanning.
- No accounts and no server. Everything stays local.

## Acceptance (v1 done when)
- A 5-room floor can be sketched, surveyed, and exported to SVG, PDF and DXF in one session.
- The test cases in `examples/solver-cases.md` pass.
- An inconsistent measurement is flagged, and re-entering it clears the flag.

## M4 opening and wall workflow

- D / W / A place a door, window or arch on the clicked edge. V selects an
  opening; drag its body to move or either square end to resize, in 0.050 m steps.
  Properties edit dimensions, door hinge side and inward/outward swing.
- Doors/arches on an active shared edge create a paired opening and an unmeasured
  join. The default 0.300 m thickness is shown, but faces stay touching until a
  thickness reading is entered. Properties can link or unlink a pair manually.
- After a room's walls and diagonals, measure both jambs from the corner nearest
  the opening, then its height and (for windows) sill and wall thickness. Width
  follows from jamb readings. The chosen corner remains stable as the fit moves.
- Next measure room height at two opposite corners, then doorway thickness and
  the neighbouring room's two jamb positions. A shared opening is surveyed once;
  its opposite jamb readings belong to the join step, avoiding duplicate requests.
- Heights use a vertical arrow icon and text. Skip and re-measure work normally;
  use Skip for inaccessible scalar readings, and Blocked for 2D distances.
- Room Properties show the two height readings and a sloping-ceiling flag, opening
  list, and editable thickness per edge. Exterior walls default to 0.400 m.
  Measured joins supply interior thickness. Walls use dark grey poche between
  cyan/white face lines, interrupted by openings; a paired door has one swing arc.
- Deleting a doorway removes its pair and join and retains rejected measurement
  history. Placement, edits, linking, unlinking and all readings are undoable.
