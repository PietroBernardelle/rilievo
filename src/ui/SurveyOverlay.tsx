import type { Block, Measurement, PointRef } from '../model/types';
import type { MeasurementResidual } from '../solver/diagnostics';
import { pointRoom, resolvePoint } from '../solver/geometry';
import { pointLabel } from '../survey/points';
import { toScreen } from '../tools/viewport';
import type { Viewport } from '../tools/viewport';

export function SurveyOverlay({
  block,
  current,
  picked,
  view,
  residuals,
  roomId,
}: {
  block: Block;
  current: Measurement | undefined;
  picked: PointRef | undefined;
  view: Viewport;
  residuals: MeasurementResidual[];
  roomId: string | undefined;
}) {
  const screen = (ref: PointRef) => toScreen(resolvePoint(block, ref), view);
  const a = current && screen(current.a);
  const b = current && screen(current.b);
  const vertical =
    current?.kind === 'height' || current?.target?.type === 'wall-thickness';
  return (
    <g className="survey-overlay" pointerEvents="none">
      <defs>
        <marker
          id="survey-arrowhead"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M0 0 10 5 0 10Z" fill="var(--color-measurement-current)" />
        </marker>
      </defs>
      {residuals.map((residual) => {
        const item = block.measurements.find(
          (measurement) => measurement.id === residual.id,
        )!;
        if (item.id === current?.id) return null;
        const start = screen(item.a);
        const end = screen(item.b);
        return (
          <line
            key={item.id}
            className={`measured-line ${residual.flagged ? 'flagged' : 'done'}${roomId && pointRoom(block, item.a) !== roomId ? ' dimmed' : ''}`}
            x1={start.x}
            y1={start.y}
            x2={end.x}
            y2={end.y}
          >
            <title>
              {item.value?.toFixed(3)} m · residual{' '}
              {residual.residual.toFixed(3)} m
              {residual.unchecked ? ' · unchecked' : ''}
            </title>
          </line>
        );
      })}
      {block.rooms
        .filter((room) => room.id === roomId)
        .flatMap((room) =>
          room.vertexIds.map((vertex) => {
            const point = screen({ vertex });
            return (
              <text
                key={vertex}
                className="survey-corner-label"
                x={point.x + 8}
                y={point.y - 10}
              >
                {pointLabel(block, { vertex })}
              </text>
            );
          }),
        )}
      {current && a && b && (
        <g
          data-current-measurement={current.id}
          className="current-measurement"
        >
          <line
            className="survey-arrow"
            x1={a.x}
            y1={a.y}
            x2={vertical ? a.x : b.x}
            y2={vertical ? a.y - 48 : b.y}
            markerStart={vertical ? 'url(#survey-arrowhead)' : undefined}
            markerEnd="url(#survey-arrowhead)"
          />
          <circle cx={a.x} cy={a.y} r="6" />
          {!vertical && <circle cx={b.x} cy={b.y} r="6" />}
          {vertical && (
            <text
              className="vertical-measurement-label"
              x={a.x + 12}
              y={a.y - 24}
            >
              {current.target?.type === 'sill'
                ? 'Sill height'
                : current.target?.type === 'wall-thickness'
                  ? 'Wall thickness'
                  : 'Height'}
            </text>
          )}
        </g>
      )}
      {picked && (
        <circle
          className="picked-measurement-point"
          cx={screen(picked).x}
          cy={screen(picked).y}
          r="7"
        />
      )}
    </g>
  );
}
