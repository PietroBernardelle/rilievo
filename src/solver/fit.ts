import { roomPoints, signedArea } from '../model/geometry';
import { validateProject } from '../model/json';
import { createProject } from '../model/project';
import type { Block, Constraint } from '../model/types';
import { measurementResiduals, roomRigidity } from './diagnostics';
import type { MeasurementResidual, RoomRigidity } from './diagnostics';
import { levenbergMarquardt } from './lm';
import { squaredNorm } from './linear';
import { createFitProblem } from './problem';

export const DEFAULT_TOLERANCE = 0.015;
export const DEFAULT_MAX_ITERATIONS = 120;
export interface FitOptions {
  tolerance?: number;
  maxIterations?: number;
}
export interface FitResult {
  block: Block;
  residuals: MeasurementResidual[];
  rooms: RoomRigidity[];
  rms: number;
  worstMeasurementId: string | null;
  generatedConstraints: Constraint[];
  deferredMeasurementIds: string[];
  iterations: number;
  converged: boolean;
  hardError: number;
}
export function fit(block: Block, options: FitOptions = {}): FitResult {
  const tolerance = options.tolerance ?? DEFAULT_TOLERANCE;
  const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  if (
    !Number.isFinite(tolerance) ||
    tolerance <= 0 ||
    !Number.isInteger(maxIterations) ||
    maxIterations <= 0
  )
    throw new Error('Tolerance and iteration limit must be positive.');
  validateProject({
    ...createProject('2000-01-01T00:00:00Z'),
    blocks: [block],
  });
  for (const room of block.rooms)
    if (
      signedArea(roomPoints(block, room, false)) <= 0 ||
      signedArea(roomPoints(block, room)) <= 0
    )
      throw new Error(`Room ${room.id} must be CCW before fitting.`);
  for (const constraint of block.constraints)
    if (
      !['perpendicular', 'parallel', 'collinear'].includes(constraint.kind) ||
      constraint.edges.length !== 2
    )
      throw new Error(
        `Unsupported constraint ${constraint.kind}; expected two edges.`,
      );
  if (
    !block.rooms.length &&
    (block.vertices.length || block.openings.length || block.joins.length)
  )
    throw new Error('A fit with geometry requires at least one room.');
  let fitted = block;
  let iterations = 0;
  let converged = true;
  let hardError = 0;
  let generatedConstraints: Constraint[] = [];
  if (block.rooms.length) {
    const problem = createFitProblem(block);
    const optimized = levenbergMarquardt(
      problem,
      problem.initial,
      maxIterations,
    );
    fitted = problem.decode(optimized.x);
    iterations = optimized.iterations;
    converged = optimized.converged;
    hardError = optimized.hardError;
    generatedConstraints = problem.generatedConstraints;
  }
  const residuals = measurementResiduals(fitted, tolerance);
  const worst = residuals.reduce<MeasurementResidual | null>(
    (best, item) =>
      !best || Math.abs(item.normalized) > Math.abs(best.normalized)
        ? item
        : best,
    null,
  );
  return {
    block: fitted,
    residuals,
    rooms: fitted.rooms.map((room) => roomRigidity(fitted, room)),
    rms: residuals.length
      ? Math.sqrt(
          squaredNorm(residuals.map((item) => item.normalized)) /
            residuals.length,
        )
      : 0,
    worstMeasurementId: worst?.id ?? null,
    generatedConstraints,
    deferredMeasurementIds: block.measurements
      .filter(
        (item) =>
          item.kind === 'height' &&
          item.status === 'done' &&
          item.value !== null,
      )
      .map((item) => item.id),
    iterations,
    converged,
    hardError,
  };
}
export interface LeaveOneOutResult {
  omittedId: string;
  rms: number;
  maxResidual: number;
  converged: boolean;
}
export function leaveOneOut(
  block: Block,
  options: FitOptions = {},
): LeaveOneOutResult[] {
  return block.measurements
    .filter(
      (item) =>
        item.status === 'done' && item.value !== null && item.kind !== 'height',
    )
    .map((measurement) => {
      const result = fit(
        {
          ...block,
          measurements: block.measurements.map((item) =>
            item.id === measurement.id ? { ...item, status: 'rejected' } : item,
          ),
        },
        options,
      );
      return {
        omittedId: measurement.id,
        rms: result.rms,
        maxResidual: Math.max(
          0,
          ...result.residuals.map((item) => Math.abs(item.residual)),
        ),
        converged: result.converged,
      };
    })
    .sort((a, b) => a.rms - b.rms);
}
