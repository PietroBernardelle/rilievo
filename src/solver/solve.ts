import type { Block, Constraint, Point } from '../model/types';
import { connectedRoomGroups, roomSubBlock } from './components';
import { levenbergMarquardt } from './lm';
import { createFitProblem } from './problem';

export interface GeometryFit {
  block: Block;
  generatedConstraints: Constraint[];
  iterations: number;
  converged: boolean;
  hardError: number;
}
function _frame(block: Block): { origin: Point; cosine: number; sine: number } {
  const room = block.rooms[0]!;
  const a = block.vertices.find((vertex) => vertex.id === room.vertexIds[0])!;
  const b = block.vertices.find((vertex) => vertex.id === room.vertexIds[1])!;
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  return {
    origin: a,
    cosine: (b.x - a.x) / length,
    sine: (b.y - a.y) / length,
  };
}
export function solveGeometry(
  block: Block,
  maxIterations: number,
): GeometryFit {
  if (!block.rooms.length)
    return {
      block,
      generatedConstraints: [],
      iterations: 0,
      converged: true,
      hardError: 0,
    };
  const owned = new Set(block.rooms.flatMap((room) => room.vertexIds));
  // Orphan vertices may carry measurements; keep the existing full-block treatment.
  const roomGroups = block.vertices.some((vertex) => !owned.has(vertex.id))
    ? [block.rooms.map((room) => room.id)]
    : connectedRoomGroups(block);
  const groups =
    roomGroups.length === 1
      ? [block]
      : roomGroups.map((ids) => roomSubBlock(block, ids));
  const globalFrame = _frame(block);
  const vertices = new Map(block.vertices.map((vertex) => [vertex.id, vertex]));
  const openings = new Map(
    block.openings.map((opening) => [opening.id, opening]),
  );
  const generatedConstraints: Constraint[] = [];
  let iterations = 0;
  let converged = true;
  let hardError = 0;
  for (const group of groups) {
    const problem = createFitProblem(group);
    const optimized = levenbergMarquardt(
      problem,
      problem.initial,
      maxIterations,
    );
    const fitted = problem.decode(optimized.x);
    const localFrame = _frame(group);
    for (const vertex of fitted.vertices) {
      if (group.rooms[0]!.id === block.rooms[0]!.id) {
        vertices.set(vertex.id, vertex);
        continue;
      }
      // Return independent components to their original positions in the block's gauge.
      const x =
        localFrame.origin.x +
        localFrame.cosine * vertex.x -
        localFrame.sine * vertex.y -
        globalFrame.origin.x;
      const y =
        localFrame.origin.y +
        localFrame.sine * vertex.x +
        localFrame.cosine * vertex.y -
        globalFrame.origin.y;
      vertices.set(vertex.id, {
        ...vertex,
        x: globalFrame.cosine * x + globalFrame.sine * y,
        y: -globalFrame.sine * x + globalFrame.cosine * y,
      });
    }
    for (const opening of fitted.openings) openings.set(opening.id, opening);
    generatedConstraints.push(...problem.generatedConstraints);
    iterations += optimized.iterations;
    converged &&= optimized.converged;
    hardError = Math.max(hardError, optimized.hardError);
  }
  return {
    block: {
      ...block,
      vertices: block.vertices.map((vertex) => vertices.get(vertex.id)!),
      openings: block.openings.map((opening) => openings.get(opening.id)!),
    },
    generatedConstraints,
    iterations,
    converged,
    hardError,
  };
}
