import { distance } from '../model/geometry';
import type { Block, EdgeRef, Opening, Point, PointRef } from '../model/types';

export function edgeEndpoints(
  block: Block,
  [roomId, index]: EdgeRef,
): [Point, Point] {
  const room = block.rooms.find((item) => item.id === roomId);
  if (
    !room ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= room.vertexIds.length
  )
    throw new Error(`Unknown edge ${roomId}:${index}.`);
  const a = block.vertices.find((item) => item.id === room.vertexIds[index]);
  const b = block.vertices.find(
    (item) => item.id === room.vertexIds[(index + 1) % room.vertexIds.length],
  );
  if (!a || !b) throw new Error(`Missing corner on edge ${roomId}:${index}.`);
  return [a, b];
}
export function resolvePoint(block: Block, ref: PointRef): Point {
  if ('vertex' in ref) {
    const vertex = block.vertices.find((item) => item.id === ref.vertex);
    if (!vertex) throw new Error(`Unknown corner ${ref.vertex}.`);
    return { x: vertex.x, y: vertex.y };
  }
  const opening =
    'jamb' in ref
      ? block.openings.find((item) => item.id === ref.jamb)
      : undefined;
  if ('jamb' in ref && !opening)
    throw new Error(`Unknown opening ${ref.jamb}.`);
  const [a, b] = edgeEndpoints(
    block,
    'edgePoint' in ref ? ref.edgePoint : [opening!.roomId, opening!.edge],
  );
  const length = distance(a, b);
  if (length < 1e-12)
    throw new Error('Cannot resolve a point on a zero-length edge.');
  const t =
    'edgePoint' in ref
      ? ref.t
      : (opening!.offset + ref.side * opening!.width) / length;
  return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
}
export function pointRoom(block: Block, ref: PointRef): string | undefined {
  if ('vertex' in ref)
    return block.rooms.find((room) => room.vertexIds.includes(ref.vertex))?.id;
  if ('edgePoint' in ref) return ref.edgePoint[0];
  return block.openings.find((opening) => opening.id === ref.jamb)?.roomId;
}
export function pairedOpening(
  block: Block,
  via: string,
  a: EdgeRef,
  b: EdgeRef,
): [Opening, Opening] {
  const opening = block.openings.find((item) => item.id === via);
  if (!opening) throw new Error(`Join doorway ${via} does not exist.`);
  const onA = opening.roomId === a[0] && opening.edge === a[1];
  const onB = opening.roomId === b[0] && opening.edge === b[1];
  if (!onA && !onB)
    throw new Error(`Doorway ${via} is not on either joined edge.`);
  const opposite = onA ? b : a;
  const matches = block.openings.filter(
    (item) =>
      item.id !== via &&
      item.roomId === opposite[0] &&
      item.edge === opposite[1] &&
      item.type === opening.type &&
      Math.abs(item.width - opening.width) < 1e-4,
  );
  if (matches.length !== 1)
    throw new Error(
      `Join doorway ${via} needs exactly one matching opening on ${opposite[0]}:${opposite[1]}; found ${matches.length}.`,
    );
  return onA ? [opening, matches[0]!] : [matches[0]!, opening];
}
