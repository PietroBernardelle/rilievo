# Solver test cases

Lengths in metres. Tolerance for "equals": 1 mm unless stated. Each case becomes a Vitest test in `src/solver/__tests__/`.

## 1. Square room is square
Sketch: rectangle, roughly 4 × 3. Measurements: AB 4.000, BC 3.000, CD 4.000, DA 3.000, AC 5.000.
Expect: all angles 90° ± 0.05°; BD fitted = 5.000; every residual < 1 mm; room rigid.

## 2. Not square (parallelogram)
Sketch: rectangle, roughly 4 × 3. Measurements: AB 4.000, BC 3.000, CD 4.000, DA 3.000, AC 5.100.
Expect: angle at B ≈ 92.41° (law of cosines: cos B = (16 + 9 − 26.01) / 24); predicted BD ≈ 4.898; residuals < 1 mm. The soft right-angle prior must not pull it back to 90°.

## 3. Inconsistent measurement is detected, not localised
As case 1, plus BD 5.300.
Expect: the room consistency test fails (p < 0.01); at least one measurement is also flagged (> 15 mm); BD appears in the ordered suspects. Leave-one-out without BD gives all residuals < 1 mm, but the single redundancy cannot localise the error: removing any checked distance removes the closure check. Return no single probable wrong measurement.

## 4. Not rigid yet
Sketch: rectangle. Measurements: AB, BC, CD, DA only.
Expect: room reported not rigid (missing 1 diagonal); the fit still converges (the angle prior holds the shape); the next suggested measurement is a diagonal.

## 5. L-shaped room (6 corners)
Sketch: L made of a 5 × 4 box minus a 2 × 2 corner. Measurements: the 6 walls (5, 2, 2, 2, 3, 4 going round) plus diagonals until rigid (2·6 − 3 = 9 distances).
Expect: rigid after 9 independent distances; shape matches within 1 mm.

## 6. Two rooms joined through a doorway
Rooms A (4 × 3) and B (3 × 3) share a wall 0.30 thick. Doorway: in A, the jamb is 0.80 from A's corner; in B, the same jamb is 0.50 from B's corner.
Expect: B is placed parallel to A, 0.30 away, shifted so the jambs line up; the total outside length along that side = 4 + 0.30 + 3 = 7.30 if the rooms are in a row.

## 7. Italian number input
Parsing: `3,425` → 3.425; `342.5cm` → 3.425; `3425mm` → 3.425; `3.4.2` → error.

## M2.1 consistency regressions

- Four walls plus both diagonals of a 4 × 3 room, with CD entered as 4.040:
  individual residuals stay below 15 mm, but the room is inconsistent (p < 0.01).
  CD is in the ordered suspect list; no single measurement is localised.
- The same error with only AC measured: the room is rigid and consistent in the
  sense of no detected inconsistency, but all five measurements are `unchecked`.
  Redundancy is zero, p is unavailable, and BD is suggested as an extra check.
- All six measurements correct: room consistent, no suspects.
- Eight independent rooms with six measurements each and one wall 40 mm wrong:
  only that room is inconsistent, other rooms match their separate fits, and the
  entire fit including diagnostics takes less than 500 ms.
