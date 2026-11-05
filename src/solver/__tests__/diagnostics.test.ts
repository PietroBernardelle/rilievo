import { describe, expect, it } from 'vitest';
import { distance, roomPoints } from '../../model/geometry';
import { loadProject, saveProject } from '../../model/json';
import { createProject } from '../../model/project';
import { sketchConstraints } from '../constraints';
import { measurementResiduals, roomRigidity } from '../diagnostics';
import { fit } from '../fit';
import { edgeEndpoints, pairedOpening, resolvePoint } from '../geometry';
import { joinedRooms, measurement, roomBlock, squareBlock } from './fixtures';

describe('constraints and diagnostics', () => {
  it('generates only near-right sketch angles and respects explicit constraints', () => {
    const block = roomBlock();
    expect(sketchConstraints(block)).toHaveLength(4);
    block.constraints = [
      {
        kind: 'perpendicular',
        edges: [
          ['r1', 0],
          ['r1', 1],
        ],
        weight: 0,
      },
    ];
    expect(sketchConstraints(block)).toHaveLength(3);
    const skewed = roomBlock([
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 5, y: 3 },
      { x: 1, y: 3 },
    ]);
    expect(sketchConstraints(skewed)).toEqual([]);
  });
  it('does not count duplicate distances or sketch priors as rigidity evidence', () => {
    const block = squareBlock();
    block.measurements.pop();
    block.measurements.push({ ...block.measurements[0]!, id: 'duplicate' });
    expect(fit(block).rooms[0]).toMatchObject({ rank: 4, rigid: false });
    block.measurements = [];
    const result = fit(block);
    expect(result.rooms[0]).toMatchObject({ rank: 0, rigid: false });
    expect(result.rms).toBe(0);
    expect(result.worstMeasurementId).toBeNull();
    expect(result.converged).toBe(true);
  });
  it('treats opening positions as nuisance variables in rigidity and skips unreachable candidates', () => {
    const block = squareBlock();
    block.measurements.pop();
    block.openings = [
      {
        id: 'o1',
        roomId: 'r1',
        edge: 0,
        type: 'door',
        offset: 1,
        width: 0.8,
        height: 2.1,
        sill: 0,
      },
    ];
    block.measurements.push(
      measurement(
        'offset',
        { vertex: 'v1' },
        { jamb: 'o1', side: 0 },
        1,
        'offset',
      ),
    );
    block.measurements.push({
      ...measurement('unreachable', { vertex: 'v1' }, { vertex: 'v3' }, 5),
      status: 'skipped',
    });
    expect(fit(block).rooms[0]).toMatchObject({
      rank: 4,
      rigid: false,
      nextMeasurement: { a: { vertex: 'v2' }, b: { vertex: 'v4' } },
    });
  });
  it('flags when either the absolute tolerance or three sigma is exceeded', () => {
    const block = roomBlock();
    const length = distance(block.vertices[0]!, block.vertices[1]!);
    block.measurements = [
      {
        ...measurement(
          'tight',
          { vertex: 'v1' },
          { vertex: 'v2' },
          length - 0.004,
        ),
        sigma: 0.001,
      },
      {
        ...measurement(
          'loose',
          { vertex: 'v1' },
          { vertex: 'v2' },
          length - 0.02,
        ),
        sigma: 1,
      },
    ];
    const residuals = measurementResiduals(block, 0.015);
    expect(residuals.every((item) => item.flagged)).toBe(true);
    expect(residuals[0]!.normalized).toBeCloseTo(4);
    expect(residuals[1]!.residual).toBeCloseTo(0.02);
  });
  it('ignores queued, skipped and rejected distances, and explicitly defers heights', () => {
    const block = squareBlock();
    block.measurements.push(
      {
        ...measurement('queued', { vertex: 'v1' }, { vertex: 'v2' }, 100),
        status: 'queued',
        value: null,
      },
      {
        ...measurement('skipped', { vertex: 'v1' }, { vertex: 'v2' }, 100),
        status: 'skipped',
      },
      {
        ...measurement(
          'rejected',
          { vertex: 'deleted' },
          { vertex: 'v2' },
          100,
        ),
        status: 'rejected',
      },
      measurement('height', { vertex: 'v1' }, { vertex: 'v2' }, 2.7, 'height'),
    );
    const result = fit(block);
    expect(result.residuals).toHaveLength(5);
    expect(result.deferredMeasurementIds).toEqual(['height']);
    expect(result.rooms[0]!.rigid).toBe(true);
    const expected = Math.sqrt(
      result.residuals.reduce((sum, item) => sum + item.normalized ** 2, 0) / 5,
    );
    expect(result.rms).toBe(expected);
  });
  it('supports edge points and resolves jambs in edge direction', () => {
    const block = joinedRooms();
    expect(resolvePoint(block, { edgePoint: ['r1', 0], t: 0.5 })).toEqual({
      x: 2.05,
      y: 0,
    });
    expect(
      distance(resolvePoint(block, { jamb: 'o1', side: 0 }), {
        x: 4.1,
        y: 0.8,
      }),
    ).toBeLessThan(1e-12);
    expect(
      distance(resolvePoint(block, { jamb: 'o1', side: 1 }), {
        x: 4.1,
        y: 1.6,
      }),
    ).toBeLessThan(1e-12);
    expect(() => resolvePoint(block, { vertex: 'missing' })).toThrow();
    expect(() => resolvePoint(block, { jamb: 'missing', side: 0 })).toThrow();
    expect(() => edgeEndpoints(block, ['r1', 99])).toThrow();
  });
  it('pins translated and rotated input without changing the stored sketch', () => {
    const block = squareBlock();
    for (const vertex of block.vertices) {
      const { x, y } = vertex;
      vertex.x = 10 - y;
      vertex.y = 20 + x;
      vertex.sketch = { x: vertex.x, y: vertex.y };
    }
    const result = fit(block);
    const points = roomPoints(result.block, result.block.rooms[0]!, false);
    expect(points[0]).toMatchObject({ x: 0, y: 0 });
    expect(points[1]!.y).toBe(0);
    expect(points[1]!.x).toBeCloseTo(4, 3);
    expect(result.block.vertices[0]!.sketch).toEqual({ x: 10, y: 20 });
    const saved = loadProject(
      saveProject({
        ...createProject('2026-11-05T10:00:00Z'),
        blocks: [result.block],
      }),
    );
    expect(saved.blocks[0]!.vertices[0]!.sketch).toEqual({ x: 10, y: 20 });
  });
  it('enforces hard perpendicular, parallel and collinear geometry', () => {
    const block = squareBlock(5.1);
    block.constraints = [
      {
        kind: 'perpendicular',
        edges: [
          ['r1', 0],
          ['r1', 1],
        ],
        hard: true,
      },
      {
        kind: 'parallel',
        edges: [
          ['r1', 0],
          ['r1', 2],
        ],
        hard: true,
      },
    ];
    const result = fit(block);
    expect(result.converged).toBe(true);
    expect(result.hardError).toBeLessThan(1e-8);
    const points = roomPoints(result.block, result.block.rooms[0]!, false);
    expect(Math.abs(points[2]!.x - points[1]!.x)).toBeLessThan(1e-7);
    expect(Math.abs(points[3]!.y - points[2]!.y)).toBeLessThan(1e-7);
    const collinear = roomBlock([
      { x: 0, y: 0 },
      { x: 2, y: 0.01 },
      { x: 4, y: 0 },
      { x: 4, y: 3 },
      { x: 0, y: 3 },
    ]);
    collinear.constraints = [
      {
        kind: 'collinear',
        edges: [
          ['r1', 0],
          ['r1', 1],
        ],
        hard: true,
      },
    ];
    const straight = fit(collinear);
    expect(straight.converged).toBe(true);
    expect(straight.hardError).toBeLessThan(1e-8);
  });
  it('handles an empty block and rejects invalid settings or unsupported constraints', () => {
    const block = roomBlock();
    const empty = { ...block, rooms: [], vertices: [] };
    expect(fit(empty)).toMatchObject({
      converged: true,
      iterations: 0,
      rms: 0,
      rooms: [],
    });
    expect(() => fit(block, { tolerance: 0 })).toThrow();
    expect(() => fit(block, { maxIterations: 0 })).toThrow();
    block.constraints = [
      {
        kind: 'unknown',
        edges: [
          ['r1', 0],
          ['r1', 1],
        ],
      },
    ];
    expect(() => fit(block)).toThrow('Unsupported');
    expect(() => fit({ ...empty, vertices: roomBlock().vertices })).toThrow();
  });
  it('pairs a doorway in either direction and rejects absent or ambiguous matches', () => {
    const block = joinedRooms();
    expect(
      pairedOpening(block, 'o2', ['r1', 1], ['r2', 3]).map((item) => item.id),
    ).toEqual(['o1', 'o2']);
    expect(() =>
      pairedOpening(block, 'missing', ['r1', 1], ['r2', 3]),
    ).toThrow();
    expect(() => pairedOpening(block, 'o1', ['r1', 0], ['r2', 3])).toThrow();
    const missing = { ...block, openings: block.openings.slice(0, 1) };
    expect(() => pairedOpening(missing, 'o1', ['r1', 1], ['r2', 3])).toThrow(
      'exactly one',
    );
    block.openings.push({ ...block.openings[1]!, id: 'o3' });
    expect(() => fit(block)).toThrow('found 2');
  });
  it('accepts an empty block with rejected history and rejects out-of-bounds openings', () => {
    const empty = {
      ...roomBlock(),
      rooms: [],
      vertices: [],
      measurements: [
        {
          ...measurement(
            'old',
            { vertex: 'deleted1' },
            { vertex: 'deleted2' },
            1,
          ),
          status: 'rejected' as const,
        },
      ],
    };
    expect(fit(empty)).toMatchObject({
      converged: true,
      residuals: [],
      rooms: [],
    });
    const block = joinedRooms();
    block.openings[0]!.offset = 100;
    expect(() => fit(block)).toThrow('opening bounds');
  });
  it('does not claim convergence when the iteration budget runs out', () => {
    expect(fit(squareBlock(5.1), { maxIterations: 1 }).converged).toBe(false);
  });
  it('reports the rank of edge-point constraints without extra independent evidence', () => {
    const block = squareBlock();
    block.measurements = [
      measurement(
        'half',
        { vertex: 'v1' },
        { edgePoint: ['r1', 0], t: 0.5 },
        2,
      ),
      measurement('whole', { vertex: 'v1' }, { vertex: 'v2' }, 4),
    ];
    expect(roomRigidity(block, block.rooms[0]!).rank).toBe(1);
  });
});
