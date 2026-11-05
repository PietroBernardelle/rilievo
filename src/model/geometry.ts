import type { Block, Point, Room } from './types';

export const GEOMETRY_EPSILON = 1e-8;
export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}
export function roomPoints(block: Block, room: Room, sketch = true): Point[] {
  return room.vertexIds.map((id) => {
    const vertex = block.vertices.find((item) => item.id === id);
    if (!vertex) throw new Error(`Missing corner ${id}.`);
    return sketch ? vertex.sketch : vertex;
  });
}
export const COORDINATE_DECIMALS = 4;
export function roundCoordinate(value: number): number {
  if (!Number.isFinite(value))
    throw new Error('Coordinates must be finite numbers.');
  const rounded = Number(value.toFixed(COORDINATE_DECIMALS));
  return rounded === 0 ? 0 : rounded;
}
export function roundPoint(point: Point): Point {
  return { x: roundCoordinate(point.x), y: roundCoordinate(point.y) };
}
export function signedArea(points: Point[]): number {
  if (points.length < 3) return 0;
  const origin = points[0]!;
  return (
    points.reduce((sum, a, i) => {
      const b = points[(i + 1) % points.length]!;
      return (
        sum +
        (a.x - origin.x) * (b.y - origin.y) -
        (b.x - origin.x) * (a.y - origin.y)
      );
    }, 0) / 2
  );
}
export function area(points: Point[]): number {
  return Math.abs(signedArea(points));
}
export function counterClockwise(points: Point[]): Point[] {
  return signedArea(points) < 0
    ? [points[0]!, ...points.slice(1).reverse()]
    : points;
}
export function perimeter(points: Point[]): number {
  return points.reduce(
    (sum, point, i) => sum + distance(point, points[(i + 1) % points.length]!),
    0,
  );
}
export function nearestOnSegment(point: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const denominator = dx * dx + dy * dy;
  const t =
    denominator === 0
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            ((point.x - a.x) * dx + (point.y - a.y) * dy) / denominator,
          ),
        );
  return { x: a.x + t * dx, y: a.y + t * dy };
}
export function containsPoint(points: Point[], point: Point): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]!;
    const b = points[j]!;
    if (distance(nearestOnSegment(point, a, b), point) < GEOMETRY_EPSILON)
      return true;
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}
function _cross(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}
function _intersects(a: Point, b: Point, c: Point, d: Point): boolean {
  const abC = _cross(a, b, c);
  const abD = _cross(a, b, d);
  const cdA = _cross(c, d, a);
  const cdB = _cross(c, d, b);
  if (abC * abD < 0 && cdA * cdB < 0) return true;
  return [
    distance(nearestOnSegment(a, c, d), a),
    distance(nearestOnSegment(b, c, d), b),
    distance(nearestOnSegment(c, a, b), c),
    distance(nearestOnSegment(d, a, b), d),
  ].some((value) => value < GEOMETRY_EPSILON);
}
export function validatePolygon(points: Point[]): void {
  if (points.length < 3)
    throw new Error('A room needs at least three corners.');
  if (
    points.some(
      (point) => !Number.isFinite(point.x) || !Number.isFinite(point.y),
    )
  )
    throw new Error('Corner coordinates must be finite numbers.');
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    if (distance(a, b) < GEOMETRY_EPSILON)
      throw new Error('Adjacent corners must be distinct.');
    for (let j = i + 1; j < points.length; j++) {
      if (j === i + 1 || (i === 0 && j === points.length - 1)) continue;
      if (_intersects(a, b, points[j]!, points[(j + 1) % points.length]!))
        throw new Error('Room edges cannot cross or overlap.');
    }
  }
  if (area(points) < GEOMETRY_EPSILON)
    throw new Error('A room must have a non-zero area.');
}
export function parseLength(input: string): number {
  const match = /^\s*(\d+(?:[.,]\d+)?|[.,]\d+)\s*(m|cm|mm)?\s*$/i.exec(input);
  if (!match)
    throw new Error('Enter a length such as 3.425, 3,425 or 342.5cm.');
  const unit = match[2]?.toLowerCase();
  const value =
    Number(match[1]!.replace(',', '.')) /
    (unit === 'cm' ? 100 : unit === 'mm' ? 1000 : 1);
  if (!Number.isFinite(value)) throw new Error('Length must be finite.');
  return value;
}
