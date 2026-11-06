import type { Block } from '../model/types';
import { edgeEndpoints, resolvePoint } from '../model/points';
import { distance } from '../model/geometry';
import { openingJoin } from '../model/openings';
import { wallDrawing, doorSwing, drawnWallThickness } from '../tools/walls';
import { toScreen } from '../tools/viewport';
import type { Viewport } from '../tools/viewport';
import type { Selection } from './editor';

export function PlanWalls({
  block,
  view,
  selection,
}: {
  block: Block;
  view: Viewport;
  selection: Selection | null;
}) {
  const rooms = wallDrawing(block);
  const points = (shape: { x: number; y: number }[]): string =>
    shape
      .map((point) => {
        const p = toScreen(point, view);
        return `${p.x},${p.y}`;
      })
      .join(' ');
  return (
    <g className="plan-walls">
      {rooms.map((room) => (
        <g key={room.roomId} className="wall-room">
          {room.shapes.map((shape, i) => (
            <polygon key={i} points={points(shape)} />
          ))}
        </g>
      ))}
      {[...rooms]
        .sort(
          (a, b) =>
            Number(a.roomId === selection?.roomId) -
            Number(b.roomId === selection?.roomId),
        )
        .map((room) => (
          <g
            key={room.roomId}
            className={`wall-room${selection?.roomId === room.roomId ? ' selected' : ''}`}
          >
            {room.lines.map((line, i) => (
              <polyline key={i} points={points(line)} />
            ))}
          </g>
        ))}
    </g>
  );
}
export function PlanOpenings({
  block,
  view,
  selectedId,
}: {
  block: Block;
  view: Viewport;
  selectedId?: string;
}) {
  return (
    <g className="plan-openings">
      {[...block.openings]
        .sort(
          (a, b) => Number(a.id === selectedId) - Number(b.id === selectedId),
        )
        .map((opening) => {
          const join = openingJoin(block, opening.id);
          const [a, b] = edgeEndpoints(block, [opening.roomId, opening.edge]);
          const length = distance(a, b);
          const u = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
          const start = resolvePoint(block, { jamb: opening.id, side: 0 });
          const end = resolvePoint(block, { jamb: opening.id, side: 1 });
          const s = toScreen(start, view);
          const e = toScreen(end, view);
          const { hinge, closed, leaf, width } = doorSwing(block, opening);
          const h = toScreen(hinge, view);
          const c = toScreen(closed, view);
          const l = toScreen(leaf, view);
          const radius = width * view.scale;
          const sweep =
            (closed.x - hinge.x) * (leaf.y - hinge.y) -
              (closed.y - hinge.y) * (leaf.x - hinge.x) <
            0
              ? 1
              : 0;
          const thickness = drawnWallThickness(
            block,
            opening.roomId,
            opening.edge,
          );
          return (
            <g
              key={opening.id}
              data-opening-id={opening.id}
              className={`plan-opening ${opening.type}${selectedId === opening.id ? ' selected' : ''}`}
            >
              <title>
                {opening.type} {opening.id} · {opening.width.toFixed(3)} ×{' '}
                {opening.height.toFixed(3)} m
              </title>
              <line
                className="opening-hit"
                x1={s.x}
                y1={s.y}
                x2={e.x}
                y2={e.y}
              />
              {[start, end].map((point, i) => {
                const inner = toScreen(point, view);
                const outer = toScreen(
                  {
                    x: point.x + u.y * thickness,
                    y: point.y - u.x * thickness,
                  },
                  view,
                );
                return (
                  <line
                    key={`jamb-${i}`}
                    className="opening-jamb"
                    x1={inner.x}
                    y1={inner.y}
                    x2={outer.x}
                    y2={outer.y}
                  />
                );
              })}
              {opening.type === 'door' &&
                (!join || join.via === opening.id) && (
                  <>
                    <line x1={h.x} y1={h.y} x2={l.x} y2={l.y} />
                    <path
                      className="door-swing"
                      d={`M ${c.x} ${c.y} A ${radius} ${radius} 0 0 ${sweep} ${l.x} ${l.y}`}
                    />
                  </>
                )}
              {opening.type === 'window' &&
                [0.2, 0.5, 0.8].map((fraction) => {
                  const from = toScreen(
                    {
                      x: start.x + u.y * thickness * fraction,
                      y: start.y - u.x * thickness * fraction,
                    },
                    view,
                  );
                  const to = toScreen(
                    {
                      x: end.x + u.y * thickness * fraction,
                      y: end.y - u.x * thickness * fraction,
                    },
                    view,
                  );
                  return (
                    <line
                      key={fraction}
                      className="window-line"
                      x1={from.x}
                      y1={from.y}
                      x2={to.x}
                      y2={to.y}
                    />
                  );
                })}
              {selectedId === opening.id &&
                [s, e].map((point, i) => (
                  <rect
                    key={i}
                    className="opening-handle"
                    data-opening-end={i === 0 ? 'start' : 'end'}
                    x={point.x - 4}
                    y={point.y - 4}
                    width="8"
                    height="8"
                  />
                ))}
            </g>
          );
        })}
    </g>
  );
}
