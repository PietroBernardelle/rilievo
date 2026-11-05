import { describe, expect, it } from 'vitest';
import sample from '../../../examples/sample-project.json';
import { createProject, createRoom } from '../project';
import { loadProject, saveProject } from '../json';
import {
  createOpening,
  deleteOpening,
  updateOpening,
  updateWall,
  wallThickness,
} from '../openings';
import { requestMeasurement, recordMeasurement } from '../measurements';
import { roomHeightReadings } from '../heights';
import { ensureSurveyQueue } from '../../survey/queue';

function project() {
  return createRoom(
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
}
describe('M4 model and migration', () => {
  it('preserves version-1 geometry, measurements and joins while adding explicit pairing', () => {
    const original = JSON.stringify(sample);
    const migrated = loadProject(original);
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.blocks[0]!.vertices).toEqual(sample.blocks[0]!.vertices);
    expect(migrated.blocks[0]!.measurements).toEqual(
      sample.blocks[0]!.measurements,
    );
    expect(migrated.blocks[0]!.joins[0]).toMatchObject({
      pairedWith: 'o3',
      measured: true,
      thickness: 0.3,
    });
    expect(migrated.blocks[0]!.openings[0]).toMatchObject({
      hinge: 0,
      swing: 'in',
    });
    expect(JSON.stringify(sample)).toBe(original);
    expect(saveProject(loadProject(saveProject(migrated)))).toBe(
      saveProject(migrated),
    );
    const ambiguous = structuredClone(sample);
    ambiguous.blocks[0]!.openings.push({
      ...ambiguous.blocks[0]!.openings[2]!,
      id: 'o4',
    });
    expect(() => loadProject(JSON.stringify(ambiguous))).toThrow(
      /expected one matching doorway/,
    );
  });
  it('validates dimensions and overlapping openings, and never reuses deleted jamb IDs in history', () => {
    const created = createOpening(project(), 'b1', ['r1', 0], 'door', 1);
    expect(() =>
      createOpening(created.project, 'b1', ['r1', 0], 'window', 1),
    ).toThrow(/overlap/);
    for (const changes of [
      { offset: -1 },
      { width: 0 },
      { height: 0 },
      { sill: -1 },
      { width: Infinity },
      { offset: 4 },
    ])
      expect(() =>
        updateOpening(created.project, 'b1', created.openingId, changes),
      ).toThrow();
    const queued = requestMeasurement(
      created.project,
      'b1',
      { vertex: 'v1' },
      { jamb: created.openingId, side: 0 },
    );
    const recorded = recordMeasurement(
      queued.project,
      'b1',
      queued.measurementId,
      0.6,
    ).project;
    const removed = deleteOpening(recorded, 'b1', created.openingId);
    expect(removed.blocks[0]!.measurements[0]).toMatchObject({
      value: 0.6,
      status: 'rejected',
    });
    expect(
      createOpening(removed, 'b1', ['r1', 0], 'arch', 1).openingId,
    ).not.toBe(created.openingId);
    expect(loadProject(saveProject(removed))).toEqual(removed);
  });
  it('stores zero sill and offset values, supports re-measured heights, and keeps unrelated manual edits', () => {
    let next = createOpening(project(), 'b1', ['r1', 0], 'window', 1).project;
    const point = { jamb: 'o1', side: 0 as const };
    const sill = requestMeasurement(next, 'b1', point, point, '', {
      kind: 'height',
      target: { type: 'sill', openingId: 'o1' },
    });
    next = recordMeasurement(sill.project, 'b1', sill.measurementId, 0).project;
    expect(next.blocks[0]!.openings[0]!.sill).toBe(0);
    next = updateOpening(next, 'b1', 'o1', { height: 1.6 });
    const heightIds: string[] = [];
    for (const [id, value] of [
      ['v1', 2.7],
      ['v3', 2.72],
    ] as const) {
      const requested = requestMeasurement(
        next,
        'b1',
        { vertex: id },
        { vertex: id },
        '',
        { kind: 'height', target: { type: 'room-height', roomId: 'r1' } },
      );
      heightIds.push(requested.measurementId);
      next = recordMeasurement(
        requested.project,
        'b1',
        requested.measurementId,
        value,
      ).project;
    }
    expect(roomHeightReadings(next.blocks[0]!, 'r1').sloping).toBe(false);
    next = recordMeasurement(next, 'b1', heightIds[1]!, 2.73).project;
    expect(roomHeightReadings(next.blocks[0]!, 'r1').sloping).toBe(true);
    expect(next.blocks[0]!.rooms[0]!.height).toBeCloseTo(2.715);
    expect(next.blocks[0]!.openings[0]!.height).toBe(1.6);
    expect(
      next.blocks[0]!.measurements.find((item) => item.id === heightIds[1])
        ?.status,
    ).toBe('rejected');
    const offset = requestMeasurement(next, 'b1', { vertex: 'v1' }, point, '', {
      kind: 'offset',
    });
    expect(
      recordMeasurement(
        offset.project,
        'b1',
        offset.measurementId,
        0,
      ).project.blocks[0]!.measurements.at(-1)?.value,
    ).toBe(0);
  });
  it('inserts an opening added mid-survey before room heights without reordering existing readings', () => {
    const original = ensureSurveyQueue(project(), 'b1');
    const created = createOpening(original, 'b1', ['r1', 0], 'window', 1);
    const next = ensureSurveyQueue(created.project, 'b1');
    const queue = next.blocks[0]!.measurements;
    expect(
      queue.slice(6).map((item) => item.target?.type ?? item.kind),
    ).toEqual([
      'offset',
      'offset',
      'opening-height',
      'sill',
      'wall-thickness',
      'room-height',
      'room-height',
    ]);
    const originalIds = original.blocks[0]!.measurements.map((item) => item.id);
    expect(
      queue
        .filter((item) => originalIds.includes(item.id))
        .map((item) => item.id),
    ).toEqual(originalIds);
    expect(ensureSurveyQueue(next, 'b1')).toBe(next);
  });
  it('edits per-edge thickness and validates scalar target references', () => {
    const created = createOpening(
      project(),
      'b1',
      ['r1', 0],
      'door',
      1,
    ).project;
    const block = created.blocks[0]!;
    expect(wallThickness(block, ['r1', 0])).toEqual({
      value: 0.4,
      exterior: true,
      measured: false,
    });
    const updated = updateWall(created, 'b1', ['r1', 0], {
      thickness: 0.5,
      exterior: false,
    });
    expect(wallThickness(updated.blocks[0]!, ['r1', 0])).toMatchObject({
      value: 0.5,
      exterior: false,
    });
    expect(() =>
      updateWall(created, 'b1', ['r1', 0], { thickness: -1 }),
    ).toThrow();
    const invalid = structuredClone(updated);
    invalid.blocks[0]!.measurements.push({
      id: 'm1',
      kind: 'height',
      a: { vertex: 'v1' },
      b: { vertex: 'v1' },
      value: 2,
      sigma: 0.005,
      status: 'done',
      note: '',
      target: { type: 'opening-height', openingId: 'missing' },
    });
    expect(() => loadProject(JSON.stringify(invalid))).toThrow(
      /missing target/,
    );
  });
});
