import {
  distance,
  roundCoordinate,
  roundPoint,
  roomPoints,
  signedArea,
  validatePolygon,
} from './geometry';
import type { Block, EdgeRef, PointRef, Project } from './types';

export function normalizeBlock(block: Block): Block {
  const rounded = {
    ...block,
    vertices: block.vertices.map((vertex) => ({
      ...vertex,
      ...roundPoint(vertex),
      sketch: roundPoint(vertex.sketch),
    })),
  };
  const reversed = new Map<string, number>();
  for (const room of rounded.rooms) {
    const points = roomPoints(rounded, room, false);
    const sketch = roomPoints(rounded, room);
    validatePolygon(points);
    validatePolygon(sketch);
    if (signedArea(points) * signedArea(sketch) < 0)
      throw new Error(
        `Room ${room.id} has opposite fitted and sketch winding.`,
      );
    if (signedArea(points) < 0) reversed.set(room.id, points.length);
  }
  if (!reversed.size) return rounded;
  const edge = ([roomId, index]: EdgeRef): EdgeRef => [
    roomId,
    reversed.has(roomId) ? reversed.get(roomId)! - 1 - index : index,
  ];
  const reversedOpenings = new Set(
    block.openings
      .filter((opening) => reversed.has(opening.roomId))
      .map((opening) => opening.id),
  );
  function ref(point: PointRef): PointRef {
    if ('edgePoint' in point && reversed.has(point.edgePoint[0]))
      return { ...point, edgePoint: edge(point.edgePoint), t: 1 - point.t };
    if ('jamb' in point && reversedOpenings.has(point.jamb))
      return { ...point, side: point.side === 0 ? 1 : 0 };
    return point;
  }
  return {
    ...rounded,
    rooms: rounded.rooms.map((room) =>
      reversed.has(room.id)
        ? {
            ...room,
            vertexIds: [
              room.vertexIds[0]!,
              ...room.vertexIds.slice(1).reverse(),
            ],
          }
        : room,
    ),
    walls: rounded.walls.map((wall) => ({
      ...wall,
      edge: edge([wall.roomId, wall.edge])[1],
    })),
    openings: rounded.openings.map((opening) => {
      if (!reversed.has(opening.roomId)) return opening;
      const room = rounded.rooms.find((item) => item.id === opening.roomId)!;
      const points = roomPoints(rounded, room, false);
      const length = distance(
        points[opening.edge]!,
        points[(opening.edge + 1) % points.length]!,
      );
      return {
        ...opening,
        edge: edge([opening.roomId, opening.edge])[1],
        offset: roundCoordinate(length - opening.offset - opening.width),
      };
    }),
    constraints: rounded.constraints.map((constraint) => ({
      ...constraint,
      edges: constraint.edges.map(edge),
    })),
    joins: rounded.joins.map((join) => ({
      ...join,
      a: edge(join.a),
      b: edge(join.b),
    })),
    // Rejected records keep historical references, which may no longer resolve.
    measurements: rounded.measurements.map((measurement) =>
      measurement.status === 'rejected'
        ? measurement
        : { ...measurement, a: ref(measurement.a), b: ref(measurement.b) },
    ),
  };
}
export function normalizeProject(project: Project): Project {
  return {
    ...project,
    blocks: project.blocks.map((block) => ({
      ...normalizeBlock(block),
      placement: { ...block.placement, ...roundPoint(block.placement) },
    })),
  };
}
