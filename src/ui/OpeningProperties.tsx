import { useState } from 'react';
import { parseLength } from '../model/geometry';
import { openingJoin, oppositeOpening } from '../model/openings';
import type { OpeningChanges } from '../model/openings';
import type { Block, Opening } from '../model/types';

export function LengthField({
  id,
  label,
  value,
  onSave,
}: {
  id: string;
  label: string;
  value: number;
  onSave: (value: number) => boolean;
}) {
  const [text, setText] = useState(value.toFixed(3));
  const [error, setError] = useState('');
  return (
    <>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        inputMode="decimal"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => {
          try {
            const number = parseLength(text);
            if (onSave(number)) {
              setText(number.toFixed(3));
              setError('');
            }
          } catch (cause) {
            setError(
              cause instanceof Error ? cause.message : 'Invalid length.',
            );
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') {
            setText(value.toFixed(3));
            setError('');
          }
        }}
      />
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
export function OpeningProperties({
  block,
  opening,
  onUpdate,
  onLink,
  onUnlink,
  onDelete,
}: {
  block: Block;
  opening: Opening;
  onUpdate: (changes: OpeningChanges) => boolean;
  onLink: (otherId: string) => void;
  onUnlink: () => void;
  onDelete: () => void;
}) {
  const join = openingJoin(block, opening.id);
  const opposite = oppositeOpening(block, opening.id);
  const candidates = block.openings.filter(
    (item) =>
      item.roomId !== opening.roomId &&
      item.type === opening.type &&
      !openingJoin(block, item.id),
  );
  const [pairId, setPairId] = useState('');
  return (
    <div className="properties-form opening-properties">
      <strong>
        {opening.type.toUpperCase()} {opening.id}
      </strong>
      <label htmlFor="opening-type">Type</label>
      <select
        id="opening-type"
        value={opening.type}
        onChange={(event) =>
          onUpdate({ type: event.target.value as Opening['type'] })
        }
      >
        <option value="door">Door</option>
        <option value="window">Window</option>
        <option value="arch">Arch</option>
      </select>
      {(['offset', 'width', 'height', 'sill'] as const)
        .filter((key) => key !== 'sill' || opening.type === 'window')
        .map((key) => (
          <LengthField
            key={`${key}:${opening[key]}`}
            id={`opening-${key}`}
            label={`${key[0]!.toUpperCase()}${key.slice(1)} (m)`}
            value={opening[key]}
            onSave={(value) => onUpdate({ [key]: value })}
          />
        ))}
      {opening.type === 'door' && (
        <>
          <label htmlFor="opening-hinge">Hinge side</label>
          <select
            id="opening-hinge"
            value={opening.hinge ?? 0}
            onChange={(event) =>
              onUpdate({ hinge: Number(event.target.value) as 0 | 1 })
            }
          >
            <option value="0">Jamb 1 (edge start)</option>
            <option value="1">Jamb 2 (edge end)</option>
          </select>
          <label htmlFor="opening-swing">Swing direction</label>
          <select
            id="opening-swing"
            value={opening.swing ?? 'in'}
            onChange={(event) =>
              onUpdate({ swing: event.target.value as 'in' | 'out' })
            }
          >
            <option value="in">In</option>
            <option value="out">Out</option>
          </select>
        </>
      )}
      {join && opposite ? (
        <>
          <p className="property-note">
            Paired with{' '}
            {block.rooms.find((room) => room.id === opposite.roomId)?.name} /{' '}
            {opposite.id}
          </p>
          <p className="property-note">
            Wall {join.thickness.toFixed(3)} m ·{' '}
            {join.measured === false ? 'unmeasured' : 'measured'}
          </p>
          <button type="button" className="bevel" onClick={onUnlink}>
            Unlink pair
          </button>
        </>
      ) : (
        opening.type !== 'window' && (
          <>
            <label htmlFor="opening-pair">Shared doorway</label>
            <select
              id="opening-pair"
              value={pairId}
              onChange={(event) => setPairId(event.target.value)}
            >
              <option value="">Choose opposite opening</option>
              {candidates.map((item) => (
                <option key={item.id} value={item.id}>
                  {block.rooms.find((room) => room.id === item.roomId)?.name} /{' '}
                  {item.id}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="bevel"
              disabled={!pairId}
              onClick={() => onLink(pairId)}
            >
              Link pair
            </button>
          </>
        )
      )}
      <button type="button" className="bevel" onClick={onDelete}>
        Delete {join ? 'doorway pair' : 'opening'}
      </button>
      <p className="property-note">
        Drag to move · drag the square ends to resize · 0.050 m snap
      </p>
    </div>
  );
}
