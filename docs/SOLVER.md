# Solver: fitting the sketch to the measurements

A pure TypeScript module (`src/solver/`), with no UI imports, unit-tested on its own.

## Unknowns
The x, y of every vertex in the block, plus the positions of openings along their edges. To pin the plan down, the first vertex of the first room is fixed at (0, 0), and the first wall of that room points along +x. Everything else can move.

## Residuals (weighted least squares)
Minimise Σ rᵢ², where each residual is divided by its standard deviation:

| Term | Residual | σ / weight |
|---|---|---|
| Distance measurement | (‖pa − pb‖ − value) / σ | σ = √(laserσ² + placementσ²) ≈ 5 mm |
| Height / sill / width | (fitted − value) / σ | as above (may be stored outside the 2D fit) |
| Right angle (from sketch) | angle error / σθ | soft, σθ ≈ 2° (old houses are not square) |
| Collinear / parallel | geometry error / σ | soft or hard (from joins) |
| Sketch prior | (p − p_sketch) / σs | very weak, σs ≈ 1 m. Only keeps unmeasured parts in place |
| Join (shared wall) | offset between facing edges minus thickness | σ ≈ 5 mm |

Solve with **Levenberg–Marquardt** (Gauss–Newton with damping). Use a numeric Jacobian (central differences) in v1; switch to an analytic one if it's slow. Problems are small (one floor is about 50–150 unknowns), so dense matrices are fine. Write it ourselves (about 150 lines) instead of pulling in a heavy library.

## Diagnostics
- **Residual per measurement** after the fit. Flag if |fitted − measured| > tolerance (default 15 mm) or > 3σ.
- **Which measurement is probably wrong:** the one with the largest normalised residual. Better: refit leaving each one out (leave-one-out) and see which removal fixes the rest.
- **Rigidity:** a room is rigid when the number of independent distances ≥ 2n − 3 (n = corners). Check by the rank of the Jacobian. The UI shows rigid / not yet rigid per room.
- **Overall check:** RMS of the normalised residuals, shown in the status bar.

## Choosing the next measurement
- **v1 (rules):** perimeter → diagonals until rigid → one extra diagonal → openings → heights → joins → exterior. See `SPEC.md`.
- **v2 (smart):** after each fit, compute the covariance Σ ≈ (JᵀJ)⁻¹. For every candidate pair of points (in the same room, likely reachable), predict the variance of that distance: gᵀΣg, where g is the gradient of the distance. Ask for the pair with the largest predicted variance, i.e. the measurement that removes the most uncertainty. Skip pairs the user has marked unreachable.

## Wall thickness and joining rooms
Each room is fitted on its inside faces. Two rooms sharing a wall are tied by a join:
- the facing edges are parallel, at distance = thickness (measured in the doorway);
- a shared doorway aligns them along the wall: the jamb in room A and the jamb in room B are the same physical edge, offset only by the thickness.

## Tests
See `examples/solver-cases.md`. Every case is a unit test that must pass before survey mode is wired to the UI.
