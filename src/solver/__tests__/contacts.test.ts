import { describe, expect, it } from 'vitest';
import { distance, roomPoints } from '../../model/geometry';
import { createProject, createRoom } from '../../model/project';
import { loadProject, saveProject } from '../../model/json';
import type { Block } from '../../model/types';
import { connectedRoomGroups } from '../components';
import { measuredRoomIds, sketchContacts } from '../contacts';
import { fit } from '../fit';
import { resolvePoint } from '../geometry';
import { measurement, rectangleMeasurements } from './fixtures';

function rectangles(shapes: [number, number, number, number][]): Block {
  let project = createProject('2026-11-05T10:00:00Z');
  for (const [x, y, width, height] of shapes) {
    project = createRoom(
      project,
      project.blocks[0]?.id ?? null,
      [
        { x, y },
        { x: x + width, y },
        { x: x + width, y: y + height },
        { x, y: y + height },
      ],
      2.7,
    ).project;
  }
  return project.blocks[0]!;
}
function measureRoom(
  block: Block,
  index: number,
  width: number,
  height: number,
): void {
  const room = block.rooms[index]!;
  block.measurements.push(
    ...rectangleMeasurements(room.vertexIds, width, height, `${room.id}-`),
  );
}
function attachmentGaps(block: Block): number[] {
  return sketchContacts(block).map((contact) =>
    distance(resolvePoint(block, contact.a), resolvePoint(block, contact.b)),
  );
}

describe('sketch contact detection', () => {
  it('uses sketch coordinates, includes the 1 mm boundary, and avoids duplicate corner/edge contacts', () => {
    const block = rectangles([
      [0, 0, 5, 3],
      [5.001, 0, 2, 3],
    ]);
    const original = JSON.stringify(block);
    expect(sketchContacts(block)).toEqual([
      { roomIds: ['r1', 'r2'], a: { vertex: 'v2' }, b: { vertex: 'v5' } },
      { roomIds: ['r1', 'r2'], a: { vertex: 'v3' }, b: { vertex: 'v8' } },
    ]);
    expect(JSON.stringify(block)).toBe(original);
    for (const vertex of block.vertices.slice(4)) vertex.x += 10;
    expect(sketchContacts(block)).toHaveLength(2);
    const separate = rectangles([
      [0, 0, 5, 3],
      [5.0011, 0, 2, 3],
    ]);
    for (const vertex of separate.vertices.slice(4)) vertex.x -= 0.0011;
    expect(sketchContacts(separate)).toEqual([]);
  });
  it('retains the sketch fraction on an edge, including after fitting', () => {
    const block = rectangles([
      [0, 0, 5, 3],
      [5, 0.5, 2, 2],
    ]);
    const contacts = sketchContacts(block);
    expect(contacts).toHaveLength(2);
    expect(contacts[0]).toMatchObject({
      a: { vertex: 'v5' },
      b: { edgePoint: ['r1', 1] },
    });
    expect(contacts[1]).toMatchObject({
      a: { vertex: 'v8' },
      b: { edgePoint: ['r1', 1] },
    });
    expect('edgePoint' in contacts[0]!.b && contacts[0]!.b.t).toBeCloseTo(
      1 / 6,
      12,
    );
    measureRoom(block, 0, 4.95, 3);
    const result = fit(block);
    expect(result.converged).toBe(true);
    expect(sketchContacts(result.block)).toEqual(contacts);
    const points = roomPoints(result.block, block.rooms[1]!, false);
    expect(points[0]!.x).toBeCloseTo(4.95, 3);
    expect(distance(points[0]!, points[1]!)).toBeCloseTo(2, 3);
    expect(Math.max(...attachmentGaps(result.block))).toBeLessThan(0.001);
  });
  it('uses done status on either endpoint; queued/skipped/rejected records do not release contacts', () => {
    const block = rectangles([
      [0, 0, 5, 3],
      [5, 0, 2, 3],
    ]);
    measureRoom(block, 0, 5, 3);
    const item = measurement(
      'second',
      { edgePoint: ['r2', 0], t: 0.5 },
      { vertex: 'v6' },
      1,
    );
    for (const status of ['queued', 'skipped', 'rejected'] as const) {
      block.measurements.push({ ...item, status });
      expect([...measuredRoomIds(block)]).toEqual(['r1']);
      expect(sketchContacts(block)).toHaveLength(2);
      block.measurements.pop();
    }
    block.measurements.push(item);
    expect(sketchContacts(block)).toEqual([]);
    expect(connectedRoomGroups(block)).toEqual([['r1'], ['r2']]);
    block.measurements = [
      measurement('cross', { vertex: 'v1' }, { vertex: 'v5' }, 5),
    ];
    expect([...measuredRoomIds(block)]).toEqual(['r1', 'r2']);
    expect(sketchContacts(block)).toEqual([]);
    expect(connectedRoomGroups(block)).toEqual([['r1', 'r2']]);
  });
});

