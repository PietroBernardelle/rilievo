import { oppositeOpening } from './openings';
import type { Block, Measurement } from './types';

export const SLOPING_CEILING_TOLERANCE = 0.02;
export function roomHeightReadings(
  block: Block,
  roomId: string,
): { readings: Measurement[]; sloping: boolean } {
  const readings = block.measurements.filter(
    (item) =>
      item.status === 'done' &&
      item.value !== null &&
      item.target?.type === 'room-height' &&
      item.target.roomId === roomId,
  );
  const values = readings.map((item) => item.value!);
  return {
    readings,
    sloping:
      values.length > 1 &&
      Math.max(...values) - Math.min(...values) >
        SLOPING_CEILING_TOLERANCE + 1e-9,
  };
}
// Scalar readings update dimensions, but never become distances in the 2D fit.
export function applyScalarReading(block: Block, item: Measurement): Block {
  if (item.status !== 'done' || item.value === null || !item.target)
    return block;
  const target = item.target;
  if (target.type === 'room-height') {
    const { readings } = roomHeightReadings(block, target.roomId);
    const height =
      readings.reduce((sum, reading) => sum + reading.value!, 0) /
      readings.length;
    return {
      ...block,
      rooms: block.rooms.map((room) =>
        room.id === target.roomId ? { ...room, height } : room,
      ),
    };
  }
  if (target.type === 'join-thickness')
    return {
      ...block,
      joins: block.joins.map((join) =>
        join.id === target.joinId
          ? { ...join, thickness: item.value!, measured: true }
          : join,
      ),
    };
  const opening = block.openings.find((entry) => entry.id === target.openingId);
  if (!opening) throw new Error('Measurement references a missing opening.');
  if (target.type === 'wall-thickness') {
    const wall = block.walls.find(
      (entry) => entry.roomId === opening.roomId && entry.edge === opening.edge,
    );
    return {
      ...block,
      walls: [
        ...block.walls.filter((entry) => entry !== wall),
        {
          ...wall,
          roomId: opening.roomId,
          edge: opening.edge,
          thickness: item.value,
        },
      ],
    };
  }
  const paired = oppositeOpening(block, opening.id);
  const key = target.type === 'sill' ? 'sill' : 'height';
  return {
    ...block,
    openings: block.openings.map((entry) =>
      entry.id === opening.id || entry.id === paired?.id
        ? { ...entry, [key]: item.value! }
        : entry,
    ),
  };
}
