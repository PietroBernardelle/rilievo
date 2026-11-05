import { distance, parseLength } from '../model/geometry';
import {
  recordMeasurement,
  requestMeasurement,
  skipMeasurement,
} from '../model/measurements';
import type { Block, Measurement, PointRef, Project } from '../model/types';
import { fit } from '../solver';
import { resolvePoint } from '../solver/geometry';
import { ensureSurveyQueue, firstPending, surveyMeasurements } from './queue';

export interface SurveySession {
  blockId: string;
  currentId: string | null;
  lastId: string | null;
}
export interface EditorState {
  project: Project;
  survey: SurveySession | null;
}
export function surveyBlock(state: EditorState): Block | undefined {
  return state.project.blocks.find(
    (block) => block.id === state.survey?.blockId,
  );
}
export function currentMeasurement(
  state: EditorState,
): Measurement | undefined {
  const block = surveyBlock(state);
  if (!block) return undefined;
  return surveyMeasurements(block).find(
    (item) => item.id === state.survey?.currentId,
  );
}
function _fit(project: Project, blockId: string): Project {
  const block = project.blocks.find((item) => item.id === blockId);
  if (!block) throw new Error('Choose a block to survey.');
  const result = fit(block, { tolerance: project.settings.tolerance });
  if (!result.converged)
    throw new Error(
      'Fit did not converge. The reading was not saved; check the value or choose another measurement.',
    );
  return {
    ...project,
    blocks: project.blocks.map((item) =>
      item.id === blockId ? result.block : item,
    ),
  };
}
export function startSurvey(
  state: EditorState,
  blockId: string,
  roomId?: string,
): EditorState {
  const block = state.project.blocks.find((item) => item.id === blockId);
  if (!block?.rooms.length)
    throw new Error('Draw a room before starting the survey.');
  const project = ensureSurveyQueue(_fit(state.project, blockId), blockId);
  const fitted = project.blocks.find((item) => item.id === blockId)!;
  return {
    project,
    survey: {
      blockId,
      currentId:
        firstPending(
          fitted,
          fitted.rooms.find((room) => room.id === roomId),
        ) ?? firstPending(fitted),
      lastId: null,
    },
  };
}
export function selectMeasurement(state: EditorState, id: string): EditorState {
  const block = surveyBlock(state);
  if (!block || !surveyMeasurements(block).some((item) => item.id === id))
    throw new Error('Choose an active measurement.');
  return { ...state, survey: { ...state.survey!, currentId: id } };
}
function _advance(
  state: EditorState,
  project: Project,
  previousId: string,
  lastId = state.survey!.lastId,
): EditorState {
  const block = project.blocks.find(
    (item) => item.id === state.survey!.blockId,
  )!;
  const queue = surveyMeasurements(block);
  const previous = queue.findIndex((item) => item.id === previousId);
  const pending = [
    ...queue.slice(previous + 1),
    ...queue.slice(0, previous + 1),
  ].find((item) => item.status === 'queued');
  return {
    project,
    survey: { ...state.survey!, currentId: pending?.id ?? null, lastId },
  };
}
export function submitMeasurement(
  state: EditorState,
  text: string,
): EditorState {
  const current = currentMeasurement(state);
  if (!current || !state.survey) throw new Error('Choose a measurement first.');
  const value = parseLength(text);
  const recorded = recordMeasurement(
    state.project,
    state.survey.blockId,
    current.id,
    value,
  );
  const project = ensureSurveyQueue(
    _fit(recorded.project, state.survey.blockId),
    state.survey.blockId,
  );
  return _advance(
    state,
    project,
    recorded.measurementId,
    recorded.measurementId,
  );
}
export function skipCurrent(state: EditorState): EditorState {
  const current = currentMeasurement(state);
  if (!current || !state.survey) return state;
  return _advance(
    state,
    ensureSurveyQueue(
      skipMeasurement(state.project, state.survey.blockId, current.id),
      state.survey.blockId,
    ),
    current.id,
  );
}
export function addCustomMeasurement(
  state: EditorState,
  a: PointRef,
  b: PointRef,
): EditorState {
  const block = surveyBlock(state);
  if (!block || distance(resolvePoint(block, a), resolvePoint(block, b)) < 1e-6)
    throw new Error('Choose two different points on the drawing.');
  const requested = requestMeasurement(
    state.project,
    block.id,
    a,
    b,
    'Custom measurement',
  );
  return {
    project: requested.project,
    survey: { ...state.survey!, currentId: requested.measurementId },
  };
}
export function replaceBlockedPoint(
  state: EditorState,
  end: 'a' | 'b',
  point: PointRef,
): EditorState {
  const current = currentMeasurement(state);
  const block = surveyBlock(state);
  if (!current || !block)
    throw new Error('Choose the blocked measurement first.');
  if (!('edgePoint' in point) || point.t <= 0 || point.t >= 1)
    throw new Error('Pick a point inside an edge.');
  const a = end === 'a' ? point : current.a;
  const b = end === 'b' ? point : current.b;
  if (distance(resolvePoint(block, a), resolvePoint(block, b)) < 1e-6)
    throw new Error('Choose two different points.');
  const skipped = skipMeasurement(state.project, block.id, current.id);
  const requested = requestMeasurement(
    skipped,
    block.id,
    a,
    b,
    `Alternative to ${current.id}: blocked ${end === 'a' ? 'start' : 'end'}`,
  );
  return {
    project: requested.project,
    survey: { ...state.survey!, currentId: requested.measurementId },
  };
}
