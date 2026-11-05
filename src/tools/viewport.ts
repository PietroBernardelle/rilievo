import type { Point } from '../model/types';
export interface Viewport {
  x: number;
  y: number;
  scale: number;
}
export const INITIAL_VIEW: Viewport = { x: 80, y: 400, scale: 80 };
export const MIN_SCALE = 0.1;
export const MAX_SCALE = 2000;
export function toScreen(point: Point, view: Viewport): Point {
  return { x: view.x + point.x * view.scale, y: view.y - point.y * view.scale };
}
export function toWorld(point: Point, view: Viewport): Point {
  return {
    x: (point.x - view.x) / view.scale,
    y: (view.y - point.y) / view.scale,
  };
}
export function zoomAt(
  view: Viewport,
  cursor: Point,
  factor: number,
): Viewport {
  const point = toWorld(cursor, view);
  const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, view.scale * factor));
  return {
    x: cursor.x - point.x * scale,
    y: cursor.y + point.y * scale,
    scale,
  };
}
export function fitView(
  points: Point[],
  width: number,
  height: number,
): Viewport {
  if (!points.length) return { ...INITIAL_VIEW, y: height - 80 };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const scale = Math.max(
    MIN_SCALE,
    Math.min(
      MAX_SCALE,
      (width - 120) / Math.max(maxX - minX, 0.1),
      (height - 120) / Math.max(maxY - minY, 0.1),
    ),
  );
  return {
    x: width / 2 - ((minX + maxX) / 2) * scale,
    y: height / 2 + ((minY + maxY) / 2) * scale,
    scale,
  };
}
export function labelStep(scale: number): number {
  const target = 90 / scale;
  const power = 10 ** Math.floor(Math.log10(target));
  return [1, 2, 5, 10].find((multiple) => multiple * power >= target)! * power;
}
