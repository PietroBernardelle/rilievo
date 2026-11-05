import { describe, expect, it } from 'vitest';
import { createProject, createRoom } from '../model/project';
import { rectanglePoints, snapPoint } from './snapping';
import {
  fitView,
  INITIAL_VIEW,
  labelStep,
  MAX_SCALE,
  toScreen,
  toWorld,
  zoomAt,
} from './viewport';
const block = createRoom(
  createProject('2026-11-05T10:00:00Z'),
  null,
  rectanglePoints({ x: 0, y: 0 }, { x: 4, y: 3 }),
  2.7,
).project.blocks[0]!;
describe('snapping', () => {
  it('prioritizes corners, then edges, then grid, using a screen-space radius', () => {
    expect(snapPoint({ x: 0.04, y: 0.02 }, block, 80, false)).toMatchObject({
      kind: 'corner',
      point: { x: 0, y: 0 },
    });
    expect(snapPoint({ x: 2.035, y: 0.02 }, block, 80, false)).toMatchObject({
      kind: 'edge',
      point: { x: 2.035, y: 0 },
    });
    expect(snapPoint({ x: 2.035, y: 1.23 }, block, 80, false)).toMatchObject({
      kind: 'grid',
    });
    expect(
      snapPoint({ x: 2.035, y: 1.23 }, block, 80, false)!.point.y,
    ).toBeCloseTo(1.2);
    expect(snapPoint({ x: 0.04, y: 0.02 }, block, 1000, false)!.kind).toBe(
      'grid',
    );
  });
  it('disables all snapping with Shift and excludes the moving corner and adjacent edges', () => {
    expect(snapPoint({ x: 0.04, y: 0.02 }, block, 80, true)).toBeNull();
    expect(snapPoint({ x: 0.04, y: 0.02 }, block, 80, false, 'v1')!.kind).toBe(
      'grid',
    );
    expect(
      snapPoint({ x: 9.04, y: 9.02 }, undefined, 80, false, undefined, [
        { x: 9, y: 9 },
      ])!.kind,
    ).toBe('corner');
  });
});
describe('viewport', () => {
  it('keeps the world point under the cursor fixed while zooming, including clamped zoom', () => {
    const cursor = { x: 300, y: 220 };
    const point = toWorld(cursor, INITIAL_VIEW);
    for (const factor of [0.5, 2, 100000]) {
      const view = zoomAt(INITIAL_VIEW, cursor, factor);
      expect(toScreen(point, view).x).toBeCloseTo(cursor.x);
      expect(toScreen(point, view).y).toBeCloseTo(cursor.y);
      expect(view.scale).toBeLessThanOrEqual(MAX_SCALE);
    }
  });
  it('fits all geometry with margins and uses useful label intervals at every zoom', () => {
    const view = fitView(block.vertices, 800, 600);
    for (const vertex of block.vertices) {
      const screen = toScreen(vertex, view);
      expect(screen.x).toBeGreaterThanOrEqual(59);
      expect(screen.x).toBeLessThanOrEqual(741);
      expect(screen.y).toBeGreaterThanOrEqual(59);
      expect(screen.y).toBeLessThanOrEqual(541);
    }
    expect(fitView([], 800, 600).y).toBe(520);
    for (const scale of [0.1, 1, 20, 80, 2000])
      expect(labelStep(scale) * scale).toBeGreaterThanOrEqual(90);
  });
});
