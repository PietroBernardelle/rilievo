import {
  distance,
  nearestOnSegment,
  roundPoint,
  roomPoints,
} from '../model/geometry';
import type { Block, Point } from '../model/types';
export const GRID_STEP = 0.1;
export const SNAP_RADIUS = 10;
export interface SnapTarget {
  point: Point;
  kind: 'corner' | 'edge' | 'grid';
}
export function snapPoint(
  point: Point,
  block: Block | undefined,
  scale: number,
  disabled: boolean,
  excludeVertexId?: string,
  draft: Point[] = [],
): SnapTarget | null {
  if (disabled) return null;
  const radius = SNAP_RADIUS / scale;
  const corners = [
    ...(block?.vertices.filter((vertex) => vertex.id !== excludeVertexId) ??
      []),
    ...draft,
  ];
  let best: Point | undefined;
  let nearest = radius;
  for (const corner of corners) {
    const d = distance(point, corner);
    if (d <= nearest) {
      nearest = d;
      best = corner;
    }
  }
  if (best) return { point: roundPoint(best), kind: 'corner' };
  for (const room of block?.rooms ?? []) {
    const points = roomPoints(block!, room, false);
    for (let i = 0; i < points.length; i++) {
      if (
        room.vertexIds[i] === excludeVertexId ||
        room.vertexIds[(i + 1) % points.length] === excludeVertexId
      )
        continue;
      const projected = nearestOnSegment(
        point,
        points[i]!,
        points[(i + 1) % points.length]!,
      );
      const d = distance(point, projected);
      if (d <= nearest) {
        nearest = d;
        best = projected;
      }
    }
  }
  if (best) return { point: roundPoint(best), kind: 'edge' };
  return {
    point: roundPoint({
      x: Math.round(point.x / GRID_STEP) * GRID_STEP,
      y: Math.round(point.y / GRID_STEP) * GRID_STEP,
    }),
    kind: 'grid',
  };
}
export function rectanglePoints(a: Point, b: Point): Point[] {
  return [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];
}
