import { describe, expect, it } from 'vitest';
import { createProject, createRoom } from '../model/project';
import {
  deleteOpening,
  updateOpening,
  unlinkOpening,
  linkOpenings,
  wallThickness,
} from '../model/openings';
import { roomHeightReadings } from '../model/heights';
import { loadProject, saveProject } from '../model/json';
import { createHistory, commit, undo, redo } from '../model/history';
import { distance } from '../model/geometry';
import { resolvePoint } from '../model/points';
import type { Block, Measurement, Project } from '../model/types';
import { placeOpening, openingDrag } from './openings';
import { sketchContacts } from '../solver/contacts';
import { fit } from '../solver';
import {
  currentMeasurement,
  startSurvey,
  submitMeasurement,
  surveyBlock,
} from '../survey/session';
import type { EditorState } from '../survey/session';
import { ensureSurveyQueue } from '../survey/queue';

function rooms(two = true): Project {
  let project = createProject('2026-11-05T10:00:00Z');
  for (const [x, width] of (two
    ? [
        [0, 4.1],
        [4.1, 3.1],
      ]
    : [[0, 4.1]]) as [number, number][])
    project = createRoom(
      project,
      project.blocks[0]?.id ?? null,
      [
        { x, y: 0 },
        { x: x + width, y: 0 },
        { x: x + width, y: 2.9 },
        { x, y: 2.9 },
      ],
      2.7,
    ).project;
  return project;
}
function doorway(): Project {
  return placeOpening(rooms(), 'b1', ['r1', 1], 'door', 1.2).project;
}
function reading(block: Block, item: Measurement): number {
  if (item.target) {
    if (item.target.type === 'join-thickness') return 0.3;
    if (item.target.type === 'room-height')
      return 'vertex' in item.a && ['v3', 'v7'].includes(item.a.vertex)
        ? 2.74
        : 2.7;
    if (item.target.type === 'sill') return 0.85;
    if (item.target.type === 'wall-thickness') return 0.45;
    return 2.1;
  }
  if ('vertex' in item.a && 'jamb' in item.b) {
    const opening = block.openings.find(
      (entry) => entry.id === ('jamb' in item.b ? item.b.jamb : ''),
    )!;
    const room = block.rooms.find((entry) => entry.id === opening.roomId)!;
    const isStart = room.vertexIds[opening.edge] === item.a.vertex;
    const offset = opening.id === 'o1' ? 0.8 : 0.5;
    const along = offset + item.b.side * 0.8;
    return isStart ? along : 3 - along;
  }
  const room = block.rooms.find(
    (entry) => 'vertex' in item.a && entry.vertexIds.includes(item.a.vertex),
  )!;
  const width = room.id === 'r1' ? 4 : 3;
  const points = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: 3 },
    { x: 0, y: 3 },
  ];
  return distance(
    points[room.vertexIds.indexOf('vertex' in item.a ? item.a.vertex : '')]!,
    points[room.vertexIds.indexOf('vertex' in item.b ? item.b.vertex : '')]!,
  );
}

