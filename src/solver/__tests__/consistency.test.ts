import { describe, expect, it } from 'vitest';
import { createProject, createRoom } from '../../model/project';
import { roomPoints, distance } from '../../model/geometry';
import { fit, leaveOneOut } from '../fit';
import {
  joinedRooms,
  measurement,
  rectangleMeasurements,
  squareBlock,
} from './fixtures';
import { roomSubBlock, connectedRoomGroups } from '../components';
import { chiSquareSurvival, measurementProjection } from '../statistics';

function checkedRoom(badWall = false) {
  const block = squareBlock();
  block.measurements.push(
    measurement('BD', { vertex: 'v2' }, { vertex: 'v4' }, 5),
  );
  if (badWall)
    block.measurements.find((item) => item.id === 'CD')!.value = 4.04;
  return block;
}
function eightRooms() {
  let project = createProject('2026-11-05T10:00:00Z');
  for (let i = 0; i < 8; i++) {
    const x = (i % 4) * 6;
    const y = Math.floor(i / 4) * 5;
    project = createRoom(
      project,
      project.blocks[0]?.id ?? null,
      [
        { x, y },
        { x: x + 4.1, y },
        { x: x + 4.1, y: y + 2.9 },
        { x, y: y + 2.9 },
      ],
      2.7,
    ).project;
  }
  const block = project.blocks[0]!;
  for (const room of block.rooms) {
    block.measurements.push(
      ...rectangleMeasurements(room.vertexIds, 4, 3, `${room.id}-`),
      measurement(
        `${room.id}-BD`,
        { vertex: room.vertexIds[1]! },
        { vertex: room.vertexIds[3]! },
        5,
      ),
    );
  }
  return block;
}
describe('M2.1 measurement consistency', () => {
  it('detects a 40 mm CD error with both diagonals, despite every residual being below 15 mm', () => {
    const result = fit(checkedRoom(true));
    const room = result.rooms[0]!;
    expect(result.converged).toBe(true);
    expect(room.redundancy).toBe(1);
    expect(room.parameterRank).toBe(5);
    expect(room.consistent).toBe(false);
    expect(room.pValue).toBeLessThan(0.01);
    expect(result.groups[0]!.consistent).toBe(false);
    expect(
      result.residuals.every(
        (item) => Math.abs(item.residual) < 0.015 && !item.flagged,
      ),
    ).toBe(true);
    expect(room.suspectMeasurements.map((item) => item.id)).toContain('CD');
    expect(result.suspectMeasurements.map((item) => item.id)).toContain('CD');
    expect(result.probableWrongMeasurementId).toBeNull();
    expect(result.worstMeasurementId).toBeNull();
    for (const item of result.residuals) {
      expect(item.unchecked).toBe(false);
      expect(item.standardizedResidual).toBeCloseTo(
        item.residual / (item.sigma * Math.sqrt(item.redundancy)),
        10,
      );
    }
    const scores = result.suspectMeasurements.map((item) =>
      Math.abs(item.standardizedResidual),
    );
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    const trials = leaveOneOut(checkedRoom(true));
    expect(
      trials.every(
        (item) => item.converged && item.consistent && item.redundancy === 0,
      ),
    ).toBe(true);
  });
  it('reports all five measurements unchecked with only one diagonal, and suggests the missing diagonal', () => {
    const block = checkedRoom(true);
    block.measurements.pop();
    const result = fit(block);
    expect(result.rooms[0]).toMatchObject({
      consistent: true,
      redundancy: 0,
      pValue: null,
      rigid: true,
      nextMeasurement: { a: { vertex: 'v2' }, b: { vertex: 'v4' } },
    });
    expect(
      result.residuals.every(
        (item) =>
          item.unchecked &&
          item.redundancy === 0 &&
          item.standardizedResidual === null,
      ),
    ).toBe(true);
    expect(result.suspectMeasurements).toEqual([]);
    expect(result.probableWrongMeasurementId).toBeNull();
  });
  it('reports correct measurements consistent with no suspects', () => {
    const result = fit(checkedRoom());
    expect(result.rooms[0]!.consistent).toBe(true);
    expect(result.rooms[0]!.pValue).toBeGreaterThan(0.99);
    expect(result.groups[0]!.consistent).toBe(true);
    expect(result.suspectMeasurements).toEqual([]);
    expect(result.probableWrongMeasurementId).toBeNull();
    expect(
      result.residuals.reduce((sum, item) => sum + item.redundancy, 0),
    ).toBeCloseTo(1, 8);
  });
  it('isolates one bad wall in eight independent rooms in under 500 ms', () => {
    const block = eightRooms();
    block.measurements.find((item) => item.id === 'r5-CD')!.value = 4.04;
    const original = JSON.stringify(block);
    const start = performance.now();
    const result = fit(block);
    const elapsed = performance.now() - start;
    console.log(
      `Eight-room fit including diagnostics: ${elapsed.toFixed(1)} ms`,
    );
    expect(elapsed).toBeLessThan(500);
    expect(result.converged).toBe(true);
    expect(result.groups).toHaveLength(8);
    expect(
      result.rooms
        .filter((room) => !room.consistent)
        .map((room) => room.roomId),
    ).toEqual(['r5']);
    expect(
      result.suspectMeasurements.every((item) => item.id.startsWith('r5-')),
    ).toBe(true);
    expect(JSON.stringify(block)).toBe(original);
    for (const room of block.rooms.filter((room) => room.id !== 'r5')) {
      const alone = fit(roomSubBlock(block, [room.id]));
      const points = roomPoints(result.block, room, false);
      const expected = roomPoints(alone.block, room, false);
      for (let i = 0; i < 4; i++)
        expect(distance(points[i]!, points[(i + 1) % 4]!)).toBeCloseTo(
          distance(expected[i]!, expected[(i + 1) % 4]!),
          9,
        );
      expect(points[0]).toMatchObject(
        block.vertices.find((vertex) => vertex.id === room.vertexIds[0])!,
      );
    }
  });
  it('provides per-room and per-joined-group tests without counting join or angle-prior rows', () => {
    const block = joinedRooms();
    block.measurements.push(
      measurement('ABD', { vertex: 'v2' }, { vertex: 'v4' }, 5),
      measurement('BBD', { vertex: 'v6' }, { vertex: 'v8' }, Math.sqrt(18)),
    );
    block.measurements.find((item) => item.id === 'ACD')!.value = 4.04;
    const result = fit(block);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]!.roomIds).toEqual(['r1', 'r2']);
    expect(result.groups[0]!.redundancy).toBe(2);
    expect(result.groups[0]!.measurementCount).toBe(14);
    expect(result.rooms[0]!.consistent).toBe(false);
    expect(result.groups[0]!.consistent).toBe(false);
    expect(result.probableWrongMeasurementId).toBeNull();
    expect(
      result.residuals.filter((item) => item.unchecked).map((item) => item.id),
    ).toEqual(['offsetA', 'offsetB']);
  });
  it('uses each recorded sigma when computing measurement redundancy', () => {
    const block = squareBlock();
    const first = block.measurements[0]!;
    block.measurements = [first, { ...first, id: 'repeat-AB', sigma: 0.01 }];
    const result = fit(block);
    expect(result.rooms[0]!.redundancy).toBe(1);
    expect(result.residuals[0]!.redundancy).toBeCloseTo(0.2, 9);
    expect(result.residuals[1]!.redundancy).toBeCloseTo(0.8, 9);
  });
  it('keeps independently rotated rooms in the block frame and preserves sketches and history', () => {
    const block = roomSubBlock(eightRooms(), ['r1', 'r2']);
    const secondRoom = block.rooms[1]!;
    for (const vertex of block.vertices) {
      if (secondRoom.vertexIds.includes(vertex.id)) {
        const { x, y } = vertex;
        vertex.x = 6 - y;
        vertex.y = x - 6;
      }
      const { x, y } = vertex;
      vertex.x = 10 + Math.cos(0.37) * x - Math.sin(0.37) * y;
      vertex.y = 20 + Math.sin(0.37) * x + Math.cos(0.37) * y;
      vertex.sketch = { x: vertex.x, y: vertex.y };
    }
    block.measurements.push({
      ...measurement('old', { vertex: 'gone-a' }, { vertex: 'gone-b' }, 1),
      status: 'rejected',
    });
    const result = fit(block);
    expect(result.converged).toBe(true);
    expect(result.groups).toHaveLength(2);
    const points = roomPoints(result.block, secondRoom, false);
    expect(points[0]!.x).toBeCloseTo(6, 9);
    expect(points[0]!.y).toBeCloseTo(0, 9);
    expect(points[1]!.x).toBeCloseTo(6, 9);
    expect(points[1]!.y).toBeCloseTo(4, 3);
    expect(result.block.measurements).toEqual(block.measurements);
    expect(result.block.vertices.map((vertex) => vertex.sketch)).toEqual(
      block.vertices.map((vertex) => vertex.sketch),
    );
  });
  it.each([
    { error: 0.04, probableId: null },
    { error: 0.08, probableId: 'CD' },
  ])(
    'only names a unique leave-one-out explanation for a $error m error',
    ({ error, probableId }) => {
      const block = checkedRoom(true);
      block.measurements.find((item) => item.id === 'CD')!.value = 4 + error;
      for (const item of [...block.measurements].filter(
        (item) => item.id !== 'CD',
      ))
        block.measurements.push({ ...item, id: `repeat-${item.id}` });
      const result = fit(block);
      expect(result.rooms[0]!.consistent).toBe(false);
      expect(result.probableWrongMeasurementId).toBe(probableId);
      expect(result.groups[0]!.probableWrongMeasurementId).toBe(probableId);
      expect(result.rooms[0]!.probableWrongMeasurementId).toBe(probableId);
      const trials = leaveOneOut(block);
      const compatible = trials
        .filter((item) => item.consistent)
        .map((item) => item.omittedId);
      if (probableId) expect(compatible).toEqual([probableId]);
      else expect(compatible.length).toBeGreaterThan(1);
    },
  );
  it('does not split rooms coupled by explicit cross-room measurements or constraints', () => {
    const block = eightRooms();
    expect(connectedRoomGroups(block)).toHaveLength(8);
    block.measurements.push(
      measurement('cross', { vertex: 'v1' }, { vertex: 'v5' }, 6),
    );
    expect(connectedRoomGroups(block)[0]).toEqual(['r1', 'r2']);
    block.constraints.push({
      kind: 'parallel',
      edges: [
        ['r2', 0],
        ['r3', 0],
      ],
      weight: 1,
    });
    expect(connectedRoomGroups(block)[0]).toEqual(['r1', 'r2', 'r3']);
  });
});
describe('measurement projection and chi-square tails', () => {
  it('matches NIST 1% critical values and exact even-degree tails', () => {
    // https://www.itl.nist.gov/div898/handbook/eda/section3/eda3674.htm
    for (const [df, critical] of [
      [1, 6.635],
      [2, 9.21],
      [3, 11.345],
      [10, 23.209],
      [100, 135.807],
    ])
      expect(chiSquareSurvival(critical!, df!)).toBeCloseTo(0.01, 5);
    expect(chiSquareSurvival(4, 2)).toBeCloseTo(Math.exp(-2), 12);
    expect(chiSquareSurvival(4, 4)).toBeCloseTo(3 * Math.exp(-2), 12);
    expect(chiSquareSurvival(0, 1)).toBe(1);
    expect(chiSquareSurvival(1e6, 1)).toBe(0);
    expect(chiSquareSurvival(Infinity, 3)).toBe(0);
    expect(() => chiSquareSurvival(1, 0)).toThrow();
    expect(() => chiSquareSurvival(-1, 1)).toThrow();
    expect(() => chiSquareSurvival(NaN, 1)).toThrow();
  });
  it('uses the weighted column space, handles gauge singularities and excludes no-data/unchecked rows', () => {
    const projected = measurementProjection([
      [1, 2],
      [0.5, 1],
    ]);
    expect(projected.rank).toBe(1);
    expect(projected.redundancy[0]).toBeCloseTo(0.2, 12);
    expect(projected.redundancy[1]).toBeCloseTo(0.8, 12);
    expect(
      measurementProjection([
        [1, 0],
        [0, 1],
      ]).redundancy.every((value) => Math.abs(value) < 1e-12),
    ).toBe(true);
    expect(measurementProjection([[0], [0]])).toEqual({
      rank: 0,
      redundancy: [1, 1],
    });
    expect(measurementProjection([])).toEqual({ rank: 0, redundancy: [] });
    expect(() => measurementProjection([[1], [1, 2]])).toThrow();
    expect(() => measurementProjection([[NaN]])).toThrow();
  });
});
