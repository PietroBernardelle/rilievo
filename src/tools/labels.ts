import { distance, signedArea } from '../model/geometry';
import type { Point } from '../model/types';
import { toScreen } from './viewport';
import type { Viewport } from './viewport';

const LABEL_CHARACTER_WIDTH = 6.6;
const LABEL_HEIGHT = 11;
const LABEL_GAP = 7;
const LABEL_END_MARGIN = 8;
export interface EdgeLabel {
  point: Point;
  text: string;
}
export function edgeLabels(
  points: Point[],
  view: Viewport,
  closed = true,
): EdgeLabel[] {
  const labels: EdgeLabel[] = [];
  const winding = signedArea(points) < 0 ? -1 : 1;
  for (let i = 0; i < points.length - (closed ? 0 : 1); i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const length = distance(a, b);
    const text = length.toFixed(3);
    const width = text.length * LABEL_CHARACTER_WIDTH;
    if (length * view.scale < width + LABEL_END_MARGIN * 2) continue;
    // Right normal in y-up world space, flipped vertically for SVG screen space.
    const normal = {
      x: (winding * (b.y - a.y)) / length,
      y: (winding * (b.x - a.x)) / length,
    };
    const offset =
      LABEL_GAP +
      (Math.abs(normal.x) * width) / 2 +
      (Math.abs(normal.y) * LABEL_HEIGHT) / 2;
    const start = toScreen(a, view);
    const end = toScreen(b, view);
    labels.push({
      text,
      point: {
        x: (start.x + end.x) / 2 + normal.x * offset,
        y: (start.y + end.y) / 2 + normal.y * offset,
      },
    });
  }
  return labels;
}
