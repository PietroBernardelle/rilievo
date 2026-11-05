import { createProject, createRoom } from '../../model/project';
import type { Block, Measurement, Point, PointRef } from '../../model/types';

export function roomBlock(
  points: Point[] = [
    { x: 0, y: 0 },
    { x: 4.1, y: 0 },
    { x: 4.1, y: 2.9 },
    { x: 0, y: 2.9 },
  ],
): Block {
  return createRoom(createProject('2026-11-05T10:00:00Z'), null, points, 2.7)
    .project.blocks[0]!;
}
export function measurement(
  id: string,
  a: PointRef,
  b: PointRef,
  value: number,
  kind: Measurement['kind'] = 'distance',
): Measurement {
  return { id, a, b, value, kind, sigma: 0.005, status: 'done', note: '' };
}
export function rectangleMeasurements(
  ids: string[],
  width: number,
  height: number,
  prefix = '',
): Measurement[] {
  return [
    [0, 1, width],
    [1, 2, height],
    [2, 3, width],
    [3, 0, height],
    [0, 2, Math.hypot(width, height)],
  ].map(([a, b, value], i) =>
    measurement(
      `${prefix}${['AB', 'BC', 'CD', 'DA', 'AC'][i]}`,
      { vertex: ids[a!]! },
      { vertex: ids[b!]! },
      value!,
    ),
  );
}
export function squareBlock(diagonal = 5): Block {
  const block = roomBlock();
  block.measurements = rectangleMeasurements(block.rooms[0]!.vertexIds, 4, 3);
  block.measurements[4]!.value = diagonal;
  return block;
}
export function joinedRooms(): Block {
  const project = createRoom(
    createProject('2026-11-05T10:00:00Z'),
    null,
    [
      { x: 0, y: 0 },
      { x: 4.1, y: 0 },
      { x: 4.1, y: 2.9 },
      { x: 0, y: 2.9 },
    ],
    2.7,
  ).project;
  const block = createRoom(
    project,
    'b1',
    [
      { x: 4.6, y: -0.5 },
      { x: 7.7, y: -0.5 },
      { x: 7.7, y: 2.6 },
      { x: 4.6, y: 2.6 },
    ],
    2.7,
  ).project.blocks[0]!;
  block.openings = [
    {
      id: 'o1',
      roomId: 'r1',
      edge: 1,
      type: 'door',
      offset: 0.8,
      width: 0.8,
      height: 2.1,
      sill: 0,
    },
    {
      id: 'o2',
      roomId: 'r2',
      edge: 3,
      type: 'door',
      offset: 0.5,
      width: 0.8,
      height: 2.1,
      sill: 0,
    },
  ];
  block.joins = [
    { id: 'j1', a: ['r1', 1], b: ['r2', 3], thickness: 0.3, via: 'o1' },
  ];
  block.measurements = [
    ...rectangleMeasurements(block.rooms[0]!.vertexIds, 4, 3, 'A'),
    ...rectangleMeasurements(block.rooms[1]!.vertexIds, 3, 3, 'B'),
    measurement(
      'offsetA',
      { vertex: 'v2' },
      { jamb: 'o1', side: 0 },
      0.8,
      'offset',
    ),
    measurement(
      'offsetB',
      { vertex: 'v8' },
      { jamb: 'o2', side: 0 },
      0.5,
      'offset',
    ),
  ];
  return block;
}
