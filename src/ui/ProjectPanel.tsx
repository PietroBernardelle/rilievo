import { useState } from 'react';
import { area, parseLength, perimeter, roomPoints } from '../model/geometry';
import type { Block, Project, Room } from '../model/types';
interface Props {
  project: Project;
  activeBlock: Block | undefined;
  selectedRoom: Room | undefined;
  onBlock: (id: string) => void;
  onSelect: (id: string) => void;
  onUpdate: (changes: { name?: string; height?: number }) => boolean;
}
function RoomProperties({
  room,
  block,
  onUpdate,
}: {
  room: Room;
  block: Block;
  onUpdate: Props['onUpdate'];
}) {
  const [name, setName] = useState(room.name);
  const [height, setHeight] = useState(room.height.toFixed(3));
  const [error, setError] = useState('');
  const points = roomPoints(block, room);
  function saveHeight(): void {
    try {
      const value = parseLength(height);
      if (value <= 0) throw new Error('Height must be greater than zero.');
      if (onUpdate({ height: value })) {
        setHeight(value.toFixed(3));
        setError('');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Invalid height.');
    }
  }
  return (
    <div className="properties-form">
      <label htmlFor="room-name">Name</label>
      <input
        id="room-name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        onBlur={() => {
          if (!name.trim()) {
            setError('Room name cannot be empty.');
            return;
          }
          if (onUpdate({ name })) {
            setName(name.trim());
            setError('');
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') {
            setName(room.name);
            setError('');
          }
        }}
      />
      <label htmlFor="room-height">Height (m)</label>
      <input
        id="room-height"
        inputMode="decimal"
        value={height}
        onChange={(event) => setHeight(event.target.value)}
        onBlur={saveHeight}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') {
            setHeight(room.height.toFixed(3));
            setError('');
          }
        }}
      />
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <dl>
        <dt>Area</dt>
        <dd>{area(points).toFixed(3)} m²</dd>
        <dt>Perimeter</dt>
        <dd>{perimeter(points).toFixed(3)} m</dd>
      </dl>
      <p className="property-note">From sketch · metres</p>
    </div>
  );
}
export function ProjectPanel({
  project,
  activeBlock,
  selectedRoom,
  onBlock,
  onSelect,
  onUpdate,
}: Props) {
  const done =
    activeBlock?.measurements.filter((item) => item.status === 'done').length ??
    0;
  const total = activeBlock?.measurements.length ?? 0;
  return (
    <aside className="project-panel" aria-label="Project inspector">
      <section className="panel-section" aria-labelledby="blocks-heading">
        <h2 id="blocks-heading">Blocks</h2>
        {project.blocks.length ? (
          <ul className="project-tree">
            {project.blocks.map((block) => (
              <li key={block.id}>
                <button
                  type="button"
                  aria-current={activeBlock?.id === block.id}
                  onClick={() => onBlock(block.id)}
                >
                  {activeBlock?.id === block.id ? '> ' : '  '}
                  {block.name}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-message">No blocks</p>
        )}
        <h2 id="rooms-heading">Rooms</h2>
        {activeBlock?.rooms.length ? (
          <ul className="project-tree">
            {activeBlock.rooms.map((room) => (
              <li key={room.id}>
                <button
                  type="button"
                  aria-current={selectedRoom?.id === room.id}
                  onClick={() => onSelect(room.id)}
                >
                  {room.name}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-message">No rooms</p>
        )}
      </section>
      <section className="panel-section" aria-labelledby="properties-heading">
        <h2 id="properties-heading">Properties</h2>
        {selectedRoom && activeBlock ? (
          <RoomProperties
            key={`${activeBlock.id}:${selectedRoom.id}:${selectedRoom.name}:${selectedRoom.height}`}
            room={selectedRoom}
            block={activeBlock}
            onUpdate={onUpdate}
          />
        ) : (
          <p className="empty-message">Nothing selected</p>
        )}
      </section>
      <section
        className="panel-section queue-panel"
        aria-labelledby="queue-heading"
      >
        <div className="panel-heading">
          <h2 id="queue-heading">Queue</h2>
          <span>
            {done}/{total}
          </span>
        </div>
        <p className="empty-message">
          {total ? 'Survey not yet available' : 'No measurements'}
        </p>
      </section>
    </aside>
  );
}
