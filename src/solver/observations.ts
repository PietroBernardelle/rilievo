import { distance } from '../model/geometry';
import type { Block, Measurement } from '../model/types';
import { resolvePoint } from './geometry';
import { numericJacobian } from './lm';

export function fittedWidthIds(block: Block): Set<string> {
  const sides = new Map<string, Set<number>>();
  for (const item of activeMeasurements(block))
    for (const ref of [item.a, item.b]) {
      if (!('jamb' in ref)) continue;
      if (!sides.has(ref.jamb)) sides.set(ref.jamb, new Set());
      sides.get(ref.jamb)!.add(ref.side);
    }
  const ids = new Set(
    [...sides].filter(([, values]) => values.size === 2).map(([id]) => id),
  );
  for (const join of block.joins)
    if (join.pairedWith && (ids.has(join.via) || ids.has(join.pairedWith))) {
      ids.add(join.via);
      ids.add(join.pairedWith);
    }
  return ids;
}

export function activeMeasurements(block: Block): Measurement[] {
  return block.measurements.filter(
    (item) =>
      item.status === 'done' &&
      item.value !== null &&
      item.kind !== 'height' &&
      !item.target,
  );
}
export function measurementJacobian(
  block: Block,
  measurements: Measurement[] = activeMeasurements(block),
): number[][] {
  if (!measurements.length) return [];
  const coordinateCount = 2 * block.vertices.length;
  const fittedWidths = fittedWidthIds(block);
  const initial = [
    ...block.vertices.flatMap((vertex) => [vertex.x, vertex.y]),
    ...block.openings.flatMap((opening) => [opening.offset, opening.width]),
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
        offset: x[coordinateCount + 2 * i]!,
        width: fittedWidths.has(opening.id)
          ? x[coordinateCount + 2 * i + 1]!
          : opening.width,
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
