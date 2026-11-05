import { distance, nearestOnSegment } from '../model/geometry';
import type { Block, PointRef, Room, Vertex } from '../model/types';
import { pointRoom } from './geometry';

export const CONTACT_TOLERANCE = 0.001;
export const CONTACT_SIGMA = 0.005;
const DISTANCE_EPSILON = 1e-12;

export interface SketchContact {
  roomIds: [string, string];
  a: { vertex: string };
  b: PointRef;
}

export function measuredRoomIds(block: Block): Set<string> {
  const measured = new Set<string>();
  for (const measurement of block.measurements) {
    if (measurement.status !== 'done') continue;
    for (const ref of [measurement.a, measurement.b]) {
      const roomId = pointRoom(block, ref);
      if (roomId) measured.add(roomId);
    }
  }
  return measured;
}

function _edgeContact(
  corner: Vertex,
  source: Room,
  target: Room,
  vertices: Vertex[],
): SketchContact | null {
  let nearest = CONTACT_TOLERANCE + DISTANCE_EPSILON;
  let contact: SketchContact | null = null;
  for (let edge = 0; edge < vertices.length; edge++) {
    const a = vertices[edge]!.sketch;
    const b = vertices[(edge + 1) % vertices.length]!.sketch;
    const point = nearestOnSegment(corner.sketch, a, b);
    const gap = distance(corner.sketch, point);
    if (gap > nearest) continue;
    const length = distance(a, b);
    if (length === 0) continue;
    nearest = gap;
    contact = {
      roomIds: [source.id, target.id],
      a: { vertex: corner.id },
      b: { edgePoint: [target.id, edge], t: distance(a, point) / length },
    };
  }
  return contact;
}

// Contacts are inferred from the original sketch, never from the fitted positions.
export function sketchContacts(block: Block): SketchContact[] {
  const measured = measuredRoomIds(block);
  const byId = new Map(block.vertices.map((vertex) => [vertex.id, vertex]));
  const corners = block.rooms.map((room) =>
    room.vertexIds.map((id) => byId.get(id)!),
  );
  const contacts: SketchContact[] = [];
  for (let i = 0; i < block.rooms.length; i++) {
    const a = block.rooms[i]!;
    for (let j = i + 1; j < block.rooms.length; j++) {
      const b = block.rooms[j]!;
      if (measured.has(a.id) && measured.has(b.id)) continue;
      const matched = new Set<string>();
      for (const p of corners[i]!) {
        for (const q of corners[j]!) {
          if (
            distance(p.sketch, q.sketch) >
            CONTACT_TOLERANCE + DISTANCE_EPSILON
          )
            continue;
          contacts.push({
            roomIds: [a.id, b.id],
            a: { vertex: p.id },
            b: { vertex: q.id },
          });
          matched.add(p.id);
          matched.add(q.id);
        }
      }
      // A corner match already covers both incident edges; do not weight it twice.
      for (const [source, target, sourceCorners, targetCorners] of [
        [a, b, corners[i]!, corners[j]!],
        [b, a, corners[j]!, corners[i]!],
      ] as const) {
        for (const corner of sourceCorners) {
          if (matched.has(corner.id)) continue;
          const contact = _edgeContact(corner, source, target, targetCorners);
          if (contact) contacts.push(contact);
        }
      }
    }
  }
  return contacts;
}
