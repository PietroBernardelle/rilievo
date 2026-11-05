import { distance } from '../model/geometry';
import { requestMeasurement } from '../model/measurements';
import { openingJoin } from '../model/openings';
import { edgeEndpoints, pairedOpening } from '../model/points';
import type {
  Measurement,
  MeasurementTarget,
  Opening,
  PointRef,
  Project,
} from '../model/types';
import { samePoints } from './points';

export function ensureRoomDetails(
  project: Project,
  blockId: string,
  roomId: string,
): Project {
  let next = project;
  const block = () => next.blocks.find((item) => item.id === blockId)!;
  function add(
    a: PointRef,
    b: PointRef,
    kind: Measurement['kind'],
    target?: MeasurementTarget,
  ): void {
    if (
      block().measurements.some(
        (item) =>
          item.status !== 'rejected' &&
          item.kind === kind &&
          JSON.stringify(item.target) === JSON.stringify(target) &&
          ((samePoints(item.a, a) && samePoints(item.b, b)) ||
            (samePoints(item.a, b) && samePoints(item.b, a))),
      )
    )
      return;
    next = requestMeasurement(next, blockId, a, b, '', {
      kind,
      ...(target ? { target } : {}),
    }).project;
  }
  function jambs(opening: Opening): void {
    const room = block().rooms.find((item) => item.id === opening.roomId)!;
    const length = distance(
      ...edgeEndpoints(block(), [opening.roomId, opening.edge]),
    );
    const corner =
      opening.offset + opening.width / 2 <= length / 2
        ? opening.edge
        : (opening.edge + 1) % room.vertexIds.length;
    const a = { vertex: room.vertexIds[corner]! };
    for (const side of [0, 1] as const) {
      // Existing readings keep their chosen corner even after the fit shifts the opening.
      if (
        block().measurements.some(
          (item) =>
            item.status !== 'rejected' &&
            item.kind === 'offset' &&
            (('jamb' in item.a &&
              item.a.jamb === opening.id &&
              item.a.side === side) ||
              ('jamb' in item.b &&
                item.b.jamb === opening.id &&
                item.b.side === side)),
        )
      )
        continue;
      add(a, { jamb: opening.id, side }, 'offset');
    }
  }
  for (const opening of block().openings.filter(
    (item) => item.roomId === roomId,
  )) {
    const join = openingJoin(block(), opening.id);
    if (join && join.via !== opening.id) continue;
    jambs(opening);
    const point = { jamb: opening.id, side: 0 as const };
    add(point, point, 'height', {
      type: 'opening-height',
      openingId: opening.id,
    });
    if (opening.type === 'window') {
      add(point, point, 'height', { type: 'sill', openingId: opening.id });
      add(point, point, 'thickness', {
        type: 'wall-thickness',
        openingId: opening.id,
      });
    }
  }
  const room = block().rooms.find((item) => item.id === roomId)!;
  for (const index of [0, Math.floor(room.vertexIds.length / 2)]) {
    const point = { vertex: room.vertexIds[index]! };
    add(point, point, 'height', { type: 'room-height', roomId });
  }
  for (const join of block().joins) {
    const via = block().openings.find((item) => item.id === join.via)!;
    if (via.roomId !== roomId) continue;
    const pair = pairedOpening(
      block(),
      join.via,
      join.a,
      join.b,
      join.pairedWith,
    );
    const opposite = pair.find((item) => item.id !== via.id)!;
    add(
      { jamb: via.id, side: 0 },
      { jamb: opposite.id, side: 1 },
      'thickness',
      { type: 'join-thickness', joinId: join.id },
    );
    jambs(opposite);
  }
  return next;
}
