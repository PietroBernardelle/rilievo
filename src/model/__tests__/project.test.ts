import { describe, expect, it } from 'vitest';
import sample from '../../../examples/sample-project.json';
import {
  createProject,
  createRoom,
  deleteCorner,
  deleteRoom,
  moveCorner,
  updateRoom,
} from '../project';
import { loadProject, saveProject } from '../json';
import {
  area,
  containsPoint,
  distance,
  nearestOnSegment,
  parseLength,
  perimeter,
  roomPoints,
  validatePolygon,
} from '../geometry';
import { commit, createHistory, redo, undo } from '../history';
import type { Point, Project } from '../types';
const RECTANGLE: Point[] = [
  { x: 0, y: 0 },
  { x: 4, y: 0 },
  { x: 4, y: 3 },
  { x: 0, y: 3 },
];
const empty = (): Project => createProject('2026-11-05T10:00:00Z');
const example = (): Project => loadProject(JSON.stringify(sample));
const drawn = (): Project => createRoom(empty(), null, RECTANGLE, 2.7).project;

describe('project editing', () => {
  it('creates a floor lazily and keeps every room corner independent', () => {
    const before = empty();
    const first = createRoom(before, null, RECTANGLE, 2.7);
    expect(before.blocks).toEqual([]);
    expect(first.project.blocks[0]).toMatchObject({
      name: 'Piano terra',
      kind: 'floor',
      elevation: 0,
    });
    const second = createRoom(first.project, first.blockId, RECTANGLE, 2.7);
    expect(second.project.blocks).toHaveLength(1);
    const block = second.project.blocks[0]!;
    expect(new Set(block.rooms.flatMap((room) => room.vertexIds)).size).toBe(8);
    expect(
      block.vertices.every(
        (vertex) =>
          vertex.x === vertex.sketch.x && vertex.y === vertex.sketch.y,
      ),
    ).toBe(true);
    expect(block.rooms[0]!.height).toBe(2.7);
  });
  it('creates in the selected block, allocates unused IDs, and leaves other blocks unchanged', () => {
    const project = drawn();
    const first = project.blocks[0]!;
    const second = { ...first, id: 'b2', rooms: [], vertices: [] };
    const result = createRoom(
      { ...project, blocks: [first, second] },
      'b2',
      RECTANGLE,
      3,
    );
    expect(result.project.blocks[0]).toBe(first);
    expect(result.project.blocks[1]!.rooms[0]!.id).toBe('r2');
    expect(result.project.blocks[1]!.vertices[0]!.id).toBe('v5');
    expect(() => createRoom(project, 'missing', RECTANGLE, 3)).toThrow('Block');
  });
  it('moves both fitted and sketch coordinates immutably and rejects invalid shapes', () => {
    const before = drawn();
    const next = moveCorner(before, 'b1', 'v2', { x: 5, y: 0 });
    expect(next.blocks[0]!.vertices[1]).toEqual({
      id: 'v2',
      x: 5,
      y: 0,
      sketch: { x: 5, y: 0 },
    });
    expect(before.blocks[0]!.vertices[1]!.x).toBe(4);
    expect(moveCorner(before, 'b1', 'v2', { x: 4, y: 0 })).toBe(before);
    expect(() => moveCorner(before, 'b1', 'v2', { x: 0, y: 0 })).toThrow();
    expect(() => moveCorner(before, 'b1', 'v2', { x: NaN, y: 0 })).toThrow();
    expect(() => moveCorner(before, 'b1', 'missing', { x: 1, y: 1 })).toThrow();
  });
  it('renames and changes height without changing the schema or unrelated data', () => {
    const before = example();
    const next = updateRoom(before, 'b1', 'r1', {
      name: ' Kitchen ',
      height: parseLength('295cm'),
    });
    expect(next.blocks[0]!.rooms[0]).toMatchObject({
      name: 'Kitchen',
      height: 2.95,
    });
    expect(next.blocks[0]!.measurements).toBe(before.blocks[0]!.measurements);
    expect(updateRoom(before, 'b1', 'r1', {})).toBe(before);
    expect(() => updateRoom(before, 'b1', 'r1', { name: ' ' })).toThrow();
    for (const height of [0, -1, NaN, Infinity])
      expect(() => updateRoom(before, 'b1', 'r1', { height })).toThrow();
    expect(() => updateRoom(before, 'b1', 'missing', {})).toThrow();
  });
  it('deletes rooms with their dependent geometry, retaining rejected measurements', () => {
    const before = example();
    const next = deleteRoom(before, 'b1', 'r1');
    const block = next.blocks[0]!;
    expect(block.rooms.map((room) => room.id)).toEqual(['r2']);
    expect(block.vertices).toHaveLength(4);
    expect(block.openings.map((item) => item.id)).toEqual(['o2']);
    expect(block.joins).toEqual([]);
    expect(block.walls).toEqual([]);
    expect(block.constraints).toEqual([]);
    expect(block.measurements).toHaveLength(3);
    expect(block.measurements.every((item) => item.status === 'rejected')).toBe(
      true,
    );
    expect(loadProject(saveProject(next))).toEqual(next);
    expect(before.blocks[0]!.rooms).toHaveLength(2);
  });
  it('removes one corner, then removes the room when its triangle loses a corner', () => {
    const triangle = deleteCorner(drawn(), 'b1', 'v2');
    expect(triangle.blocks[0]!.rooms[0]!.vertexIds).toEqual(['v1', 'v3', 'v4']);
    expect(triangle.blocks[0]!.vertices).toHaveLength(3);
    const next = deleteCorner(triangle, 'b1', 'v3');
    expect(next.blocks[0]!.rooms).toEqual([]);
    expect(next.blocks[0]!.vertices).toEqual([]);
    expect(() => deleteCorner(next, 'b1', 'v1')).toThrow();
  });
  it('remaps surviving edges and cleans invalid links while retaining measurement history', () => {
    const project = drawn();
    const block = project.blocks[0]!;
    block.walls = [{ roomId: 'r1', edge: 2, thickness: 0.3 }];
    block.openings = [
      {
        id: 'o1',
        roomId: 'r1',
        edge: 2,
        type: 'door',
        width: 0.8,
        height: 2.1,
        sill: 0,
        offset: 0.2,
      },
    ];
    block.constraints = [
      {
        kind: 'parallel',
        edges: [
          ['r1', 2],
          ['r1', 3],
        ],
        weight: 1,
      },
    ];
    block.measurements = [
      {
        id: 'm1',
        kind: 'distance',
        a: { edgePoint: ['r1', 2], t: 0.5 },
        b: { jamb: 'o1', side: 0 },
        value: null,
        sigma: 0.005,
        status: 'queued',
        note: '',
      },
    ];
    project.links = [
      {
        id: 'l1',
        a: { block: 'b1', vertex: 'v2' },
        b: { block: 'b1', vertex: 'v3' },
      },
    ];
    const next = deleteCorner(project, 'b1', 'v2');
    expect(next.blocks[0]!.walls[0]!.edge).toBe(1);
    expect(next.blocks[0]!.openings[0]!.edge).toBe(1);
    expect(next.blocks[0]!.constraints[0]!.edges).toEqual([
      ['r1', 1],
      ['r1', 2],
    ]);
    expect(next.blocks[0]!.measurements[0]!.a).toEqual({
      edgePoint: ['r1', 1],
      t: 0.5,
    });
    expect(next.links).toEqual([]);
    expect(loadProject(saveProject(next))).toEqual(next);
    const removed = deleteRoom(project, 'b1', 'r1');
    expect(removed.blocks[0]!.measurements[0]!.status).toBe('rejected');
  });
  it('does not reuse corner IDs retained in rejected measurement history', () => {
    const deleted = deleteRoom(example(), 'b1', 'r1');
    const next = createRoom(deleted, 'b1', RECTANGLE, 2.7).project;
    const retained = new Set(
      deleted.blocks[0]!.measurements.flatMap((item) =>
        [item.a, item.b].flatMap((ref) =>
          'vertex' in ref ? [ref.vertex] : [],
        ),
      ),
    );
    const added = next.blocks[0]!.vertices.filter(
      (vertex) =>
        !deleted.blocks[0]!.vertices.some((old) => old.id === vertex.id),
    );
    expect(added.every((vertex) => !retained.has(vertex.id))).toBe(true);
    expect(loadProject(saveProject(next))).toEqual(next);
  });
  it('does not create a block for an invalid drawing', () => {
    const project = empty();
    expect(() =>
      createRoom(project, null, RECTANGLE.slice(0, 2), 2.7),
    ).toThrow();
    expect(() => createRoom(project, null, RECTANGLE, 0)).toThrow();
    expect(project.blocks).toEqual([]);
  });
});
describe('geometry and lengths', () => {
  it('computes square and concave polygon areas and perimeters independently of winding', () => {
    expect(area(RECTANGLE)).toBe(12);
    expect(perimeter(RECTANGLE)).toBe(14);
    expect(area([...RECTANGLE].reverse())).toBe(12);
    const l = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 2 },
      { x: 3, y: 2 },
      { x: 3, y: 4 },
      { x: 0, y: 4 },
    ];
    expect(area(l)).toBe(16);
    expect(perimeter(l)).toBe(18);
    validatePolygon(l);
    expect(containsPoint(l, { x: 4, y: 3 })).toBe(false);
    expect(containsPoint(l, { x: 1, y: 2 })).toBe(true);
    expect(containsPoint(l, { x: 0, y: 0 })).toBe(true);
    expect(area([])).toBe(0);
    expect(perimeter([])).toBe(0);
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
  it('uses sketch coordinates for quantities even if fitted coordinates differ', () => {
    const project = drawn();
    const block = project.blocks[0]!;
    block.vertices[1]!.x = 10;
    expect(area(roomPoints(block, block.rooms[0]!))).toBe(12);
    expect(area(roomPoints(block, block.rooms[0]!, false))).toBe(21);
    expect(() =>
      roomPoints(block, { ...block.rooms[0]!, vertexIds: ['missing'] }),
    ).toThrow();
  });
  it('projects onto edges including their endpoints and degenerate segments', () => {
    expect(
      nearestOnSegment({ x: 2, y: 4 }, { x: 0, y: 0 }, { x: 4, y: 0 }),
    ).toEqual({ x: 2, y: 0 });
    expect(
      nearestOnSegment({ x: 8, y: 4 }, { x: 0, y: 0 }, { x: 4, y: 0 }),
    ).toEqual({ x: 4, y: 0 });
    expect(
      nearestOnSegment({ x: 8, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 }),
    ).toEqual({ x: 0, y: 0 });
  });
  it('rejects crossings, collapsed edges, collinear rooms and non-finite coordinates', () => {
    for (const points of [
      [RECTANGLE[0]!, RECTANGLE[2]!, RECTANGLE[1]!, RECTANGLE[3]!],
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
      ],
      [...RECTANGLE, RECTANGLE[0]!],
      [{ x: Infinity, y: 0 }, ...RECTANGLE],
    ])
      expect(() => validatePolygon(points)).toThrow();
  });
  it.each(['3.425', '3,425', '342.5cm', '3425mm', ' 342,5 CM '])(
    'parses %s in metres',
    (value) => {
      expect(parseLength(value)).toBeCloseTo(3.425, 10);
    },
  );
  it.each(['3.4.2', '', '-3', 'Infinity', '2ft', '3,425.2'])(
    'rejects malformed length %s',
    (value) => {
      expect(() => parseLength(value)).toThrow();
    },
  );
});
describe('schema 1 JSON', () => {
  it('round-trips the supplied sample without losing fields or changing its data', () => {
    expect(JSON.parse(saveProject(example()))).toEqual(sample);
  });
  it('round-trips an empty project and a sketch', () => {
    for (const project of [empty(), drawn()])
      expect(loadProject(saveProject(project))).toEqual(project);
  });
  it.each(['{', 'null', '[]', '{}'])('rejects invalid project %s', (json) => {
    expect(() => loadProject(json)).toThrow();
  });
  it('rejects unknown versions, bad coordinates, duplicates and broken references', () => {
    const invalid: unknown[] = [
      { ...sample, schemaVersion: 2 },
      { ...sample, units: 'cm' },
      { ...sample, blocks: {} },
    ];
    const badVertex = example();
    badVertex.blocks[0]!.vertices[0]!.x = Infinity;
    invalid.push(badVertex);
    const duplicate = example();
    duplicate.blocks[0]!.vertices.push(duplicate.blocks[0]!.vertices[0]!);
    invalid.push(duplicate);
    const shared = example();
    shared.blocks[0]!.rooms[1]!.vertexIds[0] = 'v1';
    invalid.push(shared);
    const reference = example();
    reference.blocks[0]!.measurements[0]!.a = { vertex: 'missing' };
    invalid.push(reference);
    const edge = example();
    edge.blocks[0]!.walls[0]!.edge = 100;
    invalid.push(edge);
    const link = example();
    link.links.push({
      id: 'l1',
      a: { block: 'missing', vertex: 'v1' },
      b: { block: 'b1', vertex: 'v1' },
    });
    invalid.push(link);
    for (const value of invalid)
      expect(() => loadProject(JSON.stringify(value))).toThrow();
  });
});
describe('undo and redo', () => {
  it('restores creation, movement, rename, height, deletion, New and Open as atomic edits', () => {
    const original = empty();
    const created = drawn();
    const moved = moveCorner(created, 'b1', 'v2', { x: 5, y: 0 });
    const renamed = updateRoom(moved, 'b1', 'r1', { name: 'Kitchen' });
    const height = updateRoom(renamed, 'b1', 'r1', { height: 3 });
    const deleted = deleteCorner(height, 'b1', 'v2');
    const states = [
      original,
      created,
      moved,
      renamed,
      height,
      deleted,
      empty(),
      example(),
    ];
    let history = createHistory(original);
    for (const state of states.slice(1)) history = commit(history, state);
    for (const state of states.slice(0, -1).reverse()) {
      history = undo(history);
      expect(history.present).toBe(state);
    }
    expect(undo(history)).toBe(history);
    for (const state of states.slice(1)) {
      history = redo(history);
      expect(history.present).toBe(state);
    }
    expect(redo(history)).toBe(history);
    expect(commit(history, history.present)).toBe(history);
    history = commit(undo(history), original);
    expect(history.future).toEqual([]);
  });
});
