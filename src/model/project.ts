import { roomPoints, validatePolygon } from './geometry';
import type { Block, EdgeRef, Point, PointRef, Project, Room } from './types';

export const SCHEMA_VERSION = 1;
export function createProject(createdAt: string): Project {
  return {
    schemaVersion: SCHEMA_VERSION,
    name: 'Untitled',
    units: 'm',
    createdAt,
    settings: { tolerance: 0.015, laserSigma: 0.002, placementSigma: 0.005 },
    blocks: [],
    links: [],
  };
}
function _nextId(prefix: string, ids: string[]): string {
  const used = new Set(ids);
  let index = 1;
  while (used.has(`${prefix}${index}`)) index++;
  return `${prefix}${index}`;
}
function _block(project: Project, id: string): Block {
  const block = project.blocks.find((item) => item.id === id);
  if (!block) throw new Error(`Block ${id} does not exist.`);
  return block;
}
function _replaceBlock(project: Project, block: Block): Project {
  return {
    ...project,
    blocks: project.blocks.map((item) => (item.id === block.id ? block : item)),
  };
}
function _room(block: Block, id: string): Room {
  const room = block.rooms.find((item) => item.id === id);
  if (!room) throw new Error(`Room ${id} does not exist.`);
  return room;
}
export function createRoom(
  project: Project,
  activeBlockId: string | null,
  points: Point[],
  height: number,
): { project: Project; blockId: string; roomId: string } {
  validatePolygon(points);
  if (!Number.isFinite(height) || height <= 0)
    throw new Error('Room height must be greater than zero.');
  let next = project;
  let block = activeBlockId
    ? _block(project, activeBlockId)
    : project.blocks[0];
  if (!block) {
    block = {
      id: _nextId(
        'b',
        project.blocks.map((item) => item.id),
      ),
      name: 'Piano terra',
      kind: 'floor',
      elevation: 0,
      placement: { x: 0, y: 0, rotation: 0 },
      vertices: [],
      rooms: [],
      walls: [],
      openings: [],
      features: [],
      measurements: [],
      constraints: [],
      joins: [],
    };
    next = { ...project, blocks: [...project.blocks, block] };
  }
  const historicalRefs = project.blocks.flatMap((item) =>
    item.measurements.flatMap((measurement) => [measurement.a, measurement.b]),
  );
  const usedIds = [
    ...project.blocks.flatMap((item) =>
      item.vertices.map((vertex) => vertex.id),
    ),
    ...historicalRefs.flatMap((ref) => ('vertex' in ref ? [ref.vertex] : [])),
  ];
  const vertices = points.map((point) => {
    const id = _nextId('v', usedIds);
    usedIds.push(id);
    return { id, ...point, sketch: { ...point } };
  });
  const roomId = _nextId('r', [
    ...project.blocks.flatMap((item) => item.rooms.map((room) => room.id)),
    ...historicalRefs.flatMap((ref) =>
      'edgePoint' in ref ? [ref.edgePoint[0]] : [],
    ),
  ]);
  const room: Room = {
    id: roomId,
    name: `Room ${block.rooms.length + 1}`,
    vertexIds: vertices.map((vertex) => vertex.id),
    height,
  };
  return {
    project: _replaceBlock(next, {
      ...block,
      vertices: [...block.vertices, ...vertices],
      rooms: [...block.rooms, room],
    }),
    blockId: block.id,
    roomId,
  };
}
export function moveCorner(
  project: Project,
  blockId: string,
  vertexId: string,
  point: Point,
): Project {
  const block = _block(project, blockId);
  const vertex = block.vertices.find((item) => item.id === vertexId);
  if (!vertex) throw new Error(`Corner ${vertexId} does not exist.`);
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y))
    throw new Error('Corner coordinates must be finite numbers.');
  if (
    vertex.x === point.x &&
    vertex.y === point.y &&
    vertex.sketch.x === point.x &&
    vertex.sketch.y === point.y
  )
    return project;
  const next = {
    ...block,
    vertices: block.vertices.map((item) =>
      item.id === vertexId ? { ...item, ...point, sketch: { ...point } } : item,
    ),
  };
  for (const room of next.rooms.filter((item) =>
    item.vertexIds.includes(vertexId),
  ))
    validatePolygon(roomPoints(next, room));
  return _replaceBlock(project, next);
}
export function updateRoom(
  project: Project,
  blockId: string,
  roomId: string,
  changes: { name?: string; height?: number },
): Project {
  const block = _block(project, blockId);
  const room = _room(block, roomId);
  const name = changes.name === undefined ? room.name : changes.name.trim();
  const height = changes.height ?? room.height;
  if (!name) throw new Error('Room name cannot be empty.');
  if (!Number.isFinite(height) || height <= 0)
    throw new Error('Room height must be greater than zero.');
  if (name === room.name && height === room.height) return project;
  return _replaceBlock(project, {
    ...block,
    rooms: block.rooms.map((item) =>
      item.id === roomId ? { ...item, name, height } : item,
    ),
  });
}
// Changed edges lose their wall metadata; unaffected edges keep their index-based references.
function _removeGeometry(
  project: Project,
  block: Block,
  roomId: string,
  removedVertices: string[],
  removedEdges: number[],
  cornerIndex?: number,
): Project {
  const wholeRoom = cornerIndex === undefined;
  const affected = (edge: EdgeRef): boolean =>
    edge[0] === roomId && (wholeRoom || removedEdges.includes(edge[1]));
  const remap = (edge: EdgeRef): EdgeRef => [
    edge[0],
    edge[0] === roomId && cornerIndex !== undefined && edge[1] > cornerIndex
      ? edge[1] - 1
      : edge[1],
  ];
  const removedOpenings = block.openings
    .filter((item) => affected([item.roomId, item.edge]))
    .map((item) => item.id);
  const refAffected = (ref: PointRef): boolean =>
    'vertex' in ref
      ? removedVertices.includes(ref.vertex)
      : 'jamb' in ref
        ? removedOpenings.includes(ref.jamb)
        : affected(ref.edgePoint);
  const remapRef = (ref: PointRef): PointRef =>
    'edgePoint' in ref ? { ...ref, edgePoint: remap(ref.edgePoint) } : ref;
  const next: Block = {
    ...block,
    rooms: wholeRoom
      ? block.rooms.filter((room) => room.id !== roomId)
      : block.rooms.map((room) =>
          room.id === roomId
            ? {
                ...room,
                vertexIds: room.vertexIds.filter(
                  (id) => !removedVertices.includes(id),
                ),
              }
            : room,
        ),
    vertices: block.vertices.filter(
      (vertex) => !removedVertices.includes(vertex.id),
    ),
    walls: block.walls
      .filter((wall) => !affected([wall.roomId, wall.edge]))
      .map((wall) => ({ ...wall, edge: remap([wall.roomId, wall.edge])[1] })),
    openings: block.openings
      .filter((item) => !removedOpenings.includes(item.id))
      .map((item) => ({ ...item, edge: remap([item.roomId, item.edge])[1] })),
    constraints: block.constraints
      .filter((item) => !item.edges.some(affected))
      .map((item) => ({ ...item, edges: item.edges.map(remap) })),
    joins: block.joins
      .filter(
        (item) =>
          !affected(item.a) &&
          !affected(item.b) &&
          !removedOpenings.includes(item.via),
      )
      .map((item) => ({ ...item, a: remap(item.a), b: remap(item.b) })),
    measurements: block.measurements.map((item) =>
      item.status === 'rejected'
        ? item
        : refAffected(item.a) || refAffected(item.b)
          ? { ...item, status: 'rejected' }
          : { ...item, a: remapRef(item.a), b: remapRef(item.b) },
    ),
  };
  return {
    ..._replaceBlock(project, next),
    links: project.links.filter(
      (link) =>
        ![link.a, link.b].some(
          (end) =>
            end.block === block.id && removedVertices.includes(end.vertex),
        ),
    ),
  };
}
export function deleteRoom(
  project: Project,
  blockId: string,
  roomId: string,
): Project {
  const block = _block(project, blockId);
  const room = _room(block, roomId);
  return _removeGeometry(project, block, roomId, room.vertexIds, []);
}
export function deleteCorner(
  project: Project,
  blockId: string,
  vertexId: string,
): Project {
  const block = _block(project, blockId);
  const room = block.rooms.find((item) => item.vertexIds.includes(vertexId));
  if (!room) throw new Error(`Corner ${vertexId} does not belong to a room.`);
  if (room.vertexIds.length === 3) return deleteRoom(project, blockId, room.id);
  const index = room.vertexIds.indexOf(vertexId);
  const points = roomPoints(block, room).filter((_, i) => i !== index);
  validatePolygon(points);
  return _removeGeometry(
    project,
    block,
    room.id,
    [vertexId],
    [(index + room.vertexIds.length - 1) % room.vertexIds.length, index],
    index,
  );
}
