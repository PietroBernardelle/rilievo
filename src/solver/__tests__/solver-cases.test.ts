import { describe, expect, it } from 'vitest';
import { distance, parseLength, roomPoints } from '../../model/geometry';
import { fit, leaveOneOut, resolvePoint } from '../index';
import { joinedRooms, measurement, roomBlock, squareBlock } from './fixtures';
import type { Point } from '../../model/types';

function angle(a: Point, b: Point, c: Point): number {
  return (
    (Math.acos(
      ((a.x - b.x) * (c.x - b.x) + (a.y - b.y) * (c.y - b.y)) /
        (distance(a, b) * distance(c, b)),
    ) *
      180) /
    Math.PI
  );
}
function maximumResidual(result: ReturnType<typeof fit>): number {
  return Math.max(...result.residuals.map((item) => Math.abs(item.residual)));
}
describe('documented solver cases', () => {
  it('1. square room is square, within 1 mm and 0.05 degrees', () => {
    const input = squareBlock();
    const before = JSON.stringify(input);
    const result = fit(input);
    const points = roomPoints(result.block, result.block.rooms[0]!, false);
    expect(result.converged).toBe(true);
    expect(maximumResidual(result)).toBeLessThan(0.001);
    for (let i = 0; i < 4; i++)
      expect(
        Math.abs(
          angle(points[(i + 3) % 4]!, points[i]!, points[(i + 1) % 4]!) - 90,
        ),
      ).toBeLessThan(0.05);
    expect(Math.abs(distance(points[1]!, points[3]!) - 5)).toBeLessThan(0.001);
    expect(result.rooms[0]!.rigid).toBe(true);
    expect(points[0]).toMatchObject({ x: 0, y: 0 });
    expect(points[1]!.y).toBe(0);
    expect(points[1]!.x).toBeGreaterThan(0);
    expect(JSON.stringify(input)).toBe(before);
    expect(result.block.vertices.map((v) => v.sketch)).toEqual(
      input.vertices.map((v) => v.sketch),
    );
  });
  it('2. the soft right-angle prior does not square a measured parallelogram', () => {
    const result = fit(squareBlock(5.1));
    const points = roomPoints(result.block, result.block.rooms[0]!, false);
    expect(result.converged).toBe(true);
    expect(maximumResidual(result)).toBeLessThan(0.001);
    expect(
      Math.abs(angle(points[0]!, points[1]!, points[2]!) - 92.4119),
    ).toBeLessThan(0.05);
    expect(
      Math.abs(distance(points[1]!, points[3]!) - Math.sqrt(23.99)),
    ).toBeLessThan(0.001);
  });
  it('3. inconsistent diagonals are flagged and leaving out BD repairs the fit', () => {
    const input = squareBlock();
    input.measurements.push(
      measurement('BD', { vertex: 'v2' }, { vertex: 'v4' }, 5.3),
    );
    const result = fit(input);
    expect(result.converged).toBe(true);
    expect(['AC', 'BD']).toContain(result.worstMeasurementId);
    expect(
      result.residuals.some(
        (item) => item.flagged && Math.abs(item.residual) > 0.015,
      ),
    ).toBe(true);
    const withoutBD = leaveOneOut(input).find(
      (item) => item.omittedId === 'BD',
    )!;
    expect(withoutBD.converged).toBe(true);
    expect(withoutBD.maxResidual).toBeLessThan(0.001);
  });
  it('4. four perimeter lengths are not rigid and a diagonal is suggested', () => {
    const input = squareBlock();
    input.measurements.pop();
    const result = fit(input);
    expect(result.converged).toBe(true);
    expect(result.rooms[0]).toMatchObject({
      rank: 4,
      required: 5,
      rigid: false,
      nextMeasurement: { a: { vertex: 'v1' }, b: { vertex: 'v3' } },
    });
    expect(maximumResidual(result)).toBeLessThan(0.001);
  });
  it('5. the six-corner L is rigid after nine independent distances', () => {
    const exact = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 2 },
      { x: 3, y: 2 },
      { x: 3, y: 4 },
      { x: 0, y: 4 },
    ];
    const input = roomBlock([
      { x: 0, y: 0 },
      { x: 5.1, y: 0 },
      { x: 5, y: 2.1 },
      { x: 3.1, y: 2.1 },
      { x: 3, y: 4.1 },
      { x: 0, y: 4 },
    ]);
    const ids = input.rooms[0]!.vertexIds;
    input.measurements = exact.map((a, i) =>
      measurement(
        `wall${i}`,
        { vertex: ids[i]! },
        { vertex: ids[(i + 1) % 6]! },
        distance(a, exact[(i + 1) % 6]!),
      ),
    );
    for (const i of [2, 3, 4])
      input.measurements.push(
        measurement(
          `diagonal${i}`,
          { vertex: ids[0]! },
          { vertex: ids[i]! },
          distance(exact[0]!, exact[i]!),
        ),
      );
    const result = fit(input);
    expect(result.converged).toBe(true);
    expect(result.rooms[0]).toMatchObject({
      rank: 9,
      required: 9,
      rigid: true,
    });
    roomPoints(result.block, result.block.rooms[0]!, false).forEach(
      (point, i) => expect(distance(point, exact[i]!)).toBeLessThan(0.001),
    );
    expect(maximumResidual(result)).toBeLessThan(0.001);
  });
  it('6. doorway jambs align across a measured 0.30 m shared wall', () => {
    const result = fit(joinedRooms());
    expect(result.converged).toBe(true);
    expect(maximumResidual(result)).toBeLessThan(0.001);
    const a = roomPoints(result.block, result.block.rooms[0]!, false);
    const b = roomPoints(result.block, result.block.rooms[1]!, false);
    expect(Math.abs(b[0]!.x - a[1]!.x - 0.3)).toBeLessThan(0.001);
    expect(Math.abs(b[0]!.y + 0.9)).toBeLessThan(0.001);
    expect(Math.abs(b[1]!.x - a[0]!.x - 7.3)).toBeLessThan(0.001);
    expect(Math.abs(b[3]!.x - b[0]!.x - (a[2]!.x - a[1]!.x))).toBeLessThan(
      0.001,
    );
    for (const side of [0, 1] as const) {
      const pa = resolvePoint(result.block, { jamb: 'o1', side });
      const pb = resolvePoint(result.block, {
        jamb: 'o2',
        side: side === 0 ? 1 : 0,
      });
      expect(Math.abs(pb.x - pa.x - 0.3)).toBeLessThan(0.001);
      expect(Math.abs(pb.y - pa.y)).toBeLessThan(0.001);
    }
  });
  it('7. Italian and unit-bearing number inputs work; malformed input fails', () => {
    expect(parseLength('3,425')).toBe(3.425);
    expect(parseLength('342.5cm')).toBe(3.425);
    expect(parseLength('3425mm')).toBe(3.425);
    expect(() => parseLength('3.4.2')).toThrow();
  });
});
