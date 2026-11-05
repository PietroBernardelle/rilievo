import { roomPoints, signedArea } from '../model/geometry';
import { validateProject } from '../model/json';
import { createProject } from '../model/project';
import type { Block, Constraint } from '../model/types';
import { consistencyDiagnostics } from './diagnostics';
import type {
  MeasurementResidual,
  RoomDiagnostics,
  GroupDiagnostics,
  MeasurementSuspect,
} from './diagnostics';
import { roomSubBlock } from './components';
import { activeMeasurements } from './observations';
import { solveGeometry } from './solve';
import { squaredNorm } from './linear';

export const DEFAULT_TOLERANCE = 0.015;
export const DEFAULT_MAX_ITERATIONS = 120;
export interface FitOptions {
  tolerance?: number;
  maxIterations?: number;
}
export interface FitResult {
  block: Block;
  residuals: MeasurementResidual[];
  rooms: RoomDiagnostics[];
  groups: GroupDiagnostics[];
  suspectMeasurements: MeasurementSuspect[];
  probableWrongMeasurementId: string | null;
  rms: number;
  worstMeasurementId: string | null;
  generatedConstraints: Constraint[];
  deferredMeasurementIds: string[];
  iterations: number;
  converged: boolean;
  hardError: number;
}
function _validate(
  block: Block,
  options: FitOptions,
): { tolerance: number; maxIterations: number } {
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
  return { tolerance, maxIterations };
}
export function fit(block: Block, options: FitOptions = {}): FitResult {
  const { tolerance, maxIterations } = _validate(block, options);
  const geometry = solveGeometry(block, maxIterations);
  const diagnostics = consistencyDiagnostics(geometry.block, tolerance);
  const badGroups = diagnostics.groups.filter(
    (group) =>
      !group.consistent ||
      diagnostics.rooms.some(
        (room) => group.roomIds.includes(room.roomId) && !room.consistent,
      ),
  );
  for (const group of badGroups) {
    // With only one closure condition, removing a checked row destroys the check.
    if (!geometry.converged || group.redundancy <= 1) continue;
    const trials = _leaveOneOut(
      roomSubBlock(block, group.roomIds),
      tolerance,
      maxIterations,
    );
    const compatible = trials.filter((trial) => trial.consistent);
    if (
      compatible.length !== 1 ||
      !trials.every((trial) => trial.converged) ||
      compatible[0]!.redundancy <= 0
    )
      continue;
    group.probableWrongMeasurementId = compatible[0]!.omittedId;
    for (const room of diagnostics.rooms)
      if (
        group.roomIds.includes(room.roomId) &&
        room.suspectMeasurements.some(
          (item) => item.id === compatible[0]!.omittedId,
        )
      )
        room.probableWrongMeasurementId = compatible[0]!.omittedId;
  }
  const suspects = new Map<string, MeasurementSuspect>();
  for (const scope of [...diagnostics.rooms, ...diagnostics.groups])
    for (const item of scope.suspectMeasurements) {
      const previous = suspects.get(item.id);
      if (
        !previous ||
        Math.abs(item.standardizedResidual) >
          Math.abs(previous.standardizedResidual)
      )
        suspects.set(item.id, item);
    }
  const suspectMeasurements = [...suspects.values()].sort(
    (a, b) =>
      Math.abs(b.standardizedResidual) - Math.abs(a.standardizedResidual),
  );
  const probableWrongMeasurementId =
    badGroups.length === 1 ? badGroups[0]!.probableWrongMeasurementId : null;
  return {
    ...geometry,
    ...diagnostics,
    suspectMeasurements,
    probableWrongMeasurementId,
    // Compatibility alias; it no longer turns the largest residual into an accusation.
    worstMeasurementId: probableWrongMeasurementId,
    rms: diagnostics.residuals.length
      ? Math.sqrt(
          squaredNorm(diagnostics.residuals.map((item) => item.normalized)) /
            diagnostics.residuals.length,
        )
      : 0,
    deferredMeasurementIds: block.measurements
      .filter(
        (item) =>
          item.kind === 'height' &&
          item.status === 'done' &&
          item.value !== null,
      )
      .map((item) => item.id),
  };
}
export interface LeaveOneOutResult {
  omittedId: string;
  rms: number;
  maxResidual: number;
  converged: boolean;
  consistent: boolean;
  redundancy: number;
}
function _leaveOneOut(
  block: Block,
  tolerance: number,
  maxIterations: number,
): LeaveOneOutResult[] {
  return activeMeasurements(block)
    .map((measurement) => {
      const omitted = {
        ...block,
        measurements: block.measurements.map((item) =>
          item.id === measurement.id
            ? { ...item, status: 'rejected' as const }
            : item,
        ),
      };
      const geometry = solveGeometry(omitted, maxIterations);
      const diagnostics = consistencyDiagnostics(geometry.block, tolerance);
      return {
        omittedId: measurement.id,
        rms: diagnostics.residuals.length
          ? Math.sqrt(
              squaredNorm(
                diagnostics.residuals.map((item) => item.normalized),
              ) / diagnostics.residuals.length,
            )
          : 0,
        maxResidual: Math.max(
          0,
          ...diagnostics.residuals.map((item) => Math.abs(item.residual)),
        ),
        converged: geometry.converged,
        consistent:
          diagnostics.rooms.every((room) => room.consistent) &&
          diagnostics.groups.every((group) => group.consistent),
        redundancy: diagnostics.groups.reduce(
          (sum, group) => sum + group.redundancy,
          0,
        ),
      };
    })
    .sort((a, b) => a.rms - b.rms);
}
export function leaveOneOut(
  block: Block,
  options: FitOptions = {},
): LeaveOneOutResult[] {
  const { tolerance, maxIterations } = _validate(block, options);
  return _leaveOneOut(block, tolerance, maxIterations);
}
