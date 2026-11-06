import { area, containsPoint, distance, roomPoints } from '../model/geometry';
import { oppositeOpening, wallThickness } from '../model/openings';
import { edgeEndpoints, resolvePoint } from '../model/points';
import type { Block, Opening, Point, Room } from '../model/types';
import { contactedEdges } from './openings';

export function drawnWallThickness(
  block: Block,
  roomId: string,
  edge: number,
): number {
  const join = block.joins.find((item) =>
    [item.a, item.b].some(([id, index]) => id === roomId && index === edge),
  );
  if (join?.measured === false) return 0;
  if (!join && contactedEdges(block, [roomId, edge]).length) return 0;
  return wallThickness(block, [roomId, edge]).value;
}
export function wallShapes(block: Block, room: Room): Point[][] {
  const points = roomPoints(block, room, false);
  const walls = points.map((a, i) => {
    const b = points[(i + 1) % points.length]!;
    const length = distance(a, b);
    const u = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
    const thickness = drawnWallThickness(block, room.id, i);
    return {
      a,
      b,
      u,
      length,
      thickness,
      shift: { x: u.y * thickness, y: -u.x * thickness },
    };
  });
  const outer = walls.map((wall, i): Point => {
    const previous = walls[(i + walls.length - 1) % walls.length]!;
    const a = {
      x: wall.a.x + previous.shift.x,
      y: wall.a.y + previous.shift.y,
    };
    const b = { x: wall.a.x + wall.shift.x, y: wall.a.y + wall.shift.y };
    const denominator = previous.u.x * wall.u.y - previous.u.y * wall.u.x;
    if (Math.abs(denominator) < 1e-8) return b;
    const t = ((b.x - a.x) * wall.u.y - (b.y - a.y) * wall.u.x) / denominator;
    const intersection = {
      x: a.x + t * previous.u.x,
      y: a.y + t * previous.u.y,
    };
    return distance(intersection, wall.a) <=
      4 * Math.max(wall.thickness, previous.thickness) + 1e-8
      ? intersection
      : b;
  });
  return walls.flatMap((wall, i) => {
    const openings = block.openings
      .filter((item) => item.roomId === room.id && item.edge === i)
      .sort((a, b) => a.offset - b.offset);
    const intervals: [number, number][] = [];
    let start = 0;
    for (const opening of openings) {
      if (opening.offset > start)
        intervals.push([start, Math.min(opening.offset, wall.length)]);
      start = Math.max(start, opening.offset + opening.width);
    }
    if (start < wall.length) intervals.push([start, wall.length]);
    const point = (t: number): Point => ({
      x: wall.a.x + t * wall.u.x,
      y: wall.a.y + t * wall.u.y,
    });
    const shifted = (p: Point): Point => ({
      x: p.x + wall.shift.x,
      y: p.y + wall.shift.y,
    });
    return intervals.map(([from, to]) => {
      const a = point(from);
      const b = point(to);
      return [
        a,
        b,
        to === wall.length ? outer[(i + 1) % outer.length]! : shifted(b),
        from === 0 ? outer[i]! : shifted(a),
      ];
    });
  });
}

type Segment = [Point, Point];
const LINE_EPSILON = 1e-7;
function _cross(a: Point, b: Point): number {
  return a.x * b.y - a.y * b.x;
}

