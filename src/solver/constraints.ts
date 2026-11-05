import { roomPoints } from '../model/geometry';
import type { Block, Constraint, EdgeRef } from '../model/types';
import { measuredRoomIds } from './contacts';

export const RIGHT_ANGLE_THRESHOLD = (5 * Math.PI) / 180;
export const SKETCH_ANGLE_WEIGHT = 0.1;
export const UNMEASURED_ANGLE_WEIGHT = 1;
function _key(edges: EdgeRef[]): string {
  return edges
    .map(([room, index]) => `${room}:${index}`)
    .sort()
    .join('|');
}
export function sketchConstraints(block: Block): Constraint[] {
  const measured = measuredRoomIds(block);
  const existing = new Set(
    block.constraints
      .filter((item) => item.kind === 'perpendicular')
      .map((item) => _key(item.edges)),
  );
  const constraints: Constraint[] = [];
  for (const room of block.rooms) {
    const points = roomPoints(block, room);
    for (let i = 0; i < points.length; i++) {
      const previous = (i + points.length - 1) % points.length;
      const a = points[previous]!;
      const b = points[i]!;
      const c = points[(i + 1) % points.length]!;
      const cosine =
        ((a.x - b.x) * (c.x - b.x) + (a.y - b.y) * (c.y - b.y)) /
        (Math.hypot(a.x - b.x, a.y - b.y) * Math.hypot(c.x - b.x, c.y - b.y));
      const angle = Math.acos(Math.max(-1, Math.min(1, cosine)));
      const edges: EdgeRef[] = [
        [room.id, previous],
        [room.id, i],
      ];
      if (
        Math.abs(angle - Math.PI / 2) <= RIGHT_ANGLE_THRESHOLD &&
        !existing.has(_key(edges))
      )
        constraints.push({
          kind: 'perpendicular',
          edges,
          weight: measured.has(room.id)
            ? SKETCH_ANGLE_WEIGHT
            : UNMEASURED_ANGLE_WEIGHT,
        });
    }
  }
  return constraints;
}
