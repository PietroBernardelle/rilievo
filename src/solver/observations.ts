import { distance } from '../model/geometry';
import type { Block, Measurement } from '../model/types';
import { resolvePoint } from './geometry';
import { numericJacobian } from './lm';

export function activeMeasurements(block: Block): Measurement[] {
  return block.measurements.filter(
    (item) =>
      item.status === 'done' && item.value !== null && item.kind !== 'height',
  );
}
export function measurementJacobian(
  block: Block,
  measurements: Measurement[] = activeMeasurements(block),
): number[][] {
  if (!measurements.length) return [];
  const coordinateCount = 2 * block.vertices.length;
  const initial = [
    ...block.vertices.flatMap((vertex) => [vertex.x, vertex.y]),
    ...block.openings.map((opening) => opening.offset),
  ];
  return numericJacobian((x) => {
    const current = {
      ...block,
      vertices: block.vertices.map((vertex, i) => ({
        ...vertex,
        x: x[2 * i]!,
        y: x[2 * i + 1]!,
      })),
      openings: block.openings.map((opening, i) => ({
        ...opening,
        offset: x[coordinateCount + i]!,
      })),
    };
    return measurements.map(
      (measurement) =>
        distance(
          resolvePoint(current, measurement.a),
          resolvePoint(current, measurement.b),
        ) / measurement.sigma,
    );
  }, initial);
}
