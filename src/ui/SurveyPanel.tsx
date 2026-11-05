import type { Block } from '../model/types';
import type { consistencyDiagnostics } from '../solver/diagnostics';
import { measurementLabel } from '../survey/points';
import { surveyMeasurements } from '../survey/queue';

export function SurveyPanel({
  block,
  diagnostics,
  currentId,
  active,
  onPick,
  onMove,
}: {
  block: Block | undefined;
  diagnostics: ReturnType<typeof consistencyDiagnostics> | null;
  currentId: string | null;
  active: boolean;
  onPick: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
}) {
  const queue = block ? surveyMeasurements(block) : [];
  const done = queue.filter((item) => item.status === 'done').length;
  const suspects = new Map<string, number>();
  for (const scope of [
    ...(diagnostics?.rooms ?? []),
    ...(diagnostics?.groups ?? []),
  ])
    for (const item of scope.suspectMeasurements)
      suspects.set(
        item.id,
        Math.max(
          suspects.get(item.id) ?? 0,
          Math.abs(item.standardizedResidual),
        ),
      );
  return (
    <section
      className="panel-section queue-panel"
      aria-labelledby="queue-heading"
    >
      <div className="panel-heading">
        <h2 id="queue-heading">Queue</h2>
        <span>
          {done}/{queue.length}
        </span>
      </div>
      {suspects.size > 0 && (
        <div className="suspect-panel">
          <h3>Re-measure suggestions</h3>
          <p>Inconsistent distances. Check in this order:</p>
          <ol>
            {[...suspects]
              .sort((a, b) => b[1] - a[1])
              .map(([id]) => {
                const item = queue.find((measurement) => measurement.id === id);
                return (
                  item && (
                    <li key={id}>
                      <button type="button" onClick={() => onPick(id)}>
                        Re-measure {measurementLabel(block!, item)}
                      </button>
                    </li>
                  )
                );
              })}
          </ol>
        </div>
      )}
      {!queue.length && (
        <p className="empty-message">Press S to survey walls and diagonals.</p>
      )}
      {!!queue.length && (
        <ol className="measurement-queue">
          {queue.map((item, i) => {
            const residual = diagnostics?.residuals.find(
              (entry) => entry.id === item.id,
            );
            const colour = residual?.flagged
              ? 'flagged'
              : residual?.unchecked
                ? 'unchecked'
                : item.status;
            return (
              <li
                key={item.id}
                className={colour}
                data-measurement-id={item.id}
              >
                <button
                  type="button"
                  className="queue-item"
                  aria-current={active && currentId === item.id}
                  onClick={() => onPick(item.id)}
                >
                  <span>{measurementLabel(block!, item)}</span>
                  <small>
                    {item.status === 'done' && item.value !== null
                      ? `${item.value.toFixed(3)} m`
                      : item.status}
                    {residual && (
                      <>
                        {' '}
                        · Δ {residual.residual >= 0 ? '+' : ''}
                        {residual.residual.toFixed(3)} m
                        {residual.unchecked ? ' · unchecked' : ''}
                      </>
                    )}
                  </small>
                </button>
                {active && currentId === item.id && (
                  <span className="queue-order">
                    <button
                      type="button"
                      disabled={i === 0}
                      aria-label="Move measurement earlier"
                      onClick={() => onMove(item.id, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={i === queue.length - 1}
                      aria-label="Move measurement later"
                      onClick={() => onMove(item.id, 1)}
                    >
                      ↓
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {active && !currentId && queue.length > 0 && (
        <p className="queue-finished">
          Queue finished. Review room status; skipped or unchecked distances may
          still need a measurement.
        </p>
      )}
    </section>
  );
}
