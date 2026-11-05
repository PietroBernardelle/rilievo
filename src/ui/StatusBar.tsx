import type { Block } from '../model/types';
import type { Cursor } from './editor';
import type { MeasurementResidual } from '../solver/diagnostics';
import { surveyMeasurements } from '../survey/queue';
export function StatusBar({
  cursor,
  block,
  residuals,
}: {
  cursor: Cursor | null;
  block: Block | undefined;
  residuals: MeasurementResidual[];
}) {
  const queue = block ? surveyMeasurements(block) : [];
  const rms = residuals.length
    ? Math.sqrt(
        residuals.reduce((sum, item) => sum + item.normalized ** 2, 0) /
          residuals.length,
      )
    : null;
  return (
    <footer className="status-bar" role="status" aria-label="Drawing status">
      <span className="status-cell coordinates">
        X {cursor?.point.x.toFixed(3) ?? '—'}&nbsp; Y{' '}
        {cursor?.point.y.toFixed(3) ?? '—'}
      </span>
      <span className="status-cell">
        SNAP {cursor ? (cursor.snap?.toUpperCase() ?? 'OFF') : 'ON'}
      </span>
      <span className="status-cell">GRID 0.100 m</span>
      <span
        className="status-cell"
        title="RMS of residuals divided by their measurement uncertainty"
      >
        RMS {rms === null ? '—' : rms.toFixed(3)} σ
      </span>
      <span className="status-cell survey-progress">
        {queue.filter((item) => item.status === 'done').length}/{queue.length}{' '}
        done
      </span>
    </footer>
  );
}
