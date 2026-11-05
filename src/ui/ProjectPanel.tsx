import { useState } from 'react';
import type { ReactNode } from 'react';
import { area, parseLength, perimeter, roomPoints } from '../model/geometry';
import type { Block, Project, Room } from '../model/types';
import type { RoomDiagnostics } from '../solver/diagnostics';
import { roomStatus } from '../survey/queue';
interface Props {
  project: Project;
  activeBlock: Block | undefined;
  selectedRoom: Room | undefined;
  diagnostics: RoomDiagnostics[];
  settings: ReactNode;
  queue: ReactNode;
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
  const points = roomPoints(block, room, false);
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
      <p className="property-note">
        {block.measurements.some((item) => item.status === 'done')
          ? 'From fitted plan'
          : 'From sketch'}{' '}
        · metres
      </p>
    </div>
  );
}
export function ProjectPanel({
  project,
  activeBlock,
  selectedRoom,
  diagnostics,
  settings,
  queue,
  onBlock,
  onSelect,
  onUpdate,
}: Props) {
  return (
    <aside className="project-panel" aria-label="Project inspector">
      {settings}
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
            {activeBlock.rooms.map((room) => {
              const diagnostic = diagnostics.find(
                (item) => item.roomId === room.id,
              );
              const status = diagnostic ? roomStatus(diagnostic) : null;
              return (
                <li key={room.id}>
                  <button
                    type="button"
                    aria-current={selectedRoom?.id === room.id}
                    onClick={() => onSelect(room.id)}
                  >
                    {room.name}
                    {status && (
                      <small
                        className={`room-status ${status.replaceAll(' ', '-')}`}
                      >
                        {status}
                        {status === 'rigid but unchecked'
                          ? room.vertexIds.length === 4
                            ? ' · measure the second diagonal'
                            : ' · add a check measurement'
                          : ''}
                      </small>
                    )}
                  </button>
                </li>
              );
            })}
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
      {queue}
    </aside>
  );
}
