import { distance, roomPoints } from '../model/geometry';
import { wallThickness } from '../model/openings';
import type { Block, Point, Room } from '../model/types';
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
