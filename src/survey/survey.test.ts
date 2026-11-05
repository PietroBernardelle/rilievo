import { describe, expect, it } from 'vitest';
import sample from '../../examples/sample-project.json';
import { createProject, createRoom } from '../model/project';
import { loadProject, saveProject } from '../model/json';
import { commit, createHistory, redo, undo } from '../model/history';
import { distance, roomPoints } from '../model/geometry';
import { consistencyDiagnostics } from '../solver/diagnostics';
import { roomBlock } from '../solver/__tests__/fixtures';
import {
  ensureSurveyQueue,
  reachableDiagonal,
  roomStatus,
  surveyMeasurements,
} from './queue';
import {
  cornerName,
  measurementLabel,
  measurementPrompt,
  pickSurveyPoint,
  samePoints,
} from './points';
import {
  addCustomMeasurement,
  currentMeasurement,
  replaceBlockedPoint,
  selectMeasurement,
  skipCurrent,
  startSurvey,
  submitMeasurement,
  surveyBlock,
} from './session';
import type { EditorState } from './session';

function initial(): EditorState {
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
  return { project, survey: null };
}
function status(state: EditorState) {
  return consistencyDiagnostics(
    surveyBlock(state)!,
    state.project.settings.tolerance,
  ).rooms[0]!;
}
function measureRoom(badWall = false): EditorState {
  let state = startSurvey(initial(), 'b1');
  for (const value of [
    '3',
    badWall ? '4,040' : '4',
    '300cm',
    '4000mm',
    '5',
    '5',
    '2.7',
    '2.7',
  ])
    state = submitMeasurement(state, value);
  return state;
}
describe('rule-based survey', () => {
  it('can resume the supplied schema-1 sample, including its paired doorway', () => {
    const source: EditorState = {
      project: loadProject(JSON.stringify(sample)),
      survey: null,
    };
    const state = startSurvey(source, 'b1');
    expect(surveyMeasurements(surveyBlock(state)!)).toHaveLength(27);
    expect(currentMeasurement(state)?.id).toBe('m3');
    expect(surveyBlock(state)!.vertices.map((vertex) => vertex.sketch)).toEqual(
      source.project.blocks[0]!.vertices.map((vertex) => vertex.sketch),
    );
    expect(source.project).toEqual(loadProject(JSON.stringify(sample)));
  });
  it('queues walls clockwise from A then both diagonals, without duplicating a resumed queue', () => {
    const source = initial();
    const state = startSurvey(source, 'b1');
    const block = surveyBlock(state)!;
    expect(source.project.blocks[0]!.measurements).toEqual([]);
    expect(
      block.measurements
        .filter((item) => item.kind === 'distance')
        .map((item) => [item.a, item.b]),
    ).toEqual([
      [{ vertex: 'v1' }, { vertex: 'v4' }],
      [{ vertex: 'v4' }, { vertex: 'v3' }],
      [{ vertex: 'v3' }, { vertex: 'v2' }],
      [{ vertex: 'v2' }, { vertex: 'v1' }],
      [{ vertex: 'v1' }, { vertex: 'v3' }],
      [{ vertex: 'v2' }, { vertex: 'v4' }],
    ]);
    expect(ensureSurveyQueue(state.project, 'b1')).toBe(state.project);
    expect(
      startSurvey(state, 'b1').project.blocks[0]!.measurements,
    ).toHaveLength(8);
    expect(measurementPrompt(block, currentMeasurement(state)!)).toBe(
      'Measure ROOM 1: west wall, A → D',
    );
  });
  it('fits every entry, progresses through all four room states, and preserves the sketch', () => {
    let state = startSurvey(initial(), 'b1');
    const sketches = state.project.blocks[0]!.vertices.map(
      (vertex) => vertex.sketch,
    );
    for (const value of ['3', '4', '3', '4'])
      state = submitMeasurement(state, value);
    expect(roomStatus(status(state))).toBe('not rigid');
    state = submitMeasurement(state, '5');
    expect(roomStatus(status(state))).toBe('rigid but unchecked');
    expect(currentMeasurement(state)?.id).toBe('m6');
    state = submitMeasurement(state, '5');
    expect(roomStatus(status(state))).toBe('consistent');
    expect(currentMeasurement(state)?.target?.type).toBe('room-height');
    state = submitMeasurement(state, '2.7');
    state = submitMeasurement(state, '2.7');
    expect(currentMeasurement(state)).toBeUndefined();
    expect(surveyBlock(state)!.vertices.map((vertex) => vertex.sketch)).toEqual(
      sketches,
    );
    expect(
      distance(
        surveyBlock(state)!.vertices[0]!,
        surveyBlock(state)!.vertices[1]!,
      ),
    ).toBeCloseTo(4, 3);
    expect(roomStatus(status(measureRoom(true)))).toBe('inconsistent');
  });
  it('offers ordered suspects and re-measures a bad wall without losing its old value', () => {
    const bad = measureRoom(true);
    const diagnostics = status(bad);
    expect(diagnostics.suspectMeasurements.map((item) => item.id)).toContain(
      'm2',
    );
    expect(diagnostics.probableWrongMeasurementId).toBeNull();
    const scores = diagnostics.suspectMeasurements.map((item) =>
      Math.abs(item.standardizedResidual),
    );
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    const fixed = submitMeasurement(selectMeasurement(bad, 'm2'), '4');
    expect(roomStatus(status(fixed))).toBe('consistent');
    expect(status(fixed).suspectMeasurements).toEqual([]);
    expect(
      surveyBlock(fixed)!.measurements.find((item) => item.id === 'm2'),
    ).toMatchObject({ value: 4.04, status: 'rejected' });
    expect(surveyMeasurements(surveyBlock(fixed)!)).toHaveLength(8);
  });
  it('undoes and redoes a reading, geometry and queue cursor as one transaction', () => {
    const state = startSurvey(initial(), 'b1');
    const after = submitMeasurement(state, '3');
    const history = commit(createHistory(state), after);
    expect(undo(history).present).toEqual(state);
    expect(redo(undo(history)).present).toEqual(after);
    expect(currentMeasurement(undo(history).present)?.id).toBe('m1');
    expect(currentMeasurement(redo(undo(history)).present)?.id).toBe('m2');
    expect(() => submitMeasurement(state, '3.4.2')).toThrow();
    expect(() => submitMeasurement(state, '0')).toThrow();
    expect(currentMeasurement(state)?.status).toBe('queued');
  });
  it('skips inaccessible distances, permits revisiting them and restores the queue from JSON', () => {
    const first = startSurvey(initial(), 'b1');
    let state = skipCurrent(first);
    expect(currentMeasurement(state)?.id).toBe('m2');
    expect(surveyBlock(state)!.measurements[0]!.status).toBe('skipped');
    for (const value of ['4', '3', '4', '5', '5', '2.7', '2.7'])
      state = submitMeasurement(state, value);
    expect(roomStatus(status(state))).toBe('rigid but unchecked');
    const restored = startSurvey(
      { project: loadProject(saveProject(state.project)), survey: null },
      'b1',
    );
    expect(currentMeasurement(restored)).toBeUndefined();
    state = submitMeasurement(selectMeasurement(restored, 'm1'), '3');
    expect(roomStatus(status(state))).toBe('consistent');
    expect(
      undo(commit(createHistory(first), skipCurrent(first))).present,
    ).toEqual(first);
  });
  it('replaces either blocked endpoint with a schema-1 edge point and can undo it', () => {
    const state = startSurvey(initial(), 'b1');
    const point = { edgePoint: ['r1', 3] as [string, number], t: 0.5 };
    const alternative = replaceBlockedPoint(state, 'a', point);
    expect(surveyBlock(alternative)!.measurements[0]!.status).toBe('skipped');
    expect(currentMeasurement(alternative)).toMatchObject({
      a: point,
      b: { vertex: 'v4' },
      status: 'queued',
    });
    const entered = submitMeasurement(alternative, '1.5');
    expect(
      surveyBlock(entered)!.measurements.find((item) => item.id === 'm9')!
        .status,
    ).toBe('done');
    expect(undo(commit(createHistory(state), alternative)).present).toEqual(
      state,
    );
    expect(
      currentMeasurement(replaceBlockedPoint(state, 'b', point))!.b,
    ).toEqual(point);
    expect(() => replaceBlockedPoint(state, 'a', { vertex: 'v2' })).toThrow();
  });
  it('allows custom points and queue selection without discarding unfinished work', () => {
    const state = startSurvey(initial(), 'b1');
    const custom = addCustomMeasurement(
      state,
      { vertex: 'v1' },
      { edgePoint: ['r1', 1], t: 0.5 },
    );
    expect(currentMeasurement(custom)!.id).toBe('m9');
    expect(surveyBlock(custom)!.measurements).toHaveLength(9);
    expect(currentMeasurement(selectMeasurement(custom, 'm3'))!.id).toBe('m3');
    expect(() =>
      addCustomMeasurement(state, { vertex: 'v1' }, { vertex: 'v1' }),
    ).toThrow();
    expect(() => selectMeasurement(state, 'missing')).toThrow();
    expect(() =>
      startSurvey({ project: createProject('2026-11-05'), survey: null }, 'b1'),
    ).toThrow();
  });
  it('builds queues per room and starts with the selected room', () => {
    const state = initial();
    state.project = createRoom(
      state.project,
      'b1',
      [
        { x: 6, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 3 },
        { x: 6, y: 3 },
      ],
      2.7,
    ).project;
    const survey = startSurvey(state, 'b1', 'r2');
    expect(surveyBlock(survey)!.measurements).toHaveLength(16);
    expect(currentMeasurement(survey)!.a).toEqual({ vertex: 'v5' });
  });
  it('adds independent, reachable diagonals for a concave room plus a check', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 2 },
      { x: 3, y: 2 },
      { x: 3, y: 4 },
      { x: 0, y: 4 },
    ];
    const source = {
      project: createRoom(createProject('2026-11-05'), null, points, 2.7)
        .project,
      survey: null,
    };
    let state = startSurvey(source, 'b1');
    expect(surveyBlock(state)!.measurements.length).toBe(12);
    let count = 0;
    while (currentMeasurement(state) && count++ < 20) {
      const current = currentMeasurement(state)!;
      if (current.kind === 'height') {
        state = submitMeasurement(state, '2.7');
        continue;
      }
      if (!('vertex' in current.a) || !('vertex' in current.b))
        throw new Error('Expected corners.');
      const a = points[Number(current.a.vertex.slice(1)) - 1]!;
      const b = points[Number(current.b.vertex.slice(1)) - 1]!;
      expect(reachableDiagonal(points, a, b)).toBe(true);
      state = submitMeasurement(state, distance(a, b).toString());
    }
    expect(count).toBe(12);
    expect(status(state)).toMatchObject({
      rigid: true,
      consistent: true,
      redundancy: 1,
    });
    expect(reachableDiagonal(points, points[2]!, points[4]!)).toBe(false);
  });
});
describe('survey point picking and labels', () => {
  it('picks corners, jambs and precise edge fractions, but no empty space', () => {
    const block = roomBlock([
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 3 },
      { x: 0, y: 3 },
    ]);
    expect(pickSurveyPoint(block, { x: 0.01, y: 0 }, 0.1)).toEqual({
      vertex: 'v1',
    });
    expect(pickSurveyPoint(block, { x: 2, y: 0.02 }, 0.1, true)).toEqual({
      edgePoint: ['r1', 0],
      t: 0.5,
    });
    expect(pickSurveyPoint(block, { x: 2, y: 2 }, 0.1)).toBeNull();
    expect(pickSurveyPoint(block, { x: 0, y: 0 }, 0.1, true)).toBeNull();
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
    expect(pickSurveyPoint(block, { x: 1.8, y: 0 }, 0.1)).toEqual({
      jamb: 'o1',
      side: 1,
    });
    expect(cornerName(26)).toBe('AA');
    expect(
      measurementLabel(block, {
        a: { jamb: 'o1', side: 0 },
        b: { edgePoint: ['r1', 0], t: 0.5 },
      }),
    ).toContain('jamb o1/1 → point on A–B');
    expect(
      samePoints(
        { edgePoint: ['r1', 0], t: 0.5 },
        { edgePoint: ['r1', 0], t: 0.5 },
      ),
    ).toBe(true);
    expect(samePoints({ jamb: 'o1', side: 0 }, { jamb: 'o1', side: 1 })).toBe(
      false,
    );
    expect(roomPoints(block, block.rooms[0]!, false)).toHaveLength(4);
  });
});
