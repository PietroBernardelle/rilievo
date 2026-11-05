# Instructions for coding agents

You are building **rilievo**: sketch a building, get guided laser measurements, fit the sketch to them, export plans.

## Read first
`docs/SPEC.md`, then `docs/DATA_MODEL.md`, `docs/SOLVER.md`, `docs/UI.md`, `docs/ROADMAP.md`. Work milestone by milestone, in the roadmap order.

## Rules
- TypeScript strict. React for UI, SVG for drawing. No backend, no accounts, no telemetry.
- `src/solver` and `src/model` are pure (no React, no DOM) and fully unit-tested with Vitest.
- Few dependencies. Ask before adding anything beyond: react, react-dom, vite, vitest, jspdf, svg2pdf.js, and a small id helper.
- All lengths in metres internally. Display 3 decimals. Parse `3.425`, `3,425` and `342.5cm`.
- Don't change the JSON schema without bumping `schemaVersion` and writing a migration.
- Follow the look in `docs/UI.md` exactly: colours, fonts, no rounded corners.
- Every user action is undoable.
- End each milestone with `npm run build`, `npm test` and lint all passing, and update `docs/ROADMAP.md` (tick what's done).
- Keep commits small, with clear messages (`[solver] add LM fit`, `[ui] survey prompt`).
- If something in the docs is ambiguous, ask instead of guessing.
