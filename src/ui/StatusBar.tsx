export function StatusBar() {
  return (
    <footer className="status-bar" role="status" aria-label="Drawing status">
      <span className="status-cell coordinates">X —&nbsp; Y —</span>
      <span className="status-cell">SNAP —</span>
      <span className="status-cell">GRID 0.100 m</span>
      <span className="status-cell">RMS —</span>
      <span className="status-cell survey-progress">0/0 done</span>
    </footer>
  );
}
