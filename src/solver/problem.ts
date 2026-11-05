import {
  distance,
  roomPoints,
  signedArea,
  validatePolygon,
} from '../model/geometry';
import type { Block, Constraint, Point } from '../model/types';
import { sketchConstraints } from './constraints';
import { contactResiduals, measuredRoomIds, sketchContacts } from './contacts';
import { edgeEndpoints, pairedOpening, resolvePoint } from './geometry';
import type { LeastSquaresProblem } from './lm';

export const ANGLE_SIGMA = (2 * Math.PI) / 180;
export const SKETCH_SIGMA = 1;
export const UNMEASURED_ANGLE_SIGMA = (0.5 * Math.PI) / 180;
export const UNMEASURED_EDGE_SIGMA = 0.5;
export const UNMEASURED_ANCHOR_SIGMA = 10;
export const JOIN_SIGMA = Math.hypot(0.002, 0.005);
export interface FitProblem extends LeastSquaresProblem {
  initial: number[];
  decode: (x: number[]) => Block;
  generatedConstraints: Constraint[];
}
function _frame(a: Point, b: Point): (point: Point) => Point {
  const length = distance(a, b);
  const cosine = (b.x - a.x) / length;
  const sine = (b.y - a.y) / length;
  return (point) => ({
    x: (point.x - a.x) * cosine + (point.y - a.y) * sine,
    y: -(point.x - a.x) * sine + (point.y - a.y) * cosine,
  });
}
function _constraintResiduals(block: Block, constraint: Constraint): number[] {
  const [a, b] = edgeEndpoints(block, constraint.edges[0]!);
  const [c, d] = edgeEndpoints(block, constraint.edges[1]!);
  const u = { x: b.x - a.x, y: b.y - a.y };
  const v = { x: d.x - c.x, y: d.y - c.y };
  const lengthU = Math.max(1e-12, Math.hypot(u.x, u.y));
  const lengthV = Math.max(1e-12, Math.hypot(v.x, v.y));
  const dot = (u.x * v.x + u.y * v.y) / (lengthU * lengthV);
  const cross = (u.x * v.y - u.y * v.x) / (lengthU * lengthV);
  if (constraint.kind === 'perpendicular')
    return [Math.asin(Math.max(-1, Math.min(1, dot)))];
  const angle = Math.asin(Math.max(-1, Math.min(1, cross)));
  if (constraint.kind === 'parallel') return [angle];
  return [angle, ((c.x - a.x) * u.y - (c.y - a.y) * u.x) / lengthU];
}
export function createFitProblem(block: Block): FitProblem {
  const first = block.rooms[0]!;
  const firstVertex = block.vertices.find(
    (vertex) => vertex.id === first.vertexIds[0],
  )!;
  const secondVertex = block.vertices.find(
    (vertex) => vertex.id === first.vertexIds[1],
  )!;
  const frame = _frame(firstVertex, secondVertex);
  const sketchFrame = _frame(firstVertex.sketch, secondVertex.sketch);
  const initialBlock = {
    ...block,
    vertices: block.vertices.map((vertex) => ({ ...vertex, ...frame(vertex) })),
  };
  initialBlock.vertices.find((vertex) => vertex.id === firstVertex.id)!.x = 0;
  initialBlock.vertices.find((vertex) => vertex.id === firstVertex.id)!.y = 0;
  initialBlock.vertices.find((vertex) => vertex.id === secondVertex.id)!.y = 0;
  const priors = block.vertices.map((vertex) => sketchFrame(vertex.sketch));
  const measured = measuredRoomIds(block);
  const unmeasuredRooms = block.rooms.filter((room) => !measured.has(room.id));
  const unmeasuredVertices = new Set(
    unmeasuredRooms.flatMap((room) => room.vertexIds),
  );
  const shapeEdges = unmeasuredRooms.flatMap((room) => {
    const points = roomPoints(block, room);
    return room.vertexIds.map((id, i) => ({
      a: { vertex: id },
      b: { vertex: room.vertexIds[(i + 1) % points.length]! },
      length: distance(points[i]!, points[(i + 1) % points.length]!),
    }));
  });
  const contacts = sketchContacts(block);
  const slots: { index: number; axis: 'x' | 'y' }[] = [];
  const initial: number[] = [];
  initialBlock.vertices.forEach((vertex, index) => {
    if (vertex.id === firstVertex.id) return;
    slots.push({ index, axis: 'x' });
    initial.push(vertex.x);
    if (vertex.id !== secondVertex.id) {
      slots.push({ index, axis: 'y' });
      initial.push(vertex.y);
    }
  });
  const coordinateCount = initial.length;
  initial.push(...block.openings.map((opening) => opening.offset));
  const generatedConstraints = sketchConstraints(block);
  const constraints = [...block.constraints, ...generatedConstraints];
  const joins = block.joins.map((join) => ({
    join,
    openings: pairedOpening(block, join.via, join.a, join.b),
  }));
  function decode(x: number[]): Block {
    const vertices = initialBlock.vertices.map((vertex) => ({ ...vertex }));
    slots.forEach(({ index, axis }, i) => {
      vertices[index]![axis] = x[i]!;
    });
    return {
      ...block,
      vertices,
      openings: block.openings.map((opening, i) => ({
        ...opening,
        offset: x[coordinateCount + i]!,
      })),
    };
  }
  function residuals(x: number[]): number[] {
    const current = decode(x);
    const residuals: number[] = [];
    for (const measurement of current.measurements) {
      if (
        measurement.status !== 'done' ||
        measurement.value === null ||
        measurement.kind === 'height'
      )
        continue;
      residuals.push(
        (distance(
          resolvePoint(current, measurement.a),
          resolvePoint(current, measurement.b),
        ) -
          measurement.value) /
          measurement.sigma,
      );
    }
    for (const constraint of constraints) {
      if (constraint.hard) continue;
      const weight = Math.sqrt(constraint.weight ?? 1);
      const roomId = constraint.edges[0]![0];
      const angleSigma =
        constraint.kind === 'perpendicular' &&
        !measured.has(roomId) &&
        constraint.edges.every(([id]) => id === roomId)
          ? UNMEASURED_ANGLE_SIGMA
          : ANGLE_SIGMA;
      _constraintResiduals(current, constraint).forEach((value, i) =>
        residuals.push((value * weight) / (i === 0 ? angleSigma : JOIN_SIGMA)),
      );
    }
    current.vertices.forEach((vertex, i) => {
      const sigma = unmeasuredVertices.has(vertex.id)
        ? UNMEASURED_ANCHOR_SIGMA
        : SKETCH_SIGMA;
      residuals.push(
        (vertex.x - priors[i]!.x) / sigma,
        (vertex.y - priors[i]!.y) / sigma,
      );
    });
    for (const edge of shapeEdges)
      residuals.push(
        (distance(
          resolvePoint(current, edge.a),
          resolvePoint(current, edge.b),
        ) -
          edge.length) /
          UNMEASURED_EDGE_SIGMA,
      );
    for (const contact of contacts)
      residuals.push(...contactResiduals(current, contact));
    current.openings.forEach((opening, i) =>
      residuals.push(
        (opening.offset - block.openings[i]!.offset) / SKETCH_SIGMA,
      ),
    );
    for (const {
      join,
      openings: [openingA, openingB],
    } of joins) {
      const [a, b] = edgeEndpoints(current, join.a);
      const [c, d] = edgeEndpoints(current, join.b);
      const lengthA = Math.max(1e-12, distance(a, b));
      const lengthB = Math.max(1e-12, distance(c, d));
      const u = { x: (b.x - a.x) / lengthA, y: (b.y - a.y) / lengthA };
      const v = { x: (d.x - c.x) / lengthB, y: (d.y - c.y) / lengthB };
      // Facing CCW walls have opposite directions; B lies along A's right normal.
      residuals.push((u.x + v.x) / ANGLE_SIGMA, (u.y + v.y) / ANGLE_SIGMA);
      const normal = { x: u.y, y: -u.x };
      residuals.push(
        ((c.x - a.x) * normal.x + (c.y - a.y) * normal.y - join.thickness) /
          JOIN_SIGMA,
      );
      for (const side of [0, 1] as const) {
        const pa = resolvePoint(current, { jamb: openingA.id, side });
        const pb = resolvePoint(current, {
          jamb: openingB.id,
          side: side === 0 ? 1 : 0,
        });
        residuals.push(
          (pb.x - pa.x - normal.x * join.thickness) / JOIN_SIGMA,
          (pb.y - pa.y - normal.y * join.thickness) / JOIN_SIGMA,
        );
      }
    }
    return residuals;
  }
  function hardResiduals(x: number[]): number[] {
    const current = decode(x);
    return constraints
      .filter((constraint) => constraint.hard)
      .flatMap((constraint) => _constraintResiduals(current, constraint));
  }
  function feasible(x: number[]): boolean {
    if (!x.every(Number.isFinite)) return false;
    const current = decode(x);
    if (
      current.vertices.find((vertex) => vertex.id === secondVertex.id)!.x <= 0
    )
      return false;
    try {
      for (const room of current.rooms) {
        const points = roomPoints(current, room, false);
        validatePolygon(points);
        if (signedArea(points) <= 0) return false;
      }
    } catch {
      return false;
    }
    return current.openings.every(
      (opening) =>
        opening.offset >= 0 &&
        opening.offset + opening.width <=
          distance(...edgeEndpoints(current, [opening.roomId, opening.edge])) +
            1e-8,
    );
  }
  return {
    initial,
    decode,
    residuals,
    hardResiduals,
    feasible,
    generatedConstraints,
  };
}
