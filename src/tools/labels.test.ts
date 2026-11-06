import { describe, expect, it } from 'vitest';
import { labelsOverlap, layoutEdgeLabels } from './labels';
import { rectanglePoints } from './snapping';

describe('plan-wide dimension labels', () => {
  it('keeps both shared-wall dimensions readable at different zooms, orientations and thicknesses', () => {
    for (const scale of [20, 50, 80, 200]) {
      for (const gap of [0, 0.15, 0.3, 0.4]) {
        for (const angle of [0, Math.PI / 2, Math.PI / 4]) {
          const groups = [
            [0, 4],
            [4 + gap, 7 + gap],
          ].map(([left, right]) => ({
            points: rectanglePoints(
              { x: left!, y: 0 },
              { x: right!, y: 3 },
            ).map((p) => ({
              x: Math.cos(angle) * p.x - Math.sin(angle) * p.y,
              y: Math.sin(angle) * p.x + Math.cos(angle) * p.y,
            })),
          }));
          const labels = layoutEdgeLabels(groups, {
            x: 100,
            y: 500,
            scale,
          }).flat();
          if (scale >= 50)
            expect(labels, `${scale} / ${gap} / ${angle}`).toHaveLength(8);
          else expect(labels.length).toBeGreaterThanOrEqual(6);
          for (let i = 0; i < labels.length; i++)
            for (let j = i + 1; j < labels.length; j++)
              expect(labelsOverlap(labels[i]!, labels[j]!)).toBe(false);
        }
      }
    }
  });
  it('handles live drafts together with stored rooms and hides crowded or short dimensions', () => {
    const points = rectanglePoints({ x: 0, y: 0 }, { x: 4, y: 3 });
    const labels = layoutEdgeLabels([{ points }, { points, closed: false }], {
      x: 0,
      y: 0,
      scale: 80,
    }).flat();
    expect(labels).toHaveLength(7);
    for (let i = 0; i < labels.length; i++)
      for (let j = i + 1; j < labels.length; j++)
        expect(labelsOverlap(labels[i]!, labels[j]!)).toBe(false);
    expect(layoutEdgeLabels([{ points }], { x: 0, y: 0, scale: 5 })).toEqual([
      [],
    ]);
    const crowded = layoutEdgeLabels(
      Array.from({ length: 20 }, () => ({ points })),
      { x: 0, y: 0, scale: 20 },
    ).flat();
    expect(crowded.length).toBeLessThan(80);
  });
});
