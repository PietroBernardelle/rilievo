import {
  distance,
  nearestOnSegment,
  roomPoints,
  roundCoordinate,
} from '../model/geometry';
import {
  createOpening,
  pairOpeningOnEdge,
  snapOpening,
  OPENING_SNAP,
} from '../model/openings';
import { edgeEndpoints, resolvePoint } from '../model/points';
import type { Block, EdgeRef, Opening, Point, Project } from '../model/types';
import { sketchContacts } from '../solver/contacts';

export function pickEdge(
  block: Block,
  point: Point,
  radius: number,
  preferredRoomId?: string,
): { edge: EdgeRef; offset: number; point: Point } | null {
  let best: ReturnType<typeof pickEdge> = null;
  let nearest = radius;
  const rooms = [...block.rooms].sort(
    (a, b) =>
      Number(a.id === preferredRoomId) - Number(b.id === preferredRoomId),
  );
  for (const room of rooms) {
    const points = roomPoints(block, room, false);
    for (let i = 0; i < points.length; i++) {
      const a = points[i]!;
      const b = points[(i + 1) % points.length]!;
      const projected = nearestOnSegment(point, a, b);
      const gap = distance(point, projected);
      if (gap <= nearest + 1e-9) {
        nearest = gap;
        best = {
          edge: [room.id, i],
          offset: distance(a, projected),
          point: projected,
        };
      }
    }
  }
  return best;
}
export function contactedEdges(block: Block, edge: EdgeRef): EdgeRef[] {
  const rooms = new Set(
    sketchContacts(block)
      .filter((contact) => contact.roomIds.includes(edge[0]))
      .flatMap((contact) => contact.roomIds.filter((id) => id !== edge[0])),
  );
  for (const join of block.joins) {
    if (join.a[0] === edge[0] && join.a[1] === edge[1]) rooms.add(join.b[0]);
    if (join.b[0] === edge[0] && join.b[1] === edge[1]) rooms.add(join.a[0]);
  }
  const source = block.rooms.find((room) => room.id === edge[0])!;
  const points = roomPoints(block, source);
  const a = points[edge[1]]!;
  const b = points[(edge[1] + 1) % points.length]!;
  const length = distance(a, b);
  const u = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
  const along = (p: Point): number => (p.x - a.x) * u.x + (p.y - a.y) * u.y;
  const gap = (p: Point): number =>
    Math.abs((p.x - a.x) * u.y - (p.y - a.y) * u.x);
  const result: EdgeRef[] = [];
  for (const room of block.rooms.filter((item) => rooms.has(item.id))) {
    const corners = roomPoints(block, room);
    for (let i = 0; i < corners.length; i++) {
      const c = corners[i]!;
      const d = corners[(i + 1) % corners.length]!;
      if (gap(c) > 0.001000001 || gap(d) > 0.001000001 || along(d) >= along(c))
        continue;
      if (Math.min(length, along(c)) - Math.max(0, along(d)) > OPENING_SNAP)
        result.push([room.id, i]);
    }
  }
  return result;
}
export function placeOpening(
  project: Project,
  blockId: string,
  edge: EdgeRef,
  type: Opening['type'],
  centre: number,
): { project: Project; openingId: string } {
  const block = project.blocks.find((item) => item.id === blockId)!;
  const created = createOpening(project, blockId, edge, type, centre);
  if (type === 'window') return created;
  const next = created.project.blocks.find((item) => item.id === blockId)!;
  const jambs = ([0, 1] as const).map((side) =>
    resolvePoint(next, { jamb: created.openingId, side }),
  );
  const candidates = contactedEdges(block, edge).filter((candidate) => {
    const [a, b] = edgeEndpoints(block, candidate);
    const length = distance(a, b);
    // Partial shared edges only pair openings whose entire span lies on the neighbour.
    return jambs.every((point) => {
      const along =
        ((point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y)) /
        length;
      return along >= -0.0001 && along <= length + 0.0001;
    });
  });
  if (candidates.length > 1)
    throw new Error(
      'More than one room faces this doorway. Place it away from the overlap or link a pair manually.',
    );
  return {
    ...created,
    project: candidates[0]
      ? pairOpeningOnEdge(
          created.project,
          blockId,
          created.openingId,
          candidates[0],
        )
      : created.project,
  };
}
export function openingDrag(
  block: Block,
  opening: Opening,
  mode: 'move' | 'start' | 'end',
  delta: number,
): { offset: number; width: number } {
  const length = distance(
    ...edgeEndpoints(block, [opening.roomId, opening.edge]),
  );
  if (mode === 'move')
    return {
      offset: roundCoordinate(
        Math.max(
          0,
          Math.min(length - opening.width, snapOpening(opening.offset + delta)),
        ),
      ),
      width: opening.width,
    };
  if (mode === 'start') {
    const end = opening.offset + opening.width;
    const offset = Math.max(
      0,
      Math.min(end - OPENING_SNAP, snapOpening(opening.offset + delta)),
    );
    return {
      offset: roundCoordinate(offset),
      width: roundCoordinate(end - offset),
    };
  }
  return {
    offset: opening.offset,
    width: roundCoordinate(
      Math.max(
        OPENING_SNAP,
        Math.min(length - opening.offset, snapOpening(opening.width + delta)),
      ),
    ),
  };
}
