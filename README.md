# rilievo

Sketch a building roughly, then let the app walk you through the laser measurements and fit the sketch to them. Built for surveying a house room by room (later: other floors, the garden) and exporting clean plans.

Status: **M0 complete** — the empty CAD workspace and development toolchain are in place.
Drawing, saving, fitting, surveying, and exports come in later milestones; their controls are disabled in this scaffold.

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

## Source layout

- `src/model`: pure project types, JSON handling, and migrations (M1 onward).
- `src/solver`: pure fitting and diagnostics (M2).
- `src/ui`: React components and the CAD theme.
- `src/tools`: drawing tools (M1 onward).
- `src/export`: export formats (M5).

The model and solver folders are placeholders; no schema changes or geometry logic
are introduced in M0. Vitest runs in Node by default, and ESLint restricts UI imports
and browser globals in those folders.

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
