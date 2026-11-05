import { roomSubBlock, connectedRoomGroups } from './components';
import { activeMeasurements, measurementJacobian } from './observations';
import { chiSquareSurvival, measurementProjection } from './statistics';
import { distance } from '../model/geometry';
import type { Block, PointRef, Room } from '../model/types';
import { pointRoom, resolvePoint } from './geometry';
import { matrixRank } from './linear';
import { numericJacobian } from './lm';

export interface MeasurementResidual {
  id: string;
  measured: number;
  fitted: number;
  residual: number;
  normalized: number;
  sigma: number;
  flagged: boolean;
  redundancy: number;
  standardizedResidual: number | null;
  unchecked: boolean;
}
export interface RoomRigidity {
  roomId: string;
  rank: number;
  required: number;
  rigid: boolean;
  nextMeasurement: { a: PointRef; b: PointRef } | null;
}
export const CONSISTENCY_SIGNIFICANCE = 0.01;
export const REDUNDANCY_EPSILON = 1e-6;
export interface MeasurementSuspect {
  id: string;
  standardizedResidual: number;
  redundancy: number;
}
export interface ConsistencyTest {
  measurementCount: number;
  parameterRank: number;
  redundancy: number;
  chiSquare: number;
  pValue: number | null;
  consistent: boolean;
  suspectMeasurements: MeasurementSuspect[];
  probableWrongMeasurementId: string | null;
}
export interface RoomDiagnostics extends RoomRigidity, ConsistencyTest {}
export interface GroupDiagnostics extends ConsistencyTest {
  roomIds: string[];
}
export function measurementResiduals(
  block: Block,
  tolerance: number,
): MeasurementResidual[] {
  const measurements = activeMeasurements(block);
  const projection = measurementProjection(
    measurementJacobian(block, measurements),
  );
  return measurements.map((measurement, i) => {
    const fitted = distance(
      resolvePoint(block, measurement.a),
      resolvePoint(block, measurement.b),
    );
    const residual = fitted - measurement.value!;
    const redundancy =
      projection.redundancy[i]! < REDUNDANCY_EPSILON
        ? 0
        : projection.redundancy[i]!;
    return {
      id: measurement.id,
      measured: measurement.value!,
      fitted,
      residual,
      normalized: residual / measurement.sigma,
      sigma: measurement.sigma,
      flagged:
        Math.abs(residual) > tolerance ||
        Math.abs(residual) > 3 * measurement.sigma,
      redundancy,
      standardizedResidual:
        redundancy === 0
          ? null
          : residual / (measurement.sigma * Math.sqrt(redundancy)),
      unchecked: redundancy === 0,
    };
  });
}
export function consistencyTest(
  residuals: MeasurementResidual[],
): ConsistencyTest {
  const count = residuals.length;
  // trace(I - H) equals m - rank(J), including rank-deficient/opening problems.
  const redundancy = Math.round(
    residuals.reduce((sum, item) => sum + item.redundancy, 0),
  );
  const chiSquare = residuals.reduce(
    (sum, item) => sum + item.normalized ** 2,
    0,
  );
  const pValue =
    redundancy > 0 ? chiSquareSurvival(chiSquare, redundancy) : null;
  const consistent = pValue === null || pValue >= CONSISTENCY_SIGNIFICANCE;
  const suspectMeasurements: MeasurementSuspect[] = consistent
    ? []
    : residuals.flatMap((item) =>
        item.standardizedResidual === null
          ? []
          : [
              {
                id: item.id,
                standardizedResidual: item.standardizedResidual,
                redundancy: item.redundancy,
              },
            ],
      );
  suspectMeasurements.sort(
    (a, b) =>
      Math.abs(b.standardizedResidual) - Math.abs(a.standardizedResidual),
  );
  return {
    measurementCount: count,
    parameterRank: count - redundancy,
    redundancy,
    chiSquare,
    pValue,
    consistent,
    suspectMeasurements,
    probableWrongMeasurementId: null,
  };
}
export function consistencyDiagnostics(
  block: Block,
  tolerance: number,
): {
  residuals: MeasurementResidual[];
  rooms: RoomDiagnostics[];
  groups: GroupDiagnostics[];
} {
  const residuals: MeasurementResidual[] = [];
  const groups = connectedRoomGroups(block).map((roomIds) => {
    const local = measurementResiduals(roomSubBlock(block, roomIds), tolerance);
    residuals.push(...local);
    return { roomIds, ...consistencyTest(local) };
  });
  const rooms = block.rooms.map((room) => ({
    ...roomRigidity(block, room),
    ...consistencyTest(
      measurementResiduals(roomSubBlock(block, [room.id]), tolerance),
    ),
  }));
  const order = new Map(
    block.measurements.map((measurement, i) => [measurement.id, i]),
  );
  residuals.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  return { residuals, rooms, groups };
}
export function roomRigidity(block: Block, room: Room): RoomRigidity {
  const vertices = room.vertexIds.map((id) =>
    block.vertices.find((vertex) => vertex.id === id)!,
  );
  const openings = block.openings.filter(
    (opening) => opening.roomId === room.id,
  );
  const initial = [
    ...vertices.flatMap((vertex) => [vertex.x, vertex.y]),
    ...openings.map((opening) => opening.offset),
  ];
  const vertexColumns = vertices.length * 2;
  const measures = block.measurements.filter(
    (item) =>
      item.status === 'done' &&
      item.value !== null &&
      item.kind !== 'height' &&
      pointRoom(block, item.a) === room.id &&
      pointRoom(block, item.b) === room.id,
  );
  function decode(x: number[]): Block {
    const positions = new Map(
      vertices.map((vertex, i) => [
        vertex.id,
        { x: x[2 * i]!, y: x[2 * i + 1]! },
      ]),
    );
    const offsets = new Map(
      openings.map((opening, i) => [opening.id, x[vertexColumns + i]!]),
    );
    return {
      ...block,
      vertices: block.vertices.map((vertex) => ({
        ...vertex,
        ...positions.get(vertex.id),
      })),
      openings: block.openings.map((opening) => ({
        ...opening,
        offset: offsets.get(opening.id) ?? opening.offset,
      })),
    };
  }
  const jacobian = numericJacobian((x) => {
    const current = decode(x);
    return measures.map((measurement) =>
      distance(
        resolvePoint(current, measurement.a),
        resolvePoint(current, measurement.b),
      ),
    );
  }, initial);
  const constraintsOnVertices = (rows: number[][]): number =>
    matrixRank(rows) - matrixRank(rows.map((row) => row.slice(vertexColumns)));
  const rank = constraintsOnVertices(jacobian);
  const required = 2 * vertices.length - 3;
  let nextMeasurement: RoomRigidity['nextMeasurement'] = null;
  if (rank < required || measures.length === matrixRank(jacobian)) {
    const pairs: [number, number][] = [];
    for (let i = 0; i < vertices.length; i++)
      pairs.push([i, (i + 1) % vertices.length]);
    for (let i = 0; i < vertices.length; i++)
      for (let j = i + 2; j < vertices.length; j++)
        if (!(i === 0 && j === vertices.length - 1)) pairs.push([i, j]);
    for (const [i, j] of pairs) {
      const a = vertices[i]!.id;
      const b = vertices[j]!.id;
      const known = block.measurements.some(
        (m) =>
          'vertex' in m.a &&
          'vertex' in m.b &&
          ((m.a.vertex === a && m.b.vertex === b) ||
            (m.a.vertex === b && m.b.vertex === a)) &&
          m.status !== 'rejected',
      );
      if (known) continue;
      const row = numericJacobian(
        (x) => [
          Math.hypot(x[2 * i]! - x[2 * j]!, x[2 * i + 1]! - x[2 * j + 1]!),
        ],
        initial,
      )[0]!;
      if (
        rank >= required ||
        constraintsOnVertices([...jacobian, row]) > rank
      ) {
        nextMeasurement = { a: { vertex: a }, b: { vertex: b } };
        break;
      }
    }
  }
  return {
    roomId: room.id,
    rank,
    required,
    rigid: rank >= required,
    nextMeasurement,
  };
}
