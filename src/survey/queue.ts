import { containsPoint, distance, roomPoints } from '../model/geometry';
import { requestMeasurement } from '../model/measurements';
import type {
  Block,
  Measurement,
  Point,
  PointRef,
  Project,
  Room,
} from '../model/types';
import { consistencyDiagnostics, roomRigidity } from '../solver/diagnostics';
import type { RoomDiagnostics } from '../solver/diagnostics';
import { pointRoom, resolvePoint } from '../solver/geometry';
import { samePoints } from './points';

export type RoomStatus =
  'not rigid' | 'rigid but unchecked' | 'consistent' | 'inconsistent';
export function roomStatus(room: RoomDiagnostics): RoomStatus {
  if (!room.consistent) return 'inconsistent';
  if (!room.rigid) return 'not rigid';
  return room.redundancy === 0 ? 'rigid but unchecked' : 'consistent';
}
export function surveyMeasurements(block: Block): Measurement[] {
  return block.measurements.filter(
    (item) => item.kind !== 'height' && item.status !== 'rejected',
  );
}
function _known(block: Block, a: PointRef, b: PointRef): boolean {
  return surveyMeasurements(block).some(
    (item) =>
      (samePoints(item.a, a) && samePoints(item.b, b)) ||
      (samePoints(item.a, b) && samePoints(item.b, a)),
  );
}
// Check each interval between polygon crossings, including concave vertices.
export function reachableDiagonal(
  points: Point[],
  a: Point,
  b: Point,
): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const cuts = [0, 1];
  for (let i = 0; i < points.length; i++) {
    const c = points[i]!;
    const d = points[(i + 1) % points.length]!;
    const ex = d.x - c.x;
    const ey = d.y - c.y;
    const denominator = dx * ey - dy * ex;
    if (Math.abs(denominator) < 1e-10) continue;
    const t = ((c.x - a.x) * ey - (c.y - a.y) * ex) / denominator;
    const u = ((c.x - a.x) * dy - (c.y - a.y) * dx) / denominator;
    if (t > 0 && t < 1 && u >= 0 && u <= 1) cuts.push(t);
  }
  cuts.sort((x, y) => x - y);
  return cuts.slice(1).every((end, i) => {
    const t = (end + cuts[i]!) / 2;
    return containsPoint(points, { x: a.x + t * dx, y: a.y + t * dy });
  });
}
function _planned(block: Block): Block {
  return {
    ...block,
    measurements: block.measurements.map((item) =>
      item.status === 'queued'
        ? {
            ...item,
            status: 'done',
            value: distance(
              resolvePoint(block, item.a),
              resolvePoint(block, item.b),
            ),
          }
        : item,
    ),
  };
}
export function ensureSurveyQueue(project: Project, blockId: string): Project {
  let next = project;
  const getBlock = (): Block => {
    const block = next.blocks.find((item) => item.id === blockId);
    if (!block) throw new Error(`Block ${blockId} does not exist.`);
    return block;
  };
  for (const room of getBlock().rooms) {
    const n = room.vertexIds.length;
    const add = (i: number, j: number): void => {
      const a = { vertex: room.vertexIds[i]! };
      const b = { vertex: room.vertexIds[j]! };
      if (!_known(getBlock(), a, b))
        next = requestMeasurement(next, blockId, a, b).project;
    };
    // Stored polygons are CCW; visit walls clockwise from corner A.
    for (let step = 0; step < n; step++)
      add((n - step) % n, (n - step - 1 + n) % n);
    const points = roomPoints(getBlock(), room, false);
    for (let i = 0; i < n; i++) {
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue;
        if (!reachableDiagonal(points, points[i]!, points[j]!)) continue;
        const block = getBlock();
        const a = { vertex: room.vertexIds[i]! };
        const b = { vertex: room.vertexIds[j]! };
        if (_known(block, a, b)) continue;
        if (n === 4) {
          add(i, j);
          continue;
        }
        const planned = _planned(block);
        const before = roomRigidity(planned, room);
        const consistency = consistencyDiagnostics(
          planned,
          project.settings.tolerance,
        ).rooms.find((item) => item.roomId === room.id)!;
        if (before.rigid && consistency.redundancy > 0) continue;
        const candidate: Measurement = {
          id: 'candidate',
          kind: 'distance',
          a,
          b,
          value: distance(points[i]!, points[j]!),
          sigma: 1,
          status: 'done',
          note: '',
        };
        const after = roomRigidity(
          { ...planned, measurements: [...planned.measurements, candidate] },
          room,
        );
        if (before.rigid || after.rank > before.rank) add(i, j);
      }
    }
  }
  return next;
}
export function firstPending(block: Block, room?: Room): string | null {
  return (
    surveyMeasurements(block).find(
      (item) =>
        item.status === 'queued' &&
        (!room || pointRoom(block, item.a) === room.id),
    )?.id ?? null
  );
}
