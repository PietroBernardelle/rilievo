import { describe, expect, it } from 'vitest';
import { area, distance } from '../model/geometry';
import { createProject, createRoom } from '../model/project';
import { createOpening, updateOpening } from '../model/openings';
import { edgeEndpoints, resolvePoint } from '../model/points';
import { placeOpening } from './openings';
import { rectanglePoints } from './snapping';
import { doorSwing, visibleWallLines, wallDrawing, wallShapes } from './walls';

describe('wall poche', () => {
  it('fills the 0.400 m outer wall band with mitered corners and a real doorway gap', () => {
    let project = createRoom(
      createProject('2026-11-05'),
      null,
      [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 3 },
        { x: 0, y: 3 },
      ],
      2.7,
    ).project;
    project = createOpening(project, 'b1', ['r1', 0], 'door', 1).project;
    const block = project.blocks[0]!;
    const shapes = wallShapes(block, block.rooms[0]!);
    expect(shapes.reduce((sum, points) => sum + area(points), 0)).toBeCloseTo(
      4.8 * 3.8 - 4 * 3 - 0.8 * 0.4,
      8,
    );
  });
  it('clips only portions inside poche, retaining exposed boundary lines and opening gaps', () => {
    const rectangle = rectanglePoints({ x: 1, y: -1 }, { x: 3, y: 1 });
    expect(
      visibleWallLines(
        [
          { x: 0, y: 0 },
          { x: 4, y: 0 },
        ],
        [rectangle],
      ),
    ).toEqual([
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
      [
        { x: 3, y: 0 },
        { x: 4, y: 0 },
      ],
    ]);
    expect(
      visibleWallLines(
        [
          { x: 1, y: 1 },
          { x: 3, y: 1 },
        ],
        [rectangle],
      ),
    ).toHaveLength(1);
    const adjacent = rectanglePoints({ x: 1, y: 1 }, { x: 3, y: 2 });
    expect(
      visibleWallLines(
        [
          { x: 1, y: 1 },
          { x: 3, y: 1 },
        ],
        [rectangle, adjacent],
      ),
    ).toEqual([]);
    const split = [
      rectanglePoints({ x: 1, y: -1 }, { x: 1.5, y: 1 }),
      rectanglePoints({ x: 2.5, y: -1 }, { x: 3, y: 1 }),
    ];
    expect(
      visibleWallLines(
        [
          { x: 1, y: 0 },
          { x: 3, y: 0 },
        ],
        split,
      ),
    ).toEqual([
      [
        { x: 1.5, y: 0 },
        { x: 2.5, y: 0 },
      ],
    ]);
  });
  it('removes room face lines covered by another room wall, regardless of room order', () => {
    let project = createProject('2026-11-06');
    for (const [x, y] of [
      [0, 0],
      [4.2, 1],
    ])
      project = createRoom(
        project,
        project.blocks[0]?.id ?? null,
        rectanglePoints({ x: x!, y: y! }, { x: x! + 4, y: y! + 3 }),
        2.7,
      ).project;
    const block = project.blocks[0]!;
    for (const rooms of [block.rooms, [...block.rooms].reverse()]) {
      const drawing = wallDrawing({ ...block, rooms });
      const first = drawing.find((room) => room.roomId === 'r1')!;
      // Room 2's 0.4 m left wall covers Room 1's right face above y=0.6.
      const rightFace = first.lines.filter(([a, b]) => a.x === 4 && b.x === 4);
      expect(rightFace).toHaveLength(1);
      expect(Math.max(rightFace[0]![0].y, rightFace[0]![1].y)).toBeCloseTo(0.6);
    }
  });
});

describe('door swing room-side jambs', () => {
  it('anchors both hinge choices on the correct wall face for inward and outward doors', () => {
    const base = createRoom(
      createProject('2026-11-06'),
      null,
      rectanglePoints({ x: 0, y: 0 }, { x: 4, y: 3 }),
      2.7,
    ).project;
    for (const edge of [0, 1, 2, 3])
      for (const hinge of [0, 1] as const)
        for (const swing of ['in', 'out'] as const) {
          let project = createOpening(
            base,
            'b1',
            ['r1', edge],
            'door',
            1.5,
          ).project;
          project = updateOpening(project, 'b1', 'o1', { hinge, swing });
          const block = project.blocks[0]!;
          const opening = block.openings[0]!;
          const symbol = doorSwing(block, opening);
          const [a, b] = edgeEndpoints(block, ['r1', edge]);
          const length = distance(a, b);
          const normal = { x: (b.y - a.y) / length, y: -(b.x - a.x) / length };
          const jamb = resolvePoint(block, { jamb: 'o1', side: hinge });
          expect(symbol.hinge.x).toBeCloseTo(
            jamb.x + normal.x * (swing === 'out' ? 0.4 : 0),
          );
          expect(symbol.hinge.y).toBeCloseTo(
            jamb.y + normal.y * (swing === 'out' ? 0.4 : 0),
          );
          expect(distance(symbol.closed, symbol.hinge)).toBeCloseTo(0.8);
          expect(distance(symbol.leaf, symbol.hinge)).toBeCloseTo(0.8);
          const outward =
            (symbol.leaf.x - symbol.hinge.x) * normal.x +
            (symbol.leaf.y - symbol.hinge.y) * normal.y;
          expect(outward).toBeCloseTo(swing === 'out' ? 0.8 : -0.8);
        }
  });
  it('uses the facing room jamb for a shared outward swing, across a measured wall', () => {
    let project = createProject('2026-11-06');
    for (const x of [0, 4])
      project = createRoom(
        project,
        project.blocks[0]?.id ?? null,
        rectanglePoints({ x, y: 0 }, { x: x + 4, y: 3 }),
        2.7,
      ).project;
    project = placeOpening(project, 'b1', ['r1', 1], 'door', 1.5).project;
    for (const hinge of [0, 1] as const) {
      const changed = updateOpening(project, 'b1', 'o1', {
        hinge,
        swing: 'out',
      });
      const original = changed.blocks[0]!;
      const otherIds = original.rooms[1]!.vertexIds;
      const block = {
        ...original,
        joins: original.joins.map((join) => ({ ...join, measured: true })),
        vertices: original.vertices.map((v) =>
          otherIds.includes(v.id) ? { ...v, x: v.x + 0.3 } : v,
        ),
      };
      const symbol = doorSwing(block, block.openings[0]!);
      expect(symbol.hinge).toEqual(
        resolvePoint(block, { jamb: 'o2', side: hinge === 0 ? 1 : 0 }),
      );
      expect(symbol.closed.x).toBeCloseTo(4.3);
      expect(symbol.leaf.x).toBeCloseTo(5.1);
    }
  });
});
