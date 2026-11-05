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
| Right angle (from sketch) | angle error / σθ | unmeasured: σθ = 0.5°, weight 1; measured: σθ = 2°, weight 0.1 (old houses are not square) |
| Collinear / parallel | geometry error / σ | soft or hard (from joins) |
| Sketch position, measured room | (p − p_sketch) / σs | very weak, σs = 1 m |
| Unmeasured room shape | (edge length − sketch edge length) / σe | σe = 0.5 m; right angles dominate the shape |
| Unmeasured room position | (p − p_sketch) / σs | very weak anchor, σs = 10 m |
| Active corner–corner contact | (pa − pb) / σc, one residual per coordinate | σc = 0.005 m |
| Active corner–edge contact | perpendicular distance / σc; segment overshoot / σc | σc = 0.005 m; free sliding inside the segment |
| Join (shared wall) | offset between facing edges minus thickness | σ ≈ 5 mm |

Solve with **Levenberg–Marquardt** (Gauss–Newton with damping). Use a numeric Jacobian (central differences) in v1; switch to an analytic one if it's slow. Problems are small (one floor is about 50–150 unknowns), so dense matrices are fine. Write it ourselves (about 150 lines) instead of pulling in a heavy library.

## Diagnostics
- **Residual per measurement** after the fit. Flag if |fitted − measured| > tolerance (default 15 mm) or > 3σ.
- **Consistency per room and connected group:** sum the squared normalised measurement residuals and test against a chi-square distribution with ν = number of measurements − rank of the measurement Jacobian. Report `consistent: false` when p < 0.01. This detects distributed errors even when every individual residual is below 15 mm.
- **Redundancy per measurement:** use the weighted measurement Jacobian J (each row divided by that measurement's σ), excluding sketch, shape, angle, contact and join rows. Compute the diagonal of I − H, where H = J(JᵀJ)⁺Jᵀ. A pivoted, reorthogonalised QR computes the same projection without inverting the singular normal matrix; the pseudoinverse accounts for free translations, rotations and unobserved variables.
- **Unchecked measurements:** redundancy below 1e-6 is reported as zero with `unchecked: true` and `standardizedResidual: null`. Errors in those measurements cannot be detected from the available distances. With ν = 0, `consistent: true` means no inconsistency was detected; `pValue: null` explicitly means there is no statistical check.
- **Suspects:** in an inconsistent room or group, rank checked measurements by descending |wᵢ|, where wᵢ = (fitted − measured) / (σᵢ √redundancyᵢ). Return this ordered list for re-measurement. A high rank alone does not identify the wrong measurement.
- **Probable wrong measurement:** run leave-one-out for inconsistent groups with more than one redundancy. Name a single measurement only when every trial converges and exactly one omission makes all remaining room/group tests consistent, with positive redundancy remaining. Otherwise keep the probable ID null. One redundant distance detects a closure error but cannot localise it by leave-one-out.
- **Rigidity:** a room is rigid when the number of independent distances ≥ 2n − 3 (n = corners). Check by the rank of the Jacobian. The UI shows rigid / not yet rigid per room.
- **Overall check:** RMS of the normalised residuals, shown in the status bar.

These are linearised tests using the recorded measurement sigmas as known noise
estimates. Priors, sketch contacts and joins influence the fitted geometry but do not supply extra
measurement evidence in these tests. Room tests use distances with both endpoints
in that room; group tests also include recorded cross-room distances. Each scope
computes its own Jacobian, rank and redundancy. Chi-square tail probabilities use
the [regularised incomplete gamma function](https://dlmf.nist.gov/8.2), verified
against [NIST critical values](https://www.itl.nist.gov/div898/handbook/eda/section3/eda3674.htm).

## Choosing the next measurement
- **v1 (rules):** perimeter → diagonals until rigid → one extra diagonal → openings → heights → joins → exterior. See `SPEC.md`.
- **v2 (smart):** after each fit, compute the covariance Σ ≈ (JᵀJ)⁻¹. For every candidate pair of points (in the same room, likely reachable), predict the variance of that distance: gᵀΣg, where g is the gradient of the distance. Ask for the pair with the largest predicted variance, i.e. the measurement that removes the most uncertainty. Skip pairs the user has marked unreachable.

## Wall thickness and joining rooms
Each room is fitted on its inside faces. Two rooms sharing a wall are tied by a join:
- the facing edges are parallel, at distance = thickness (measured in the doorway);
- a shared doorway aligns them along the wall: the jamb in room A and the jamb in room B are the same physical edge, offset only by the thickness.

## M3.1: attached rooms follow fitted neighbours

`sketchContacts(block)` infers temporary attachments from `vertex.sketch`:

- Two corners in different rooms within **0.001 m** form a corner–corner contact.
  Each pair is included once; its two incident edges do not add duplicate contacts.
- A remaining corner within **0.001 m** of another room's nearest edge forms a
  corner–edge contact. The sketch identifies the edge, but does not pin a fraction
  along it. A point-on-line residual keeps the corner on the fitted edge's line;
  sliding within the segment is free. A second residual penalises only the
  distance beyond either endpoint, measured along the line. Both use sigma
  0.005 m. These inferred contacts are separate from recorded `edgePoint`
  measurement references, which still retain their fixed `t`.
- A contact is active only while at least one of its rooms has **no `done`
  measurements**. For this rule, a room owns a measurement when either endpoint
  belongs to it. Queued, skipped and rejected records do not count. Once both
  rooms have done readings, their sketch contact is ignored.

Each active contact contributes two soft residuals with **sigma 0.005 m**. It is
recomputed when a fit starts, using the unchanged sketch rather than the latest
fitted gap. Contacts are not written into measurements, constraints or project
JSON. On the plan, small cyan dots identify the active attached corners and follow
their fitted positions; dots disappear when the contact no longer applies.

An unmeasured room uses **sigma 0.5°** for right angles, **sigma 0.5 m** for sketched
edge lengths, and a weak **10 m** absolute position prior. Generated right-angle
constraints have weight 1 until the room has a done measurement. The stronger
angle prior keeps rectangular sketches square as attached walls change length;
the weaker length prior allows the opposite wall to follow. Edge contacts slide
instead of shrinking a room in proportion to its neighbour. These are soft shape
priors: the room can stretch when contacts on opposite sides require it, and weak
position anchors can accumulate small length differences along a chain.

Measured rooms retain the existing 1 m position prior and may translate or rotate
within the connected problem. Only the first room's origin/orientation is fixed.
Consequently, a free measured neighbour may shift instead of forcing an unmeasured
middle room to stretch. When measured cross-room distances constrain the space,
the middle room stretches to keep contact with both neighbours. This preserves
the requested freedom of measured neighbours without adding artificial anchors.

Active contacts join solver components just like explicit joins and cross-room
measurements. Disconnected rooms retain the existing separate-fit placement.
Shape priors and contacts do not count as measurement evidence for rigidity,
redundancy, consistency or unchecked status. The JSON schema remains version 1.

## Tests
See `examples/solver-cases.md`. Every case is a unit test that must pass before survey mode is wired to the UI.

## M2 API and numerical conventions

`src/solver/index.ts` exports `fit(block, options?)`, `leaveOneOut(block, options?)`,
and `resolvePoint(block, pointRef)`. These functions are pure; they do not mutate
the input or import React/DOM. M3 calls the solver when starting survey mode and
after each entered reading. The pure survey session commits the reading and fitted
block together only when the fit converges.

- `fit` returns a fitted `block`, measurement `residuals`, normalised measurement
  `rms`, per-room `rooms` diagnostics, connected `groups`, and `generatedConstraints`.
  Rooms include rigidity and a suggested distance when under-constrained or rigid
  but lacking a redundant check. Rooms/groups include `measurementCount`,
  `parameterRank`, `redundancy` (ν), `chiSquare`, `pValue`, `consistent`, ordered
  `suspectMeasurements`, and `probableWrongMeasurementId`.
- Each residual also includes `redundancy`, `standardizedResidual`, and `unchecked`,
  computed in its connected group. Room/group suspect entries include `id`,
  `standardizedResidual`, and `redundancy` for that scope. Top-level
  `suspectMeasurements` merges inconsistent scopes, keeping the largest |w| per
  measurement. Top-level `probableWrongMeasurementId` is only set when exactly one
  group is inconsistent and localised. `worstMeasurementId` remains a compatibility
  alias for that ID, rather than naming the largest residual unconditionally.
- It also reports `converged`, `iterations` and `hardError`. An exhausted or stalled
  solve returns its last feasible iterate with `converged: false`; callers must
  inspect that status before treating the result as a completed fit.
- `options.tolerance` defaults to 0.015 m; `options.maxIterations` defaults to 120.
  Each recorded measurement's positive `sigma` supplies its weight. Join sigma
  defaults to `hypot(0.002, 0.005)` m. Right-angle priors use a 0.5° sigma and
  generated weight 1 in rooms without done measurements. Measured rooms retain
  the 2° sigma and generated weight 0.1. Priors are generated within 5° of perpendicular.
  Explicit constraint weights and hard constraints retain their specified strength.
  Explicit perpendicular constraints override generation for the same edge pair.
- The first room's first corner is exactly `(0, 0)` and its first edge points
  along +x. Sketch priors are transformed into that same reference frame, while
  the stored `sketch` positions remain unchanged. LM retains full precision;
  the model's JSON writer rounds stored coordinates to 0.0001 m.
- Independent rooms are fitted as separate problems. Active sketch contacts, joins, explicit cross-room
  constraints and active cross-room measurements connect rooms into a single
  problem. Each component fixes its own gauge while solving, then returns to its
  original placement in the block's reference frame. Measurements and their history
  are preserved. `iterations` is the sum across component fits, `hardError` their
  maximum, and `converged` requires every component to converge. The iteration
  limit applies to each solve; diagnostic leave-one-out refits are not included in
  the returned iteration count.
- Hard perpendicular/parallel/collinear constraints use equality rows in the
  damped linear solve, rather than a large soft weight. Convergence requires
  their residuals below 1e-8 (radians for angles, metres for offsets).
- Only `done` measurements with non-null values enter the fit. Distance, offset
  and thickness records use their two point references. Height records remain
  outside the 2D fit and are returned in `deferredMeasurementIds`. No measurement
  status or value is changed by fitting.
- Rigidity uses the rank of the measured-distance Jacobian, excluding priors, contacts and
  joins. Unknown opening offsets are eliminated from that rank count so that
  jamb measurements do not falsely imply independent corner constraints.
- `leaveOneOut` returns one refit summary per omitted measurement, ordered by
  the remaining measurements' normalised RMS. Each summary includes `consistent`
  and remaining `redundancy`, as well as `rms`, `maxResidual`, and `converged`.
  It leaves the source history intact. Consistency and suspect results are transient
  solver output; the project JSON schema remains at version 1.

### Pairing doorway records without changing schema 1

A join's `via` identifies an opening on either of its joined edges. The opposite
edge must contain exactly one opening with the same type and width (within
0.0001 m). Zero or multiple matches produce a descriptive error. This rule was
confirmed for M2; no additional join fields are introduced.

For CCW rooms, facing walls run in opposite directions. Jamb side 0 on one room
therefore aligns with side 1 on the other, separated along the first wall's outward
normal by `join.thickness`. The two measured corner-to-jamb distances in solver
case 6 are explicit `offset` measurements, so fitting cannot slide the opening
positions in place of aligning the rooms.

### Verification

All seven cases from `examples/solver-cases.md` are executable tests in
`src/solver/__tests__/solver-cases.test.ts`. Additional tests exercise hard and
redundant constraints, rank deficiency, opening/edge references, gauge fixing,
iteration limits, invalid inputs, and the linear algebra routines.
M2.1 tests in `consistency.test.ts` cover the 40 mm wall error with two diagonals,
unchecked measurements with one diagonal, correct measurements, ambiguous and
unique leave-one-out explanations, joined groups, unequal sigmas, component
placement, and an eight-room fit with one bad wall in under 500 ms.
M3.1 tests in `contacts.test.ts` cover the 1 mm threshold, corner/edge matching,
sliding edge contacts and segment limits, 50 mm neighbour movement without width loss, stretching and
free measured-neighbour movement, contact release, disconnected rooms, propagation
through a chain, fixed origin/orientation, repeat fits and schema-1 round trips.
Regression cases fit Cucina from 5.0 × 3.8 m to 4.9 × 3.7 m: a corner-attached
Room 2 becomes 2.000 × 3.700 m; a room attached at x = 1 and x = 4 on the top edge
keeps its 3.000 m width at y = 3.700 m. Both use 0.5 mm length tolerance. A third
room follows through Room 2 with 2 mm length tolerance for the accumulated soft
anchors. Every unmeasured room's angles stay within 0.1° of 90°.

```sh
npm test -- src/solver
```
