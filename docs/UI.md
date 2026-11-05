# UI: 80s/90s CAD, few buttons

Inspiration: AutoCAD R12 for DOS (black drawing area, bright line colours, command line), with Windows 95 / Mac OS 8 panels (grey bevelled buttons). Few buttons, everything also on a single key, nothing hidden more than one click deep.

## Layout (laptop)
```
┌ File  Edit  View  Survey  Export  Help ──────────────── rilievo ┐
├────┬──────────────────────────────────────────────┬───────────┤
│ ▢  │                                              │ BLOCKS    │
│ ⬠  │                                              │ > Piano T │
│ ○  │            drawing area (black)              │ ROOMS     │
│ ╱  │        grid dots, cyan walls, yellow         │ Cucina    │
│ ⊓  │        dimensions, magenta arrow for the     │ Bagno     │
│ ⊞  │        current measurement                   │───────────│
│ ↔  │                                              │ PROPERTIES│
│ ✋ │                                              │ QUEUE  3/24│
├────┴──────────────────────────────────────────────┴───────────┤
│ > Measure CUCINA north wall A→B : 3.425_        [Enter] [Skip]│
│ X 3.120  Y 1.004 | SNAP ON | GRID 0.10 | RMS 0.8 | 12/24 done │
└────────────────────────────────────────────────────────────────┘
```
- **Left tool palette** (vertical, icon buttons with a single-letter hint): Select `V`, Rectangle `R`, Polygon `P`, Circle `C`, Line `L`, Door `D`, Window `W`, Arch `A`, Measure (custom) `M`, Pan `Space` drag.
- **Right panel:** Blocks / Rooms tree, Properties of the selection, Measurement queue (progress, list, residuals coloured).
- **Bottom command line:** shows the current prompt and takes the typed value. It's where survey mode happens. Commands can also be typed (`rect`, `door`, `export pdf`), like AutoCAD.
- **Status bar:** cursor coordinates, snap, grid, fit RMS, survey progress.

## Look
- Drawing area: background `#000000`, grid dots `#1E3A3A`, walls `#00FFFF` (cyan), selected `#FFFFFF`, dimensions `#FFFF00` (yellow), current measurement arrow `#FF00FF` (magenta, animated dashes), flagged measurement `#FF3030` (red), done measurement `#00FF66` (green).
- Panels: grey `#C0C0C0` with a 2 px bevel (white top-left, `#808080` bottom-right), like Windows 95.
- Fonts: `IBM Plex Mono` for the UI and numbers; optionally `VT323` for titles. Both are on Google Fonts; bundle them locally so the app works offline.
- No gradients, no shadows, no rounded corners. Pixel-crisp 1 px lines.
- An optional light theme (white paper, black lines) for printing and exports.

## Interaction rules
- Zoom with the mouse wheel around the cursor. Pan with Space+drag or the middle mouse button. `F` = fit all.
- Snap to grid (0.10 m default) and to corners and edges. Hold Shift for no snapping.
- `Esc` cancels the current tool. `Ctrl+Z` / `Ctrl+Shift+Z` undo and redo, for all actions including measurements.
- **Survey mode** (`S` or the Survey menu): the drawing dims except the current room. The arrow and prompt show the next measurement. The focus stays in the command line, so the person typing only uses the number pad and Enter.
- Every number field accepts `3.425`, `3,425` (Italian comma) and `342.5cm`.

## Later: tablet/phone
The tool palette becomes a bottom bar, the right panel a slide-up sheet, and the command line a large number pad. Touch: one finger draws or selects, two fingers pan and zoom.

## M4 drawing details

Walls have dark grey (`#303030`) poche between their inner and outer lines. Keep
cyan walls and white selections. Exterior thickness starts at 0.400 m; measured
joins define interior thickness. Pending joins stay touching until measured.
Doorways interrupt the wall fill and show a leaf plus swing arc, windows have three
parallel lines, and arches are clear gaps. Shared doors show one physical swing.
Selected openings have two square resize handles. Scalar survey prompts show a
magenta vertical arrow and a height/sill/thickness label. Room details include
height readings, a red sloping-ceiling warning, openings and per-edge thickness.