describe('M4 openings and survey transactions', () => {
  it('rejects an obstructed paired doorway atomically instead of silently leaving it unpaired', () => {
    const source = placeOpening(
      rooms(),
      'b1',
      ['r2', 3],
      'window',
      1.7,
    ).project;
    expect(() => placeOpening(source, 'b1', ['r1', 1], 'door', 1.2)).toThrow(
      /overlap/,
    );
    expect(source.blocks[0]!.openings).toHaveLength(1);
    expect(source.blocks[0]!.joins).toEqual([]);
  });
  it.each(['door', 'arch'] as const)(
    'places a paired %s and an unmeasured join on a contact edge',
    (type) => {
      const source = rooms();
      const result = placeOpening(source, 'b1', ['r1', 1], type, 1.2);
      const block = result.project.blocks[0]!;
      expect(source.blocks[0]!.openings).toEqual([]);
      expect(block.openings).toHaveLength(2);
      expect(block.joins[0]).toMatchObject({
        via: 'o1',
        pairedWith: 'o2',
        thickness: 0.3,
        measured: false,
      });
      expect(sketchContacts(block)).toEqual([]);
      const fitted = fit(block);
      expect(fitted.converged).toBe(true);
      expect(
        distance(
          resolvePoint(fitted.block, { jamb: 'o1', side: 0 }),
          resolvePoint(fitted.block, { jamb: 'o2', side: 1 }),
        ),
      ).toBeLessThan(0.001);
      expect(
        undo(commit(createHistory(source), result.project)).present,
      ).toEqual(source);
      expect(
        redo(undo(commit(createHistory(source), result.project))).present,
      ).toEqual(result.project);
    },
  );
  it('edits, snaps, resizes and manually unlinks/links a pair without mutating history', () => {
    const source = doorway();
    const block = source.blocks[0]!;
    expect(
      openingDrag(block, block.openings[0]!, 'move', 0.073).offset,
    ).toBeCloseTo(0.85);
    expect(
      openingDrag(block, block.openings[0]!, 'end', 0.126).width,
    ).toBeCloseTo(0.95);
    expect(openingDrag(block, block.openings[0]!, 'start', 0.126)).toEqual({
      offset: 0.95,
      width: 0.65,
    });
    const edited = updateOpening(source, 'b1', 'o1', {
      offset: 0.9,
      width: 0.9,
      hinge: 1,
      swing: 'out',
    });
    expect(edited.blocks[0]!.openings[1]).toMatchObject({
      width: 0.9,
      hinge: 0,
      swing: 'in',
    });
    expect(() => updateOpening(source, 'b1', 'o1', { width: 10 })).toThrow(
      /inside its wall/,
    );
    const unlinked = unlinkOpening(edited, 'b1', 'o1');
    expect(unlinked.blocks[0]!.openings).toHaveLength(2);
    expect(unlinked.blocks[0]!.joins).toEqual([]);
    expect(
      linkOpenings(unlinked, 'b1', 'o1', 'o2').blocks[0]!.joins,
    ).toHaveLength(1);
    expect(loadProject(saveProject(edited))).toEqual(edited);
  });
  it('fits solver case 6 through the same start/type/Enter flow as the UI', () => {
    let state: EditorState = startSurvey(
      { project: doorway(), survey: null },
      'b1',
    );
    expect(
      surveyBlock(state)!
        .measurements.slice(6, 12)
        .map((item) => item.target?.type ?? item.kind),
    ).toEqual([
      'offset',
      'offset',
      'opening-height',
      'room-height',
      'room-height',
      'join-thickness',
    ]);
    let count = 0;
    while (currentMeasurement(state) && count++ < 40) {
      const current = currentMeasurement(state)!;
      state = submitMeasurement(
        state,
        reading(surveyBlock(state)!, current).toFixed(6),
      );
    }
    expect(currentMeasurement(state)).toBeUndefined();
    const block = surveyBlock(state)!;
    expect(block.joins[0]).toMatchObject({ thickness: 0.3, measured: true });
    expect(block.vertices[4]!.x - block.vertices[1]!.x).toBeCloseTo(0.3, 3);
    expect(block.vertices[4]!.y).toBeCloseTo(-0.9, 3);
    for (const side of [0, 1] as const) {
      const a = resolvePoint(block, { jamb: 'o1', side });
      const b = resolvePoint(block, { jamb: 'o2', side: side === 0 ? 1 : 0 });
      expect(b.x - a.x).toBeCloseTo(0.3, 3);
      expect(b.y - a.y).toBeCloseTo(0, 3);
    }
    expect(
      block.openings.every((item) => Math.abs(item.width - 0.8) < 0.001),
    ).toBe(true);
    expect(roomHeightReadings(block, 'r1').sloping).toBe(true);
    expect(block.rooms[0]!.height).toBeCloseTo(2.72, 6);
    const removed = deleteOpening(state.project, 'b1', 'o2');
    expect(removed.blocks[0]!.openings).toEqual([]);
    expect(removed.blocks[0]!.joins).toEqual([]);
    expect(removed.blocks[0]!.measurements).toHaveLength(
      block.measurements.length,
    );
    expect(
      removed.blocks[0]!.measurements.filter(
        (item) => 'jamb' in item.a || 'jamb' in item.b,
      ).every((item) => item.status === 'rejected'),
    ).toBe(true);
    expect(saveProject(loadProject(saveProject(removed)))).toBe(
      saveProject(removed),
    );
  });
  it('fits window offset and width from two jamb readings, stores heights and window wall thickness', () => {
    const created = placeOpening(rooms(false), 'b1', ['r1', 1], 'window', 1.2);
    expect(created.project.blocks[0]!.joins).toEqual([]);
    let state = startSurvey({ project: created.project, survey: null }, 'b1');
    let count = 0;
    while (currentMeasurement(state) && count++ < 20)
      state = submitMeasurement(
        state,
        reading(surveyBlock(state)!, currentMeasurement(state)!).toFixed(6),
      );
    expect(currentMeasurement(state)).toBeUndefined();
    const block = surveyBlock(state)!;
    expect(block.openings[0]!.offset).toBeCloseTo(0.8, 3);
    expect(block.openings[0]!.width).toBeCloseTo(0.8, 3);
    expect(block.openings[0]).toMatchObject({ height: 2.1, sill: 0.85 });
    expect(wallThickness(block, ['r1', 1])).toMatchObject({
      value: 0.45,
      measured: true,
    });
    expect(fit(block).residuals).toHaveLength(8);
    expect(ensureSurveyQueue(state.project, 'b1')).toBe(state.project);
  });
});
