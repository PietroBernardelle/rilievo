export function ProjectPanel() {
  return (
    <aside className="project-panel" aria-label="Project inspector">
      <section className="panel-section" aria-labelledby="blocks-heading">
        <h2 id="blocks-heading">Blocks</h2>
        <p className="empty-message">No blocks</p>
        <h2 id="rooms-heading">Rooms</h2>
        <p className="empty-message">No rooms</p>
      </section>
      <section className="panel-section" aria-labelledby="properties-heading">
        <h2 id="properties-heading">Properties</h2>
        <p className="empty-message">Nothing selected</p>
      </section>
      <section
        className="panel-section queue-panel"
        aria-labelledby="queue-heading"
      >
        <div className="panel-heading">
          <h2 id="queue-heading">Queue</h2>
          <span aria-label="0 of 0 measurements">0/0</span>
        </div>
        <p className="empty-message">No measurements</p>
      </section>
    </aside>
  );
}
