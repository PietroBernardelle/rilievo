import { distance, roundCoordinate } from './geometry';
import { validateProject } from './json';
import { edgeEndpoints, pairedOpening, resolvePoint } from './points';
import type { Block, EdgeRef, Join, Opening, Project, Wall } from './types';

export const OPENING_SNAP = 0.05;
export const DEFAULT_JOIN_THICKNESS = 0.3;
export const DEFAULT_EXTERIOR_THICKNESS = 0.4;
export const OPENING_DEFAULTS: Record<
  Opening['type'],
  { width: number; height: number; sill: number }
> = {
  door: { width: 0.8, height: 2.1, sill: 0 },
  arch: { width: 1, height: 2.1, sill: 0 },
  window: { width: 1.2, height: 1.2, sill: 0.9 },
};
export type OpeningChanges = Partial<
  Pick<
    Opening,
    'type' | 'offset' | 'width' | 'height' | 'sill' | 'hinge' | 'swing'
  >
>;
export function snapOpening(value: number): number {
  return roundCoordinate(Math.round(value / OPENING_SNAP) * OPENING_SNAP);
}
export function replaceBlock(project: Project, block: Block): Project {
  const next = {
    ...project,
    blocks: project.blocks.map((item) => (item.id === block.id ? block : item)),
  };
  validateProject(next);
  return next;
}
function _block(project: Project, blockId: string): Block {
  const block = project.blocks.find((item) => item.id === blockId);
  if (!block) throw new Error(`Block ${blockId} does not exist.`);
  return block;
}
function _id(project: Project, prefix: 'o' | 'j'): string {
  const used = new Set(
    project.blocks.flatMap((block) => [
      ...(prefix === 'o' ? block.openings : block.joins).map((item) => item.id),
      ...block.measurements.flatMap((item) =>
        prefix === 'o'
          ? [item.a, item.b]
              .flatMap((ref) => ('jamb' in ref ? [ref.jamb] : []))
              .concat(
                item.target && 'openingId' in item.target
                  ? [item.target.openingId]
                  : [],
              )
          : item.target && 'joinId' in item.target
            ? [item.target.joinId]
            : [],
      ),
    ]),
  );
  let n = 1;
  while (used.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}
function _validateOpening(block: Block, opening: Opening): void {
  const length = distance(
    ...edgeEndpoints(block, [opening.roomId, opening.edge]),
  );
  if (
    ![opening.offset, opening.width, opening.height, opening.sill].every(
      Number.isFinite,
    )
  )
    throw new Error('Opening dimensions must be finite.');
  if (
    opening.offset < 0 ||
    opening.width < OPENING_SNAP ||
    opening.offset + opening.width > length + 0.0001
  )
    throw new Error(
      'The opening must fit inside its wall, with width at least 0.050 m.',
    );
  if (opening.height <= 0 || opening.sill < 0)
    throw new Error(
      'Opening height must be positive and sill cannot be negative.',
    );
  if (
    block.openings.some(
      (item) =>
        item.id !== opening.id &&
        item.roomId === opening.roomId &&
        item.edge === opening.edge &&
        item.offset < opening.offset + opening.width - 0.0001 &&
        item.offset + item.width > opening.offset + 0.0001,
    )
  )
    throw new Error('Openings on the same wall cannot overlap.');
}
export function openingJoin(block: Block, openingId: string): Join | undefined {
  return block.joins.find(
    (join) => join.via === openingId || join.pairedWith === openingId,
  );
}
export function oppositeOpening(
  block: Block,
  openingId: string,
): Opening | undefined {
  const join = openingJoin(block, openingId);
  return join
    ? pairedOpening(block, join.via, join.a, join.b, join.pairedWith).find(
        (item) => item.id !== openingId,
      )
    : undefined;
}
function _mirrored(block: Block, source: Opening, target: Opening): Opening {
  const [a, b] = edgeEndpoints(block, [target.roomId, target.edge]);
  const length = distance(a, b);
  const jamb = resolvePoint(
    {
      ...block,
      openings: block.openings.map((item) =>
        item.id === source.id ? source : item,
      ),
    },
    { jamb: source.id, side: 1 },
  );
  const offset =
    ((jamb.x - a.x) * (b.x - a.x) + (jamb.y - a.y) * (b.y - a.y)) / length;
  return {
    ...target,
    type: source.type,
    offset: roundCoordinate(offset),
    width: source.width,
    height: source.height,
    sill: source.sill,
    hinge: source.hinge === 1 ? 0 : 1,
    swing: source.swing === 'out' ? 'in' : 'out',
  };
}
export function createOpening(
  project: Project,
  blockId: string,
  edge: EdgeRef,
  type: Opening['type'],
  centre: number,
): { project: Project; openingId: string } {
  const block = _block(project, blockId);
  const length = distance(...edgeEndpoints(block, edge));
  const defaults = OPENING_DEFAULTS[type];
  const width = Math.min(
    defaults.width,
    Math.floor(length / OPENING_SNAP) * OPENING_SNAP,
  );
  const opening: Opening = {
    id: _id(project, 'o'),
    roomId: edge[0],
    edge: edge[1],
    type,
    ...defaults,
    width,
    offset: roundCoordinate(
      Math.max(0, Math.min(length - width, snapOpening(centre - width / 2))),
    ),
    hinge: 0,
    swing: 'in',
  };
  _validateOpening(block, opening);
  return {
    project: replaceBlock(project, {
      ...block,
      openings: [...block.openings, opening],
    }),
    openingId: opening.id,
  };
}
export function pairOpeningOnEdge(
  project: Project,
  blockId: string,
  openingId: string,
  edge: EdgeRef,
): Project {
  let block = _block(project, blockId);
  const source = block.openings.find((item) => item.id === openingId);
  if (!source) throw new Error('Choose an opening.');
  const target = _mirrored(block, source, {
    ...source,
    id: _id(project, 'o'),
    roomId: edge[0],
    edge: edge[1],
  });
  _validateOpening(block, target);
  block = { ...block, openings: [...block.openings, target] };
  return linkOpenings(
    replaceBlock(project, block),
    blockId,
    source.id,
    target.id,
  );
}
export function linkOpenings(
  project: Project,
  blockId: string,
  openingId: string,
  otherId: string,
): Project {
  const block = _block(project, blockId);
  const a = block.openings.find((item) => item.id === openingId);
  const b = block.openings.find((item) => item.id === otherId);
  if (
    !a ||
    !b ||
    a.roomId === b.roomId ||
    a.type === 'window' ||
    a.type !== b.type
  )
    throw new Error('Choose matching doors or arches in different rooms.');
  if (openingJoin(block, a.id) || openingJoin(block, b.id))
    throw new Error('Unlink the existing pair first.');
  const [a0, a1] = edgeEndpoints(block, [a.roomId, a.edge]);
  const [b0, b1] = edgeEndpoints(block, [b.roomId, b.edge]);
  const cosine =
    ((a1.x - a0.x) * (b1.x - b0.x) + (a1.y - a0.y) * (b1.y - b0.y)) /
    (distance(a0, a1) * distance(b0, b1));
  if (cosine > -Math.cos(Math.PI / 18))
    throw new Error(
      'Doorways must lie on facing walls (within 10° of parallel).',
    );
  const join: Join = {
    id: _id(project, 'j'),
    a: [a.roomId, a.edge],
    b: [b.roomId, b.edge],
    via: a.id,
    pairedWith: b.id,
    thickness: DEFAULT_JOIN_THICKNESS,
    measured: false,
  };
  return replaceBlock(project, { ...block, joins: [...block.joins, join] });
}
export function unlinkOpening(
  project: Project,
  blockId: string,
  openingId: string,
): Project {
  const block = _block(project, blockId);
  const join = openingJoin(block, openingId);
  if (!join) return project;
  return replaceBlock(project, {
    ...block,
    joins: block.joins.filter((item) => item.id !== join.id),
    measurements: block.measurements.map((item) =>
      item.target?.type === 'join-thickness' && item.target.joinId === join.id
        ? { ...item, status: 'rejected' }
        : item,
    ),
  });
}
export function updateOpening(
  project: Project,
  blockId: string,
  openingId: string,
  changes: OpeningChanges,
): Project {
  const block = _block(project, blockId);
  const original = block.openings.find((item) => item.id === openingId);
  if (!original) throw new Error('Choose an opening.');
  const opening = { ...original, ...changes };
  if (changes.type && changes.type !== 'window') opening.sill = 0;
  for (const key of ['offset', 'width', 'height', 'sill'] as const)
    opening[key] = roundCoordinate(opening[key]);
  _validateOpening(block, opening);
  const partner = oppositeOpening(block, openingId);
  if (partner && opening.type === 'window')
    throw new Error('Unlink the doorway before changing it to a window.');
  const mirror = partner ? _mirrored(block, opening, partner) : undefined;
  if (mirror) _validateOpening(block, mirror);
  if (JSON.stringify(original) === JSON.stringify(opening)) return project;
  return replaceBlock(project, {
    ...block,
    openings: block.openings.map((item) =>
      item.id === opening.id ? opening : item.id === mirror?.id ? mirror : item,
    ),
  });
}
export function removeOpenings(block: Block, ids: string[]): Block {
  const removed = new Set(ids);
  const joins = block.joins.filter((join) => {
    const pair = pairedOpening(
      block,
      join.via,
      join.a,
      join.b,
      join.pairedWith,
    );
    if (!pair.some((item) => removed.has(item.id))) return true;
    pair.forEach((item) => removed.add(item.id));
    return false;
  });
  const removedJoins = new Set(
    block.joins.filter((item) => !joins.includes(item)).map((item) => item.id),
  );
  return {
    ...block,
    joins,
    openings: block.openings.filter((item) => !removed.has(item.id)),
    measurements: block.measurements.map((item) =>
      [item.a, item.b].some((ref) => 'jamb' in ref && removed.has(ref.jamb)) ||
      (item.target &&
        'openingId' in item.target &&
        removed.has(item.target.openingId)) ||
      (item.target?.type === 'join-thickness' &&
        removedJoins.has(item.target.joinId))
        ? { ...item, status: 'rejected' }
        : item,
    ),
  };
}
export function deleteOpening(
  project: Project,
  blockId: string,
  openingId: string,
): Project {
  const block = _block(project, blockId);
  if (!block.openings.some((item) => item.id === openingId))
    throw new Error('Choose an opening.');
  return replaceBlock(project, removeOpenings(block, [openingId]));
}
export function wallThickness(
  block: Block,
  edge: EdgeRef,
): { value: number; measured: boolean; exterior: boolean } {
  const join = block.joins.find((item) =>
    [item.a, item.b].some(([id, index]) => id === edge[0] && index === edge[1]),
  );
  if (join)
    return {
      value: join.thickness,
      measured: join.measured !== false,
      exterior: false,
    };
  const wall = block.walls.find(
    (item) => item.roomId === edge[0] && item.edge === edge[1],
  );
  const measured = block.measurements.some(
    (item) =>
      item.status === 'done' &&
      item.target?.type === 'wall-thickness' &&
      block.openings.some(
        (opening) =>
          opening.id ===
            (item.target && 'openingId' in item.target
              ? item.target.openingId
              : '') &&
          opening.roomId === edge[0] &&
          opening.edge === edge[1],
      ),
  );
  return {
    value:
      wall?.thickness ??
      (wall?.exterior === false
        ? DEFAULT_JOIN_THICKNESS
        : DEFAULT_EXTERIOR_THICKNESS),
    measured,
    exterior: wall?.exterior ?? true,
  };
}
export function updateWall(
  project: Project,
  blockId: string,
  edge: EdgeRef,
  changes: Pick<Wall, 'thickness' | 'exterior'>,
): Project {
  const block = _block(project, blockId);
  edgeEndpoints(block, edge);
  if (
    changes.thickness !== undefined &&
    (!Number.isFinite(changes.thickness) || changes.thickness <= 0)
  )
    throw new Error('Wall thickness must be positive.');
  const join = block.joins.find((item) =>
    [item.a, item.b].some(([id, index]) => id === edge[0] && index === edge[1]),
  );
  if (join && changes.thickness !== undefined)
    return replaceBlock(project, {
      ...block,
      joins: block.joins.map((item) =>
        item.id === join.id
          ? { ...item, thickness: roundCoordinate(changes.thickness!) }
          : item,
      ),
    });
  const old = block.walls.find(
    (item) => item.roomId === edge[0] && item.edge === edge[1],
  );
  const wall = { ...old, roomId: edge[0], edge: edge[1], ...changes };
  return replaceBlock(project, {
    ...block,
    walls: [...block.walls.filter((item) => item !== old), wall],
  });
}
