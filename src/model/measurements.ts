import { validateProject } from './json';
import type { Block, Measurement, PointRef, Project } from './types';

export function measurementSigma(project: Project): number {
  return Math.hypot(
    project.settings.laserSigma,
    project.settings.placementSigma,
  );
}
function _block(project: Project, blockId: string): Block {
  const block = project.blocks.find((item) => item.id === blockId);
  if (!block) throw new Error(`Block ${blockId} does not exist.`);
  return block;
}
function _replace(project: Project, block: Block): Project {
  const next = {
    ...project,
    blocks: project.blocks.map((item) => (item.id === block.id ? block : item)),
  };
  validateProject(next);
  return next;
}
function _id(project: Project): string {
  const used = new Set(
    project.blocks.flatMap((block) =>
      block.measurements.map((item) => item.id),
    ),
  );
  let index = 1;
  while (used.has(`m${index}`)) index++;
  return `m${index}`;
}
export function requestMeasurement(
  project: Project,
  blockId: string,
  a: PointRef,
  b: PointRef,
  note = '',
): { project: Project; measurementId: string } {
  if (JSON.stringify(a) === JSON.stringify(b))
    throw new Error('Choose two different points.');
  const block = _block(project, blockId);
  const measurement: Measurement = {
    id: _id(project),
    kind: 'distance',
    a,
    b,
    value: null,
    sigma: measurementSigma(project),
    status: 'queued',
    note,
  };
  return {
    project: _replace(project, {
      ...block,
      measurements: [...block.measurements, measurement],
    }),
    measurementId: measurement.id,
  };
}
export function recordMeasurement(
  project: Project,
  blockId: string,
  id: string,
  value: number,
): { project: Project; measurementId: string } {
  if (!Number.isFinite(value) || value <= 0)
    throw new Error('Measurement must be greater than zero.');
  const block = _block(project, blockId);
  const previous = block.measurements.find((item) => item.id === id);
  if (!previous || previous.status === 'rejected')
    throw new Error('Choose an active measurement.');
  const fresh = previous.status !== 'queued' || previous.value !== null;
  const measurement: Measurement = {
    ...previous,
    id: fresh ? _id(project) : previous.id,
    value,
    sigma: measurementSigma(project),
    status: 'done',
  };
  const measurements = block.measurements.flatMap((item): Measurement[] =>
    item.id !== id
      ? [item]
      : fresh
        ? [{ ...item, status: 'rejected' }, measurement]
        : [measurement],
  );
  return {
    project: _replace(project, { ...block, measurements }),
    measurementId: measurement.id,
  };
}
export function skipMeasurement(
  project: Project,
  blockId: string,
  id: string,
): Project {
  const block = _block(project, blockId);
  const item = block.measurements.find((measurement) => measurement.id === id);
  if (!item || item.status === 'rejected')
    throw new Error('Choose an active measurement.');
  if (item.status !== 'queued') return project;
  return _replace(project, {
    ...block,
    measurements: block.measurements.map((measurement) =>
      measurement.id === id
        ? { ...measurement, status: 'skipped' }
        : measurement,
    ),
  });
}
export function moveMeasurement(
  project: Project,
  blockId: string,
  id: string,
  direction: -1 | 1,
): Project {
  const block = _block(project, blockId);
  const active = block.measurements.filter(
    (item) => item.status !== 'rejected',
  );
  const index = active.findIndex((item) => item.id === id);
  if (index < 0) throw new Error('Choose an active measurement.');
  const other = active[index + direction];
  if (!other) return project;
  const measurements = [...block.measurements];
  const a = measurements.findIndex((item) => item.id === id);
  const b = measurements.indexOf(other);
  [measurements[a], measurements[b]] = [measurements[b]!, measurements[a]!];
  return _replace(project, { ...block, measurements });
}
export function updatePlacementSigma(
  project: Project,
  placementSigma: number,
): Project {
  if (!Number.isFinite(placementSigma) || placementSigma <= 0)
    throw new Error('Placement uncertainty must be greater than zero.');
  if (placementSigma === project.settings.placementSigma) return project;
  const next = {
    ...project,
    settings: { ...project.settings, placementSigma },
  };
  validateProject(next);
  return next;
}
