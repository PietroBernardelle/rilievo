import { useState } from 'react';
import { parseLength } from '../model/geometry';

export function SettingsPanel({
  placementSigma,
  onSave,
  onClose,
}: {
  placementSigma: number;
  onSave: (value: number) => boolean;
  onClose: () => void;
}) {
  const [value, setValue] = useState(placementSigma.toFixed(3));
  const [error, setError] = useState('');
  function save(): void {
    try {
      if (onSave(parseLength(value))) setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Invalid uncertainty.');
    }
  }
  return (
    <section
      className="panel-section settings-panel"
      aria-labelledby="settings-heading"
    >
      <div className="panel-heading">
        <h2 id="settings-heading">Settings</h2>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="properties-form">
        <label htmlFor="placement-sigma">Placement uncertainty (m)</label>
        <input
          autoFocus
          id="placement-sigma"
          inputMode="decimal"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onBlur={save}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape') onClose();
          }}
        />
        <p className="property-note">
          Applies to new and re-measured readings. Existing readings keep their
          uncertainty.
        </p>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
