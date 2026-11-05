import type { Block } from '../model/types';
import { pointRoom } from './geometry';
import { sketchContacts } from './contacts';

export function connectedRoomGroups(block: Block): string[][] {
  if (
    block.measurements.some(
      (item) =>
        item.status === 'done' &&
        item.value !== null &&
        item.kind !== 'height' &&
        (!pointRoom(block, item.a) || !pointRoom(block, item.b)),
    )
  )
    return [block.rooms.map((room) => room.id)];
  const adjacency = new Map(
    block.rooms.map((room) => [room.id, new Set<string>()]),
  );
  function connect(a: string | undefined, b: string | undefined): void {
    if (a && b) {
      adjacency.get(a)!.add(b);
      adjacency.get(b)!.add(a);
    }
  }
  for (const join of block.joins) connect(join.a[0], join.b[0]);
  for (const contact of sketchContacts(block)) connect(...contact.roomIds);
  for (const constraint of block.constraints)
    for (const edge of constraint.edges.slice(1))
      connect(constraint.edges[0]![0], edge[0]);
  for (const measurement of block.measurements) {
    if (
      measurement.status === 'done' &&
      measurement.value !== null &&
      measurement.kind !== 'height'
    )
      connect(pointRoom(block, measurement.a), pointRoom(block, measurement.b));
  }
  const visited = new Set<string>();
  const groups: string[][] = [];
  for (const room of block.rooms) {
    if (visited.has(room.id)) continue;
    const pending = [room.id];
    const group: string[] = [];
    visited.add(room.id);
    while (pending.length) {
      const id = pending.shift()!;
      group.push(id);
      for (const next of adjacency.get(id)!)
        if (!visited.has(next)) {
          visited.add(next);
          pending.push(next);
        }
    }
    // Keep the original room order, including the first room used for the gauge.
    groups.push(
      block.rooms
        .filter((item) => group.includes(item.id))
        .map((item) => item.id),
    );
  }
  return groups;
}
export function roomSubBlock(block: Block, roomIds: string[]): Block {
  const ids = new Set(roomIds);
  if (block.rooms.every((room) => ids.has(room.id))) return block;
  const rooms = block.rooms.filter((room) => ids.has(room.id));
  const vertices = new Set(rooms.flatMap((room) => room.vertexIds));
  return {
    ...block,
    rooms,
    vertices: block.vertices.filter((vertex) => vertices.has(vertex.id)),
    walls: block.walls.filter((wall) => ids.has(wall.roomId)),
    openings: block.openings.filter((opening) => ids.has(opening.roomId)),
    constraints: block.constraints.filter((constraint) =>
      constraint.edges.every(([id]) => ids.has(id)),
    ),
    joins: block.joins.filter(
      (join) => ids.has(join.a[0]) && ids.has(join.b[0]),
    ),
    measurements: block.measurements.filter(
      (measurement) =>
        ids.has(pointRoom(block, measurement.a) ?? '') &&
        ids.has(pointRoom(block, measurement.b) ?? ''),
    ),
  };
}
