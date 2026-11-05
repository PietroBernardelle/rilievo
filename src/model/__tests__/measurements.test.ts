import { describe, expect, it } from 'vitest';
import { createProject, createRoom } from '../project';
import { loadProject, saveProject } from '../json';
import {
  measurementSigma,
  moveMeasurement,
  recordMeasurement,
  requestMeasurement,
  skipMeasurement,
  updatePlacementSigma,
} from '../measurements';

function project() {
  return createRoom(
    createProject('2026-11-05T10:00:00Z'),
    null,
    [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 3 },
      { x: 0, y: 3 },
    ],
    2.7,
  ).project;
}
const a = { vertex: 'v1' };
const b = { vertex: 'v2' };
describe('measurement editing', () => {
  it('queues, records and re-measures without overwriting the old reading or source project', () => {
    const original = project();
    const requested = requestMeasurement(original, 'b1', a, b);
    expect(original.blocks[0]!.measurements).toEqual([]);
    expect(requested.project.blocks[0]!.measurements[0]).toMatchObject({
      id: 'm1',
      value: null,
      status: 'queued',
    });
    const recorded = recordMeasurement(
      requested.project,
      'b1',
      requested.measurementId,
      4.04,
    );
    expect(recorded.measurementId).toBe('m1');
    const corrected = recordMeasurement(
      recorded.project,
      'b1',
      recorded.measurementId,
      4,
    );
    expect(corrected.measurementId).toBe('m2');
    expect(corrected.project.blocks[0]!.measurements).toMatchObject([
      { id: 'm1', value: 4.04, status: 'rejected' },
      { id: 'm2', value: 4, status: 'done' },
    ]);
    expect(recorded.project.blocks[0]!.measurements[0]!.status).toBe('done');
    expect(loadProject(saveProject(corrected.project))).toEqual(
      corrected.project,
    );
  });
  it('applies uncertainty edits to new readings and re-measurements only', () => {
    const queued = requestMeasurement(project(), 'b1', a, b).project;
    const recorded = recordMeasurement(queued, 'b1', 'm1', 4).project;
    const changed = updatePlacementSigma(recorded, 0.01);
    expect(changed.blocks[0]!.measurements[0]!.sigma).toBe(
      Math.hypot(0.002, 0.005),
    );
    const next = recordMeasurement(changed, 'b1', 'm1', 4).project;
    expect(next.blocks[0]!.measurements[1]!.sigma).toBe(
      Math.hypot(0.002, 0.01),
    );
    expect(measurementSigma(next)).toBe(Math.hypot(0.002, 0.01));
    expect(updatePlacementSigma(changed, 0.01)).toBe(changed);
    for (const value of [0, -1, NaN, Infinity])
      expect(() => updatePlacementSigma(changed, value)).toThrow();
  });
  it('skips and reorders active measurements while keeping rejected history', () => {
    let next = requestMeasurement(project(), 'b1', a, b).project;
    next = requestMeasurement(next, 'b1', a, { vertex: 'v3' }).project;
    next = skipMeasurement(next, 'b1', 'm1');
    expect(next.blocks[0]!.measurements[0]!.status).toBe('skipped');
    expect(skipMeasurement(next, 'b1', 'm1')).toBe(next);
    const recorded = recordMeasurement(next, 'b1', 'm1', 4).project;
    const moved = moveMeasurement(recorded, 'b1', 'm2', -1);
    expect(moved.blocks[0]!.measurements.map((item) => item.id)).toEqual([
      'm1',
      'm2',
      'm3',
    ]);
    expect(moved.blocks[0]!.measurements[0]!.status).toBe('rejected');
    expect(moveMeasurement(moved, 'b1', 'm2', -1)).toBe(moved);
    expect(skipMeasurement(recorded, 'b1', 'm3')).toBe(recorded);
  });
  it('validates IDs, endpoints and values before changing the project', () => {
    const source = project();
    expect(() => requestMeasurement(source, 'missing', a, b)).toThrow();
    expect(() => requestMeasurement(source, 'b1', a, a)).toThrow();
    expect(() =>
      requestMeasurement(source, 'b1', a, { vertex: 'missing' }),
    ).toThrow();
    const queued = requestMeasurement(source, 'b1', a, b).project;
    for (const value of [-1, 0, NaN, Infinity])
      expect(() => recordMeasurement(queued, 'b1', 'm1', value)).toThrow();
    expect(() => recordMeasurement(queued, 'b1', 'missing', 4)).toThrow();
    expect(() => skipMeasurement(queued, 'b1', 'missing')).toThrow();
    expect(() => moveMeasurement(queued, 'b1', 'missing', 1)).toThrow();
    const done = recordMeasurement(queued, 'b1', 'm1', 4).project;
    const redone = recordMeasurement(done, 'b1', 'm1', 4).project;
    expect(() => recordMeasurement(redone, 'b1', 'm1', 4)).toThrow();
  });
});
