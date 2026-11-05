import { roomPoints, validatePolygon } from './geometry';
import type { Block, PointRef, Project } from './types';

function _object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${path} must be an object.`);
  return value as Record<string, unknown>;
}
function _array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array.`);
  return value;
}
function _text(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim())
    throw new Error(`${path} must be a non-empty string.`);
  return value;
}
function _number(value: unknown, path: string, minimum = -Infinity): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum)
    throw new Error(`${path} must be a finite number >= ${minimum}.`);
  return value;
}
function _choice(value: unknown, choices: unknown[], path: string): void {
  if (!choices.includes(value))
    throw new Error(`${path} must be one of ${choices.join(', ')}.`);
}
function _point(value: unknown, path: string): void {
  const point = _object(value, path);
  _number(point.x, `${path}.x`);
  _number(point.y, `${path}.y`);
}
function _edge(value: unknown, path: string): void {
  const edge = _array(value, path);
  if (edge.length !== 2)
    throw new Error(`${path} must be [roomId, edgeIndex].`);
  _text(edge[0], path);
  const index = _number(edge[1], path, 0);
  if (!Number.isInteger(index))
    throw new Error(`${path} edge index must be an integer.`);
}
function _ref(value: unknown, path: string): void {
  const ref = _object(value, path);
  if (['vertex', 'jamb', 'edgePoint'].filter((key) => key in ref).length !== 1)
    throw new Error(`${path} must reference exactly one point.`);
  if ('vertex' in ref) _text(ref.vertex, path);
  else if ('jamb' in ref) {
    _text(ref.jamb, path);
    _choice(ref.side, [0, 1], path);
  } else {
    _edge(ref.edgePoint, path);
    if (_number(ref.t, `${path}.t`, 0) > 1)
      throw new Error(`${path}.t must be <= 1.`);
  }
}
function _objects(
  value: unknown,
  path: string,
  ids = true,
): Record<string, unknown>[] {
  const items = _array(value, path).map((item) => _object(item, path));
  if (ids) {
    const identifiers = items.map((item) => _text(item.id, `${path}.id`));
    if (new Set(identifiers).size !== identifiers.length)
      throw new Error(`${path} contains duplicate IDs.`);
  }
  return items;
}
function _validEdge(block: Block, roomId: string, edge: number): boolean {
  const room = block.rooms.find((item) => item.id === roomId);
  return room !== undefined && edge >= 0 && edge < room.vertexIds.length;
}
function _validRef(block: Block, ref: PointRef): boolean {
  if ('vertex' in ref)
    return block.vertices.some((item) => item.id === ref.vertex);
  if ('jamb' in ref) return block.openings.some((item) => item.id === ref.jamb);
  return _validEdge(block, ...ref.edgePoint);
}
function _validateReferences(project: Project): void {
  for (const block of project.blocks) {
    const owned = new Set<string>();
    for (const room of block.rooms) {
      for (const id of room.vertexIds) {
        if (owned.has(id))
          throw new Error('Rooms cannot share or repeat corners.');
        owned.add(id);
      }
      validatePolygon(roomPoints(block, room));
      validatePolygon(roomPoints(block, room, false));
    }
    const edges = [...block.walls, ...block.openings].map(
      (item) => [item.roomId, item.edge] as const,
    );
    for (const item of block.constraints) edges.push(...item.edges);
    for (const item of block.joins) {
      edges.push(item.a, item.b);
      if (!block.openings.some((opening) => opening.id === item.via))
        throw new Error(`Join ${item.id} references a missing opening.`);
    }
    if (edges.some(([id, index]) => !_validEdge(block, id, index)))
      throw new Error(
        'A wall, opening, constraint or join references a missing edge.',
      );
    // Rejected records retain the historical endpoints of deleted geometry.
    if (
      block.measurements.some(
        (item) =>
          item.status !== 'rejected' &&
          (!_validRef(block, item.a) || !_validRef(block, item.b)),
      )
    )
      throw new Error('A measurement references a missing point.');
  }
  for (const link of project.links)
    for (const end of [link.a, link.b]) {
      if (
        !project.blocks
          .find((block) => block.id === end.block)
          ?.vertices.some((vertex) => vertex.id === end.vertex)
      )
        throw new Error(`Link ${link.id} references a missing corner.`);
    }
}
export function validateProject(value: unknown): asserts value is Project {
  const project = _object(value, 'Project');
  if (project.schemaVersion !== 1)
    throw new Error(
      `Unsupported schemaVersion ${String(project.schemaVersion)}. Expected 1.`,
    );
  _choice(project.units, ['m'], 'units');
  _text(project.name, 'name');
  if (!Number.isFinite(Date.parse(_text(project.createdAt, 'createdAt'))))
    throw new Error('createdAt must be an ISO date.');
  const settings = _object(project.settings, 'settings');
  for (const key of ['tolerance', 'laserSigma', 'placementSigma'])
    _number(settings[key], `settings.${key}`, Number.MIN_VALUE);
  for (const block of _objects(project.blocks, 'blocks')) {
    _text(block.name, 'block.name');
    _choice(block.kind, ['floor', 'site', 'other'], 'block.kind');
    _number(block.elevation, 'elevation');
    _point(block.placement, 'placement');
    _number(_object(block.placement, 'placement').rotation, 'rotation');
    for (const vertex of _objects(block.vertices, 'vertices')) {
      _point(vertex, 'vertex');
      _point(vertex.sketch, 'sketch');
    }
    for (const room of _objects(block.rooms, 'rooms')) {
      _text(room.name, 'room.name');
      _number(room.height, 'room.height', Number.MIN_VALUE);
      for (const id of _array(room.vertexIds, 'vertexIds'))
        _text(id, 'vertexId');
    }
    for (const wall of _objects(block.walls, 'walls', false)) {
      _edge([wall.roomId, wall.edge], 'wall');
      if (wall.thickness !== undefined)
        _number(wall.thickness, 'wall.thickness', 0);
      if (wall.exterior !== undefined)
        _choice(wall.exterior, [true, false], 'wall.exterior');
    }
    for (const opening of _objects(block.openings, 'openings')) {
      _edge([opening.roomId, opening.edge], 'opening');
      _choice(opening.type, ['door', 'window', 'arch'], 'opening.type');
      for (const key of ['offset', 'width', 'height', 'sill'])
        _number(opening[key], `opening.${key}`, 0);
    }
    _objects(block.features, 'features');
    for (const measurement of _objects(block.measurements, 'measurements')) {
      _choice(
        measurement.kind,
        ['distance', 'height', 'thickness', 'offset'],
        'measurement.kind',
      );
      _choice(
        measurement.status,
        ['queued', 'done', 'skipped', 'rejected'],
        'measurement.status',
      );
      _ref(measurement.a, 'measurement.a');
      _ref(measurement.b, 'measurement.b');
      if (measurement.value !== null)
        _number(measurement.value, 'measurement.value', 0);
      _number(measurement.sigma, 'measurement.sigma', Number.MIN_VALUE);
      if (typeof measurement.note !== 'string')
        throw new Error('measurement.note must be text.');
    }
    for (const constraint of _objects(
      block.constraints,
      'constraints',
      false,
    )) {
      _text(constraint.kind, 'constraint.kind');
      for (const edge of _array(constraint.edges, 'constraint.edges'))
        _edge(edge, 'constraint.edge');
      if (constraint.weight !== undefined)
        _number(constraint.weight, 'constraint.weight', 0);
      if (constraint.hard !== undefined)
        _choice(constraint.hard, [true, false], 'constraint.hard');
    }
    for (const join of _objects(block.joins, 'joins')) {
      _edge(join.a, 'join.a');
      _edge(join.b, 'join.b');
      _number(join.thickness, 'join.thickness', 0);
      _text(join.via, 'join.via');
    }
  }
  for (const link of _objects(project.links, 'links'))
    for (const key of ['a', 'b']) {
      const end = _object(link[key], `link.${key}`);
      _text(end.block, 'link.block');
      _text(end.vertex, 'link.vertex');
    }
  _validateReferences(value as Project);
}
export function loadProject(json: string): Project {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error('This file is not valid JSON.');
  }
  validateProject(value);
  return value;
}
export function saveProject(project: Project): string {
  validateProject(project);
  return JSON.stringify(project, null, 2) + '\n';
}
