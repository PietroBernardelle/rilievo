import { distance, nearestOnSegment, roomPoints } from '../model/geometry';
import type { Block, Measurement, Point, PointRef, Room } from '../model/types';
import { pointRoom, resolvePoint } from '../solver/geometry';

export function cornerName(index: number): string {
  let label = '';
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26))
    label = String.fromCharCode(65 + ((value - 1) % 26)) + label;
  return label;
}
export function pointLabel(block: Block, ref: PointRef): string {
  const room = block.rooms.find((item) => item.id === pointRoom(block, ref));
  if ('vertex' in ref)
    return room ? cornerName(room.vertexIds.indexOf(ref.vertex)) : ref.vertex;
  if ('jamb' in ref) return `jamb ${ref.jamb}/${ref.side + 1}`;
  const edge = ref.edgePoint[1];
  return `point on ${cornerName(edge)}–${cornerName((edge + 1) % room!.vertexIds.length)}`;
}
export function measurementRoom(
  block: Block,
  item: Pick<Measurement, 'a' | 'b'>,
): Room | undefined {
  return block.rooms.find((room) => room.id === pointRoom(block, item.a));
}
export function measurementLabel(
  block: Block,
  item: Pick<Measurement, 'a' | 'b'> &
    Partial<Pick<Measurement, 'kind' | 'target'>>,
): string {
  const room = measurementRoom(block, item);
  if (item.target) {
    const target = item.target;
    if (target.type === 'room-height')
      return `${room?.name}: height at ${pointLabel(block, item.a)}`;
    if (target.type === 'join-thickness')
      return `${room?.name}: doorway wall thickness`;
    const opening = block.openings.find(
      (entry) => entry.id === target.openingId,
    );
    return `${room?.name}: ${opening?.type} ${opening?.id} ${target.type === 'opening-height' ? 'height' : target.type === 'sill' ? 'sill height' : 'wall thickness'}`;
  }
  if (item.kind === 'height')
    return `${room?.name}: height at ${pointLabel(block, item.a)}`;
  return `${room?.name ?? 'Block'}: ${pointLabel(block, item.a)} → ${pointLabel(block, item.b)}`;
}
export function measurementPrompt(block: Block, item: Measurement): string {
  if (item.target || item.kind === 'height')
    return `Measure ${measurementLabel(block, item)}${item.kind === 'height' ? ' ↕' : ''}`;
  const room = measurementRoom(block, item);
  if (room && 'vertex' in item.a && 'vertex' in item.b) {
    const a = room.vertexIds.indexOf(item.a.vertex);
    const b = room.vertexIds.indexOf(item.b.vertex);
    if (a >= 0 && b >= 0) {
      const wall =
        (a + 1) % room.vertexIds.length === b ||
        (b + 1) % room.vertexIds.length === a;
      const points = roomPoints(block, room, false);
      const centre = points.reduce(
        (sum, p) => ({
          x: sum.x + p.x / points.length,
          y: sum.y + p.y / points.length,
        }),
        { x: 0, y: 0 },
      );
      const midpoint = {
        x: (points[a]!.x + points[b]!.x) / 2 - centre.x,
        y: (points[a]!.y + points[b]!.y) / 2 - centre.y,
      };
      const direction =
        Math.abs(midpoint.x) > Math.abs(midpoint.y)
          ? midpoint.x > 0
            ? 'east'
            : 'west'
          : midpoint.y > 0
            ? 'north'
            : 'south';
      return `Measure ${room.name.toUpperCase()}: ${wall ? `${direction} wall` : 'diagonal'}, ${cornerName(a)} → ${cornerName(b)}`;
    }
  }
  return `Measure ${measurementLabel(block, item)}`;
}
export function samePoints(a: PointRef, b: PointRef): boolean {
  if ('vertex' in a && 'vertex' in b) return a.vertex === b.vertex;
  if ('jamb' in a && 'jamb' in b) return a.jamb === b.jamb && a.side === b.side;
  return (
    'edgePoint' in a &&
    'edgePoint' in b &&
    a.edgePoint[0] === b.edgePoint[0] &&
    a.edgePoint[1] === b.edgePoint[1] &&
    Math.abs(a.t - b.t) < 1e-8
  );
}
export function pickSurveyPoint(
  block: Block,
  point: Point,
  radius: number,
  edgesOnly = false,
): PointRef | null {
  if (!edgesOnly) {
    const refs: PointRef[] = [
      ...block.vertices.map((vertex) => ({ vertex: vertex.id })),
      ...block.openings.flatMap((opening) => [
        { jamb: opening.id, side: 0 as const },
        { jamb: opening.id, side: 1 as const },
      ]),
    ];
    const nearest = refs
      .map((ref) => ({
        ref,
        distance: distance(point, resolvePoint(block, ref)),
      }))
      .filter((item) => item.distance <= radius)
      .sort((a, b) => a.distance - b.distance)[0];
    if (nearest) return nearest.ref;
  }
  let best: PointRef | null = null;
  let nearest = radius;
  for (const room of block.rooms) {
    const points = roomPoints(block, room, false);
    for (let i = 0; i < points.length; i++) {
      const a = points[i]!;
      const b = points[(i + 1) % points.length]!;
      const projected = nearestOnSegment(point, a, b);
      const d = distance(point, projected);
      const t = distance(a, projected) / distance(a, b);
      if (d <= nearest && (!edgesOnly || (t > 1e-4 && t < 1 - 1e-4))) {
        nearest = d;
        best = { edgePoint: [room.id, i], t };
      }
    }
  }
  return best;
}