describe('M3.1 attached rooms', () => {
  it('moves the attached unmeasured room 50 mm left while retaining its sketched width', () => {
    const block = rectangles([
      [0, 0, 5, 3],
      [5, 0, 2, 3],
    ]);
    measureRoom(block, 0, 4.95, 3);
    const original = JSON.stringify(block);
    const result = fit(block);
    expect(result.converged).toBe(true);
    expect(result.groups[0]!.roomIds).toEqual(['r1', 'r2']);
    const points = roomPoints(result.block, block.rooms[1]!, false);
    expect(points[0]!.x - 5).toBeCloseTo(-0.05, 3);
    expect(points[1]!.x - 7).toBeCloseTo(-0.05, 3);
    expect(distance(points[0]!, points[1]!)).toBeCloseTo(2, 3);
    expect(distance(points[1]!, points[2]!)).toBeCloseTo(3, 3);
    expect(Math.max(...attachmentGaps(result.block))).toBeLessThan(0.001);
    expect(result.block.vertices[0]).toMatchObject({ x: 0, y: 0 });
    expect(result.block.vertices[1]!.y).toBe(0);
    expect(result.rooms[1]).toMatchObject({
      rigid: false,
      rank: 0,
      measurementCount: 0,
      redundancy: 0,
      pValue: null,
    });
    expect(result.groups[0]!.redundancy).toBe(0);
    expect(JSON.stringify(block)).toBe(original);
    expect(result.block.vertices.map((vertex) => vertex.sketch)).toEqual(
      block.vertices.map((vertex) => vertex.sketch),
    );
  });
  it('lets measured neighbours shift while keeping the unmeasured middle room attached to both', () => {
    const block = rectangles([
      [0, 0, 5, 3],
      [5, 0, 2, 3],
      [7, 0, 3, 3],
    ]);
    measureRoom(block, 0, 4.95, 3);
    measureRoom(block, 2, 3, 3);
    const result = fit(block);
    expect(result.converged).toBe(true);
    expect(result.groups[0]!.roomIds).toEqual(['r1', 'r2', 'r3']);
    expect(Math.max(...attachmentGaps(result.block))).toBeLessThan(0.001);
    const middle = roomPoints(result.block, block.rooms[1]!, false);
    const right = roomPoints(result.block, block.rooms[2]!, false);
    expect(right[0]!.x).toBeLessThan(6.96);
    expect(Math.abs(distance(middle[0]!, middle[1]!) - 2)).toBeLessThan(0.002);
    expect(distance(right[0]!, right[1]!)).toBeCloseTo(3, 3);
  });
  it('stretches an unmeasured middle room when measured distances fix the available space', () => {
    const block = rectangles([
      [0, 0, 5, 3],
      [5, 0, 2, 3],
      [7, 0, 3, 3],
    ]);
    measureRoom(block, 0, 4.95, 3);
    measureRoom(block, 2, 3, 3);
    block.measurements.push(
      measurement('position-x', { vertex: 'v1' }, { vertex: 'v9' }, 7),
      measurement(
        'position-y',
        { vertex: 'v4' },
        { vertex: 'v9' },
        Math.hypot(7, 3),
      ),
      measurement(
        'orientation',
        { vertex: 'v1' },
        { vertex: 'v12' },
        Math.hypot(7, 3),
      ),
    );
    const result = fit(block);
    expect(result.converged).toBe(true);
    const middle = roomPoints(result.block, block.rooms[1]!, false);
    expect(Math.abs(distance(middle[0]!, middle[1]!) - 2.05)).toBeLessThan(
      0.001,
    );
    expect(Math.abs(distance(middle[2]!, middle[3]!) - 2.05)).toBeLessThan(
      0.001,
    );
    expect(Math.max(...attachmentGaps(result.block))).toBeLessThan(0.001);
    expect(
      result.residuals.every((item) => Math.abs(item.residual) < 0.001),
    ).toBe(true);
  });
  it('ignores contacts once both rooms have readings and fits their own measurements independently', () => {
    const block = rectangles([
      [0, 0, 5, 3],
      [5, 0, 2, 3],
    ]);
    measureRoom(block, 0, 4.95, 3);
    measureRoom(block, 1, 2.05, 3);
    const result = fit(block);
    expect(result.converged).toBe(true);
    expect(result.groups.map((group) => group.roomIds)).toEqual([
      ['r1'],
      ['r2'],
    ]);
    const a = roomPoints(result.block, block.rooms[0]!, false);
    const b = roomPoints(result.block, block.rooms[1]!, false);
    expect(a[1]!.x).toBeCloseTo(4.95, 3);
    expect(b[0]!.x).toBe(5);
    expect(distance(b[0]!, b[1]!)).toBeCloseTo(2.05, 3);
    expect(sketchContacts(result.block)).toEqual([]);
  });
  it('leaves a room without contacts or joins in place', () => {
    const block = rectangles([
      [0, 0, 5, 3],
      [5, 0, 2, 3],
      [10, 1, 2, 3],
    ]);
    measureRoom(block, 0, 4.95, 3);
    const result = fit(block);
    expect(result.converged).toBe(true);
    expect(result.groups.map((group) => group.roomIds)).toEqual([
      ['r1', 'r2'],
      ['r3'],
    ]);
    for (const vertex of result.block.vertices.slice(8)) {
      const original = block.vertices.find((item) => item.id === vertex.id)!;
      expect(vertex.x).toBeCloseTo(original.x, 10);
      expect(vertex.y).toBeCloseTo(original.y, 10);
    }
  });
  it('propagates along a chain, retains the global frame, and redetects contacts after a schema-1 round trip', () => {
    const block = rectangles([
      [0, 0, 5, 3],
      [5, 0, 2, 3],
      [7, 0, 2, 3],
    ]);
    for (const vertex of block.vertices) {
      const { x, y } = vertex;
      vertex.x = 10 - y;
      vertex.y = 20 + x;
      vertex.sketch = { x: vertex.x, y: vertex.y };
    }
    measureRoom(block, 0, 4.95, 3);
    const result = fit(block);
    expect(result.converged).toBe(true);
    expect(result.block.vertices[0]).toMatchObject({ x: 0, y: 0 });
    expect(result.block.vertices[1]!.y).toBe(0);
    expect(result.block.vertices[8]!.x).toBeCloseTo(6.95, 3);
    expect(
      distance(result.block.vertices[8]!, result.block.vertices[9]!),
    ).toBeCloseTo(2, 3);
    const repeated = fit(result.block);
    expect(repeated.converged).toBe(true);
    for (let i = 0; i < block.vertices.length; i++)
      expect(
        distance(repeated.block.vertices[i]!, result.block.vertices[i]!),
      ).toBeLessThan(1e-6);
    const project = {
      ...createProject('2026-11-05T10:00:00Z'),
      blocks: [result.block],
    };
    const restored = loadProject(saveProject(project));
    expect(restored.schemaVersion).toBe(1);
    expect(Object.keys(restored.blocks[0]!).sort()).toEqual(
      Object.keys(block).sort(),
    );
    expect(restored.blocks[0]!.constraints).toEqual(block.constraints);
    expect(restored.blocks[0]!.measurements).toEqual(block.measurements);
    expect(sketchContacts(restored.blocks[0]!)).toEqual(sketchContacts(block));
    expect(fit(restored.blocks[0]!).converged).toBe(true);
  });
});
