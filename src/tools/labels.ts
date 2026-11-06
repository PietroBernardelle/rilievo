import { distance, signedArea } from '../model/geometry';
import type { Point } from '../model/types';
import { toScreen } from './viewport';
import type { Viewport } from './viewport';

const LABEL_CHARACTER_WIDTH = 6.6;
const LABEL_HEIGHT = 11;
const LABEL_GAP = 7;
const LABEL_END_MARGIN = 8;
export interface EdgeLabel {
  edge: number;
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
      edge: i,
      text,
      point: {
        x: (start.x + end.x) / 2 + normal.x * offset,
        y: (start.y + end.y) / 2 + normal.y * offset,
      },
    });
  }
  return labels;
}

export function labelsOverlap(a: EdgeLabel, b: EdgeLabel): boolean {
  return (
    Math.abs(a.point.x - b.point.x) <
      ((a.text.length + b.text.length) * LABEL_CHARACTER_WIDTH) / 2 + 6 &&
    Math.abs(a.point.y - b.point.y) < LABEL_HEIGHT + 6
  );
}

// Lay out the whole plan together. Slide collisions along their own edge,
// retaining the outward offset and hiding a label only when no position fits.
export function layoutEdgeLabels(
  groups: { points: Point[]; closed?: boolean }[],
  view: Viewport,
): EdgeLabel[][] {
  const placed: EdgeLabel[] = [];
  return groups.map(({ points, closed = true }) => {
    const result: EdgeLabel[] = [];
    for (const label of edgeLabels(points, view, closed)) {
      const a = toScreen(points[label.edge]!, view);
      const b = toScreen(points[(label.edge + 1) % points.length]!, view);
      const length = distance(a, b);
      const tangent = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
      const span =
        Math.abs(tangent.x) * label.text.length * LABEL_CHARACTER_WIDTH +
        Math.abs(tangent.y) * LABEL_HEIGHT;
      const limit = Math.max(0, (length - span) / 2 - LABEL_END_MARGIN);
      const step = LABEL_HEIGHT + 7;
      let position: EdgeLabel | undefined;
      for (let shift = 0; ; shift = Math.min(shift + step, limit)) {
        for (const sign of shift === 0 ? [1] : [1, -1]) {
          const candidate = {
            ...label,
            point: {
              x: label.point.x + tangent.x * shift * sign,
              y: label.point.y + tangent.y * shift * sign,
            },
          };
          if (!placed.some((other) => labelsOverlap(candidate, other))) {
            position = candidate;
            break;
          }
        }
        if (position || shift === limit) break;
      }
      if (position) {
        placed.push(position);
        result.push(position);
      }
    }
    return result;
  });
}
