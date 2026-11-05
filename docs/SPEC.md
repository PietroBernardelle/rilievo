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
1. **Perimeter:** walls clockwise from the corner nearest the entrance door.
2. **Diagonals:** for a 4-corner room, both diagonals. One makes it rigid; the second checks it. For an n-corner room, add diagonals until it is rigid (2n−3 independent distances), plus at least one extra as a check.
3. **Openings:** for each door or window, the distance from the nearest corner to each jamb, the width, the height, and the sill.
4. **Height:** room height, at 2 points if the ceiling may slope.
5. **Joins:** at each door between two rooms, the wall thickness, and the jamb positions measured from both sides.
6. **Exterior** (when reachable): outside lengths of the building. The inside rooms plus walls must add up to these, which is the best overall check.

The user can reorder, skip or add a custom measurement (click two points, then type a value) at any time.

## Non-goals (v1)
- No official or legal drawings. Those come from the geometra or architect.
- No automatic photo or LiDAR scanning.
- No accounts and no server. Everything stays local.

## Acceptance (v1 done when)
- A 5-room floor can be sketched, surveyed, and exported to SVG, PDF and DXF in one session.
- The test cases in `examples/solver-cases.md` pass.
- An inconsistent measurement is flagged, and re-entering it clears the flag.
