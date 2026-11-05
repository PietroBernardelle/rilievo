import { useState } from 'react';
import type { ReactNode } from 'react';
import { area, parseLength, perimeter, roomPoints } from '../model/geometry';
import type {
  Block,
  EdgeRef,
  Opening,
  Project,
  Room,
  Wall,
} from '../model/types';
import { roomHeightReadings } from '../model/heights';
import { wallThickness } from '../model/openings';
import type { OpeningChanges } from '../model/openings';
import { cornerName, pointLabel } from '../survey/points';
import { LengthField, OpeningProperties } from './OpeningProperties';
import type { RoomDiagnostics } from '../solver/diagnostics';
import { roomStatus } from '../survey/queue';
interface Props {
  project: Project;
  activeBlock: Block | undefined;
  selectedRoom: Room | undefined;
  selectedOpening: Opening | undefined;
  diagnostics: RoomDiagnostics[];
  settings: ReactNode;
  queue: ReactNode;
  onBlock: (id: string) => void;
  onSelect: (id: string) => void;
  onUpdate: (changes: { name?: string; height?: number }) => boolean;
  onOpeningSelect: (id: string) => void;
  onOpeningUpdate: (changes: OpeningChanges) => boolean;
  onOpeningLink: (otherId: string) => void;
  onOpeningUnlink: () => void;
  onOpeningDelete: () => void;
  onWallUpdate: (
    edge: EdgeRef,
    changes: Pick<Wall, 'thickness' | 'exterior'>,
  ) => boolean;
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
  selectedOpening,
  diagnostics,
  settings,
  queue,
  onBlock,
  onSelect,
  onUpdate,
  onOpeningSelect,
  onOpeningUpdate,
  onOpeningLink,
  onOpeningUnlink,
  onOpeningDelete,
  onWallUpdate,
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
        {selectedOpening && activeBlock ? (
          <OpeningProperties
            key={selectedOpening.id}
            block={activeBlock}
            opening={selectedOpening}
            onUpdate={onOpeningUpdate}
            onLink={onOpeningLink}
            onUnlink={onOpeningUnlink}
            onDelete={onOpeningDelete}
          />
        ) : selectedRoom && activeBlock ? (
          <RoomProperties
            key={`${activeBlock.id}:${selectedRoom.id}:${selectedRoom.name}:${selectedRoom.height}`}
            room={selectedRoom}
            block={activeBlock}
            onUpdate={onUpdate}
          />
        ) : (
          <p className="empty-message">Nothing selected</p>
        )}
        {selectedRoom && activeBlock && (
          <RoomDetails
            block={activeBlock}
            room={selectedRoom}
            onOpening={onOpeningSelect}
            onWall={onWallUpdate}
          />
        )}
      </section>
      {queue}
    </aside>
  );
}

function RoomDetails({
  block,
  room,
  onOpening,
  onWall,
}: {
  block: Block;
  room: Room;
  onOpening: Props['onOpeningSelect'];
  onWall: Props['onWallUpdate'];
}) {
  const heights = roomHeightReadings(block, room.id);
  return (
    <div className="room-details">
      <h3>Room heights</h3>
      {heights.readings.length ? (
        heights.readings.map((item) => (
          <p key={item.id}>
            ↕ {pointLabel(block, item.a)}: {item.value!.toFixed(3)} m
          </p>
        ))
      ) : (
        <p className="property-note">{room.height.toFixed(3)} m · unmeasured</p>
      )}
      {heights.sloping && (
        <p className="sloping-ceiling" role="status">
          Sloping ceiling · heights differ by more than 0.020 m
        </p>
      )}
      <details open={block.openings.some((item) => item.roomId === room.id)}>
        <summary>Openings</summary>
        <ul className="project-tree">
          {block.openings
            .filter((item) => item.roomId === room.id)
            .map((item) => (
              <li key={item.id}>
                <button type="button" onClick={() => onOpening(item.id)}>
                  {item.type} {item.id} · {item.width.toFixed(3)} m
                </button>
              </li>
            ))}
        </ul>
      </details>
      <details>
        <summary>Wall thickness per edge</summary>
        {room.vertexIds.map((id, i) => {
          const wall = wallThickness(block, [room.id, i]);
          return (
            <div className="properties-form wall-properties" key={id}>
              <LengthField
                key={wall.value}
                id={`wall-${room.id}-${i}`}
                label={`${cornerName(i)}–${cornerName((i + 1) % room.vertexIds.length)} (m)`}
                value={wall.value}
                onSave={(value) => onWall([room.id, i], { thickness: value })}
              />
              <small>
                {wall.measured ? 'measured' : 'unmeasured'} ·{' '}
                {wall.exterior ? 'exterior' : 'interior'}
              </small>
              <label>
                <input
                  type="checkbox"
                  checked={wall.exterior}
                  disabled={block.joins.some((join) =>
                    [join.a, join.b].some(
                      ([rid, edge]) => rid === room.id && edge === i,
                    ),
                  )}
                  onChange={(event) =>
                    onWall([room.id, i], { exterior: event.target.checked })
                  }
                />{' '}
                Exterior
              </label>
            </div>
          );
        })}
      </details>
    </div>
  );
}
