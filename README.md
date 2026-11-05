# rilievo

Sketch a building roughly, then let the app walk you through the laser measurements and fit the sketch to them. Built for surveying a house room by room (later: other floors, the garden) and exporting clean plans.

Status: design phase. Start with `docs/SPEC.md`.

## How it works (in one minute)
1. **Sketch.** Draw rooms as rough rectangles or polygons. Proportions only need to be approximately right.
2. **Survey.** The app picks the next measurement, draws an arrow on the plan and asks for the number. You read the laser and type it.
3. **Fit.** After each entry, a least-squares solver moves the corners so the plan matches every measurement. It flags any measurement that doesn't fit.
4. **Export.** SVG, PDF (to scale, with dimensions), DXF (for CAD/architects), PNG, and the native JSON project.

## Docs
| File | What |
|---|---|
| `docs/SPEC.md` | Product spec: concepts, features, measurement workflow |
| `docs/DATA_MODEL.md` | Project file format (JSON) |
| `docs/SOLVER.md` | Geometry fitting and measurement planning |
| `docs/UI.md` | Interface and 80s/90s CAD look |
| `docs/ROADMAP.md` | Milestones, in build order |
| `AGENTS.md` | Instructions for the coding agent (Codex) |
| `examples/` | Sample project and solver test cases |

## Stack (planned)
TypeScript, Vite, React, SVG rendering. The app runs in the browser with no backend. Laptop first; tablet and phone later as a PWA.
