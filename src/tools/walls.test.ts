import { describe, expect, it } from 'vitest';
import { area } from '../model/geometry';
import { createProject, createRoom } from '../model/project';
import { createOpening } from '../model/openings';
import { wallShapes } from './walls';

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
});
