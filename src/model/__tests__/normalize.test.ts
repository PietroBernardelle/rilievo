import { describe, expect, it } from 'vitest';
import { createProject, createRoom, moveCorner } from '../project';
import {
  distance,
  roundCoordinate,
  roundPoint,
  roomPoints,
  signedArea,
} from '../geometry';
import { loadProject, saveProject } from '../json';
import { normalizeBlock } from '../normalize';
function rectanglePoints(a: Point, b: Point): Point[] {
  return [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];
}
import type { Block, Point, PointRef } from '../types';

function project(points: Point[]) {
  return createRoom(createProject('2026-11-05T10:00:00Z'), null, points, 2.7)
    .project;
}
function resolve(block: Block, ref: PointRef): Point {
  if ('vertex' in ref)
    return block.vertices.find((vertex) => vertex.id === ref.vertex)!;
  const opening =
    'jamb' in ref
      ? block.openings.find((item) => item.id === ref.jamb)!
      : undefined;
  const [roomId, edge] =
    'edgePoint' in ref ? ref.edgePoint : [opening!.roomId, opening!.edge];
  const points = roomPoints(
    block,
    block.rooms.find((room) => room.id === roomId)!,
    false,
  );
  const a = points[edge]!;
  const b = points[(edge + 1) % points.length]!;
  const t =
    'edgePoint' in ref
      ? ref.t
      : (opening!.offset + ref.side * opening!.width) / distance(a, b);
  return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
}
describe('coordinate and winding convention', () => {
  it.each([
    [4, 3],
    [4, -3],
    [-4, 3],
    [-4, -3],
  ])('normalizes rectangles drawn toward (%s, %s) to CCW', (x, y) => {
    for (const [a, b] of [
      [
        { x: 0, y: 0 },
        { x, y },
      ],
      [
        { x, y },
        { x: 0, y: 0 },
      ],
    ]) {
      const block = project(rectanglePoints(a!, b!)).blocks[0]!;
      expect(signedArea(roomPoints(block, block.rooms[0]!))).toBe(12);
      expect(roomPoints(block, block.rooms[0]!)[0]).toEqual(a);
    }
  });
  it('normalizes a triangle flipped by a corner move', () => {
    const before = project([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 0, y: 2 },
    ]);
    const after = moveCorner(before, 'b1', 'v3', { x: 0, y: -2 });
    const block = after.blocks[0]!;
    expect(block.rooms[0]!.vertexIds).toEqual(['v1', 'v3', 'v2']);
    expect(signedArea(roomPoints(block, block.rooms[0]!))).toBe(2);
    expect(before.blocks[0]!.rooms[0]!.vertexIds).toEqual(['v1', 'v2', 'v3']);
  });
  it('normalizes loaded CW rooms without moving referenced edge points or jambs', () => {
    const before = project(rectanglePoints({ x: 0, y: 0 }, { x: 4, y: 3 }));
    const block = before.blocks[0]!;
    block.rooms[0]!.vertexIds = ['v1', 'v4', 'v3', 'v2'];
    block.walls = [{ roomId: 'r1', edge: 0, thickness: 0.3 }];
    block.openings = [
      {
        id: 'o1',
        roomId: 'r1',
        edge: 0,
        type: 'door',
        offset: 0.4,
        width: 0.8,
        height: 2.1,
        sill: 0,
      },
    ];
    block.constraints = [
      {
        kind: 'perpendicular',
        edges: [
          ['r1', 0],
          ['r1', 1],
        ],
        weight: 0.1,
      },
    ];
    block.joins = [
      { id: 'j1', a: ['r1', 0], b: ['r1', 2], thickness: 0.3, via: 'o1' },
    ];
    block.measurements = [
      {
        id: 'm1',
        kind: 'distance',
        a: { edgePoint: ['r1', 1], t: 0.2 },
        b: { jamb: 'o1', side: 0 },
        value: 1,
        sigma: 0.005,
        status: 'done',
        note: '',
      },
    ];
    const endpoints = [
      resolve(block, block.measurements[0]!.a),
      resolve(block, block.measurements[0]!.b),
    ];
    const loaded = loadProject(JSON.stringify(before));
    const next = loaded.blocks[0]!;
    expect(next.rooms[0]!.vertexIds).toEqual(['v1', 'v2', 'v3', 'v4']);
    expect(next.walls[0]!.edge).toBe(3);
    expect(next.openings[0]).toMatchObject({ edge: 3, offset: 1.8 });
    expect(next.constraints[0]!.edges).toEqual([
      ['r1', 3],
      ['r1', 2],
    ]);
    expect(next.joins[0]!.b).toEqual(['r1', 1]);
    const actual = [
      resolve(next, next.measurements[0]!.a),
      resolve(next, next.measurements[0]!.b),
    ];
    actual.forEach((point, i) =>
      expect(distance(point, endpoints[i]!)).toBeLessThan(1e-12),
    );
    expect(loadProject(saveProject(loaded))).toEqual(loaded);
  });
  it('rounds grid, edge, stored, loaded and manually moved coordinates to four decimal places', () => {
    expect(roundCoordinate(2.3000000000000003)).toBe(2.3);
    expect(roundPoint({ x: 1.23456, y: -2.34567 })).toEqual({
      x: 1.2346,
      y: -2.3457,
    });
    expect(Object.is(roundCoordinate(-0.00001), -0)).toBe(false);
    const before = project(
      rectanglePoints({ x: 0, y: 0 }, { x: 2.3000000000000003, y: 3.123456 }),
    );
    expect(before.blocks[0]!.vertices[2]!.sketch).toEqual({
      x: 2.3,
      y: 3.1235,
    });
    const moved = moveCorner(before, 'b1', 'v2', { x: 2.345678, y: 0.000012 });
    expect(moved.blocks[0]!.vertices[1]!.sketch).toEqual({ x: 2.3457, y: 0 });
    before.blocks[0]!.vertices[1]!.x = 2.3000000000000003;
    expect(saveProject(before)).not.toContain('2.3000000000000003');
    expect(loadProject(JSON.stringify(before)).blocks[0]!.vertices[1]!.x).toBe(
      2.3,
    );
  });
  it('rejects geometry that collapses at storage precision or has opposite fitted/sketch winding', () => {
    expect(() =>
      project([
        { x: 0, y: 0 },
        { x: 0.00001, y: 0 },
        { x: 0, y: 1 },
      ]),
    ).toThrow();
    const before = project([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 0, y: 2 },
    ]);
    before.blocks[0]!.vertices[2]!.y = -2;
    expect(() => normalizeBlock(before.blocks[0]!)).toThrow('opposite');
    expect(() => roundCoordinate(Infinity)).toThrow();
  });
});