// Split at every poche boundary, then keep only portions on the outside of its
// union. Testing both sides also removes seams between adjacent filled pieces.
export function visibleWallLines(line: Segment, poche: Point[][]): Segment[] {
  const [a, b] = line;
  const length = distance(a, b);
  if (length < LINE_EPSILON) return [];
  const delta = { x: b.x - a.x, y: b.y - a.y };
  const cuts = [0, 1];
  for (const polygon of poche) {
    for (let i = 0; i < polygon.length; i++) {
      const c = polygon[i]!;
      const d = polygon[(i + 1) % polygon.length]!;
      const edge = { x: d.x - c.x, y: d.y - c.y };
      const offset = { x: c.x - a.x, y: c.y - a.y };
      const denominator = _cross(delta, edge);
      if (Math.abs(denominator) > LINE_EPSILON * length) {
        const t = _cross(offset, edge) / denominator;
        const u = _cross(offset, delta) / denominator;
        if (t > 0 && t < 1 && u >= -LINE_EPSILON && u <= 1 + LINE_EPSILON)
          cuts.push(t);
      } else if (Math.abs(_cross(offset, delta)) < LINE_EPSILON * length) {
        for (const point of [c, d]) {
          const t =
            ((point.x - a.x) * delta.x + (point.y - a.y) * delta.y) /
            length ** 2;
          if (t > 0 && t < 1) cuts.push(t);
        }
      }
    }
  }
  cuts.sort((x, y) => x - y);
  const pointAt = (t: number): Point => ({
    x: a.x + t * delta.x,
    y: a.y + t * delta.y,
  });
  const normal = {
    x: (-delta.y / length) * LINE_EPSILON * 10,
    y: (delta.x / length) * LINE_EPSILON * 10,
  };
  const intervals: [number, number][] = [];
  for (let i = 1; i < cuts.length; i++) {
    const from = cuts[i - 1]!;
    const to = cuts[i]!;
    if ((to - from) * length < LINE_EPSILON) continue;
    const mid = pointAt((from + to) / 2);
    const filled = (sign: number): boolean =>
      poche.some((polygon) =>
        containsPoint(polygon, {
          x: mid.x + sign * normal.x,
          y: mid.y + sign * normal.y,
        }),
      );
    if (filled(-1) && filled(1)) continue;
    const previous = intervals.at(-1);
    if (previous && Math.abs(previous[1] - from) * length < LINE_EPSILON)
      previous[1] = to;
    else intervals.push([from, to]);
  }
  return intervals.map(([from, to]) => [pointAt(from), pointAt(to)]);
}

export function wallDrawing(
  block: Block,
): { roomId: string; shapes: Point[][]; lines: Segment[] }[] {
  const rooms = block.rooms.map((room) => ({
    roomId: room.id,
    shapes: wallShapes(block, room),
  }));
  const poche = rooms
    .flatMap((room) => room.shapes)
    .filter((shape) => area(shape) > LINE_EPSILON);
  return rooms.map((room) => ({
    ...room,
    lines: room.shapes.flatMap((shape) =>
      (
        [
          [shape[0]!, shape[1]!],
          [shape[2]!, shape[3]!],
        ] as Segment[]
      ).flatMap((line) => visibleWallLines(line, poche)),
    ),
  }));
}

export function doorSwing(
  block: Block,
  opening: Opening,
): { hinge: Point; closed: Point; leaf: Point; width: number } {
  // A paired door swinging out of its owner opens into the other room. Use
  // that room's actual jambs, rather than drawing the arc through the wall.
  const facing =
    opening.swing === 'out' ? oppositeOpening(block, opening.id) : undefined;
  const side = facing ?? opening;
  const [a, b] = edgeEndpoints(block, [side.roomId, side.edge]);
  const length = distance(a, b);
  const u = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
  const outward = !facing && opening.swing === 'out';
  const shift = outward ? drawnWallThickness(block, side.roomId, side.edge) : 0;
  const jamb = (end: 0 | 1): Point => {
    const p = resolvePoint(block, { jamb: side.id, side: end });
    return { x: p.x + u.y * shift, y: p.y - u.x * shift };
  };
  const hinge = jamb(side.hinge === 1 ? 1 : 0);
  const closed = jamb(side.hinge === 1 ? 0 : 1);
  const direction = outward ? -1 : 1;
  return {
    hinge,
    closed,
    width: side.width,
    leaf: {
      x: hinge.x - u.y * side.width * direction,
      y: hinge.y + u.x * side.width * direction,
    },
  };
}
