import type { Block } from '../model/types';
import type { Cursor } from './editor';
export function StatusBar({
  cursor,
  block,
}: {
  cursor: Cursor | null;
  block: Block | undefined;
}) {
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
      <span className="status-cell">RMS —</span>
      <span className="status-cell survey-progress">
        {block?.measurements.filter((item) => item.status === 'done').length ??
          0}
        /{block?.measurements.length ?? 0} done
      </span>
    </footer>
  );
}
