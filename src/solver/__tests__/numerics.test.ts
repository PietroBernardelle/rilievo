import { describe, expect, it } from 'vitest';
import { matrixRank, solveLinear, squaredNorm } from '../linear';
import { levenbergMarquardt, numericJacobian } from '../lm';

describe('dense linear algebra', () => {
  it('solves with pivoting without mutating its inputs', () => {
    const matrix = [
      [0, 2],
      [1, 3],
    ];
    const rhs = [4, 7];
    expect(solveLinear(matrix, rhs)).toEqual([1, 2]);
    expect(matrix).toEqual([
      [0, 2],
      [1, 3],
    ]);
    expect(rhs).toEqual([4, 7]);
    expect(
      solveLinear(
        [
          [1, 2],
          [2, 4],
        ],
        [1, 2],
      ),
    ).toBeNull();
    expect(solveLinear([], [])).toEqual([]);
    expect(() => solveLinear([[1]], [1, 2])).toThrow();
  });
  it('counts independent rows in rectangular and nearly dependent matrices', () => {
    expect(
      matrixRank([
        [1, 0, 1],
        [0, 1, 1],
        [1, 1, 2],
      ]),
    ).toBe(2);
    expect(
      matrixRank([
        [1, 1],
        [1, 1 + 1e-10],
      ]),
    ).toBe(1);
    expect(matrixRank([[0, 0]])).toBe(0);
    expect(matrixRank([])).toBe(0);
    expect(matrixRank([[]])).toBe(0);
    expect(squaredNorm([3, 4])).toBe(25);
  });
});
describe('Levenberg–Marquardt', () => {
  it('uses a central-difference Jacobian and converges on nonlinear residuals', () => {
    const jacobian = numericJacobian(
      (x) => [x[0]! ** 2 + x[1]!, Math.sin(x[1]!)],
      [2, 0],
    );
    expect(jacobian[0]![0]).toBeCloseTo(4, 7);
    expect(jacobian[0]![1]).toBeCloseTo(1, 7);
    expect(jacobian[1]![1]).toBeCloseTo(1, 7);
    const result = levenbergMarquardt(
      { residuals: (x) => [x[0]! ** 2 - 4, x[1]! - 3] },
      [1, 0],
    );
    expect(result.converged).toBe(true);
    expect(result.x[0]).toBeCloseTo(2, 7);
    expect(result.x[1]).toBeCloseTo(3, 7);
  });
  it('enforces a hard equality while minimizing conflicting soft terms', () => {
    const result = levenbergMarquardt(
      {
        residuals: (x) => [x[0]! - 2, x[1]! - 3],
        hardResiduals: (x) => [x[0]! + x[1]! - 1],
      },
      [0, 0],
    );
    expect(result.converged).toBe(true);
    expect(result.x[0]).toBeCloseTo(0, 7);
    expect(result.x[1]).toBeCloseTo(1, 7);
    expect(result.hardError).toBeLessThan(1e-8);
  });
  it('handles redundant hard constraints and reports incompatible ones', () => {
    const compatible = levenbergMarquardt(
      {
        residuals: (x) => [x[0]! - 3],
        hardResiduals: (x) => [x[0]! - 1, 2 * x[0]! - 2],
      },
      [0],
    );
    expect(compatible.converged).toBe(true);
    expect(compatible.x[0]).toBeCloseTo(1);
    const incompatible = levenbergMarquardt(
      {
        residuals: (x) => [x[0]! - 3],
        hardResiduals: (x) => [x[0]! - 1, x[0]! - 2],
      },
      [0],
      10,
    );
    expect(incompatible.converged).toBe(false);
    expect(incompatible.hardError).toBeGreaterThan(0.1);
  });
  it('retains a feasible iterate and reports stalled or exhausted solves', () => {
    const initial = [0];
    const stalled = levenbergMarquardt(
      { residuals: (x) => [x[0]! - 2], feasible: (x) => x[0] === 0 },
      initial,
    );
    expect(stalled.converged).toBe(false);
    expect(stalled.x).toEqual(initial);
    const exhausted = levenbergMarquardt(
      { residuals: (x) => [x[0]! ** 2 - 400] },
      [1],
      1,
    );
    expect(exhausted.converged).toBe(false);
    expect(exhausted.iterations).toBe(1);
    expect(() => levenbergMarquardt({ residuals: () => [NaN] }, [0])).toThrow();
    expect(() => levenbergMarquardt({ residuals: () => [] }, [NaN])).toThrow();
    expect(() => levenbergMarquardt({ residuals: () => [] }, [], 0)).toThrow();
  });
});
