import { matrixRank, solveLinear, squaredNorm } from './linear';

const DIFFERENCE_STEP = 1e-5;
const INITIAL_DAMPING = 1e-3;
const HARD_TOLERANCE = 1e-8;
export interface LeastSquaresProblem {
  residuals: (x: number[]) => number[];
  hardResiduals?: (x: number[]) => number[];
  feasible?: (x: number[]) => boolean;
}
export interface LeastSquaresResult {
  x: number[];
  iterations: number;
  converged: boolean;
  cost: number;
  hardError: number;
}
export function numericJacobian(
  fn: (x: number[]) => number[],
  x: number[],
): number[][] {
  const rows = fn(x).length;
  const jacobian = Array.from({ length: rows }, () =>
    Array<number>(x.length).fill(0),
  );
  for (let j = 0; j < x.length; j++) {
    const h = DIFFERENCE_STEP * Math.max(1, Math.abs(x[j]!));
    const plus = [...x];
    const minus = [...x];
    plus[j] = plus[j]! + h;
    minus[j] = minus[j]! - h;
    const a = fn(plus);
    const b = fn(minus);
    for (let i = 0; i < rows; i++) jacobian[i]![j] = (a[i]! - b[i]!) / (2 * h);
  }
  return jacobian;
}
function _independentRows(jacobian: number[][]): number[] {
  const selected: number[] = [];
  const rows: number[][] = [];
  for (let i = 0; i < jacobian.length; i++) {
    if (matrixRank([...rows, jacobian[i]!]) > rows.length) {
      rows.push(jacobian[i]!);
      selected.push(i);
    }
  }
  return selected;
}
export function levenbergMarquardt(
  problem: LeastSquaresProblem,
  initial: number[],
  maxIterations = 120,
): LeastSquaresResult {
  if (
    !Number.isInteger(maxIterations) ||
    maxIterations <= 0 ||
    !initial.every(Number.isFinite)
  )
    throw new Error('Invalid optimizer inputs.');
  if (!(problem.feasible?.(initial) ?? true))
    throw new Error(
      'Initial geometry violates feasibility constraints; check room shapes and opening bounds.',
    );
  const hard = problem.hardResiduals ?? (() => []);
  let x = [...initial];
  let residuals = problem.residuals(x);
  let cost = squaredNorm(residuals);
  if (!Number.isFinite(cost))
    throw new Error('Initial residuals must be finite.');
  let damping = INITIAL_DAMPING;
  let converged = false;
  let iterations = 0;
  for (; iterations < maxIterations; iterations++) {
    const jacobian = numericJacobian(problem.residuals, x);
    const hardValues = hard(x);
    const hardJacobian = numericJacobian(hard, x);
    const selected = _independentRows(hardJacobian);
    const n = x.length;
    const normal = Array.from({ length: n }, () => Array<number>(n).fill(0));
    const gradient = Array<number>(n).fill(0);
    for (let row = 0; row < jacobian.length; row++)
      for (let i = 0; i < n; i++) {
        gradient[i] = gradient[i]! + jacobian[row]![i]! * residuals[row]!;
        for (let j = 0; j < n; j++)
          normal[i]![j] =
            normal[i]![j]! + jacobian[row]![i]! * jacobian[row]![j]!;
      }
    let accepted = false;
    for (let trial = 0; trial < 16; trial++) {
      // KKT rows enforce hard constraints separately from weighted residuals.
      const system = Array.from({ length: n + selected.length }, () =>
        Array<number>(n + selected.length).fill(0),
      );
      const rhs = [
        ...gradient.map((value) => -value),
        ...selected.map((i) => -hardValues[i]!),
      ];
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++)
          system[i]![j] =
            normal[i]![j]! +
            (i === j ? damping * Math.max(1, normal[i]![i]!) : 0);
      selected.forEach((row, k) => {
        for (let j = 0; j < n; j++) {
          system[n + k]![j] = hardJacobian[row]![j]!;
          system[j]![n + k] = hardJacobian[row]![j]!;
        }
      });
      const solution = solveLinear(system, rhs);
      if (!solution) {
        damping *= 10;
        continue;
      }
      const step = solution.slice(0, n);
      const candidate = x.map((value, i) => value + step[i]!);
      if (!(problem.feasible?.(candidate) ?? true)) {
        damping *= 10;
        continue;
      }
      const nextResiduals = problem.residuals(candidate);
      const nextCost = squaredNorm(nextResiduals);
      const nextHard = hard(candidate);
      const hardError = Math.max(0, ...nextHard.map(Math.abs));
      const penalty = Math.max(
        1e4,
        ...solution.slice(n).map((value) => 2 * Math.abs(value)),
      );
      const merit =
        cost +
        penalty * hardValues.reduce((sum, value) => sum + Math.abs(value), 0);
      const nextMerit =
        nextCost +
        penalty * nextHard.reduce((sum, value) => sum + Math.abs(value), 0);
      if (Number.isFinite(nextCost) && nextMerit <= merit + 1e-12) {
        const improvement = Math.abs(cost - nextCost);
        x = candidate;
        residuals = nextResiduals;
        cost = nextCost;
        accepted = true;
        damping = Math.max(1e-12, damping / 3);
        const stationarity = Math.max(
          0,
          ...gradient.map((value, i) => {
            const lagrangian =
              value +
              selected.reduce(
                (sum, row, k) =>
                  sum + hardJacobian[row]![i]! * solution[n + k]!,
                0,
              );
            return (
              Math.abs(lagrangian) / Math.sqrt(Math.max(1, normal[i]![i]!))
            );
          }),
        );
        converged =
          hardError < HARD_TOLERANCE &&
          stationarity < 1e-5 &&
          (Math.sqrt(squaredNorm(step)) <
            1e-9 * (1 + Math.sqrt(squaredNorm(x))) ||
            improvement < 1e-12 * (1 + cost));
        break;
      }
      damping *= 10;
    }
    if (converged || !accepted) break;
  }
  return {
    x,
    iterations: Math.min(iterations + 1, maxIterations),
    converged,
    cost,
    hardError: Math.max(0, ...hard(x).map(Math.abs)),
  };
}
