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
}
export interface RoomRigidity {
  roomId: string;
  rank: number;
  required: number;
  rigid: boolean;
  nextMeasurement: { a: PointRef; b: PointRef } | null;
}
export function measurementResiduals(
  block: Block,
  tolerance: number,
): MeasurementResidual[] {
  return block.measurements
    .filter(
      (item) =>
        item.status === 'done' && item.value !== null && item.kind !== 'height',
    )
    .map((measurement) => {
      const fitted = distance(
        resolvePoint(block, measurement.a),
        resolvePoint(block, measurement.b),
      );
      const residual = fitted - measurement.value!;
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
      };
    });
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
  if (rank < required) {
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
      if (constraintsOnVertices([...jacobian, row]) > rank) {
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
