import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import type { Measurement } from '../model/types';

export function SurveyCommand({
  inputRef,
  current,
  prompt,
  message,
  picking,
  blockedEnd,
  canRedo,
  onSubmit,
  onSkip,
  onBlocked,
  onBlockedEnd,
  onRedo,
  onUndo,
  onCancel,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  current: Measurement | undefined;
  prompt: string;
  message: string;
  picking: boolean;
  blockedEnd: 'a' | 'b' | null;
  canRedo: boolean;
  onSubmit: (value: string) => boolean;
  onSkip: () => void;
  onBlocked: () => void;
  onBlockedEnd: (end: 'a' | 'b') => void;
  onRedo: () => void;
  onUndo: () => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(
    current?.status === 'done' ? (current.value?.toFixed(3) ?? '') : '',
  );
  useEffect(() => {
    if (!picking) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [inputRef, picking]);
  return (
    <form
      className="command-line survey-command"
      aria-label="Command line"
      onSubmit={(event) => {
        event.preventDefault();
        if (onSubmit(value)) setValue('');
        inputRef.current?.focus();
      }}
    >
      <span aria-hidden="true">&gt;</span>
      <div className="survey-prompt">
        <label htmlFor="survey-value">{prompt}</label>
        {message && <p role="alert">{message}</p>}
      </div>
      {!picking && current && (
        <>
          <input
            ref={inputRef}
            id="survey-value"
            aria-label="Measurement value"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="0.000"
          />
          <span>m</span>
        </>
      )}
      {blockedEnd && (
        <fieldset className="blocked-end">
          <legend>Blocked corner</legend>
          <label>
            <input
              type="radio"
              name="blocked-end"
              checked={blockedEnd === 'a'}
              onChange={() => onBlockedEnd('a')}
            />{' '}
            Start
          </label>
          <label>
            <input
              type="radio"
              name="blocked-end"
              checked={blockedEnd === 'b'}
              onChange={() => onBlockedEnd('b')}
            />{' '}
            End
          </label>
        </fieldset>
      )}
      <div className="survey-actions">
        <button className="bevel" type="submit" disabled={!current || picking}>
          Enter
        </button>
        <button
          className="bevel"
          type="button"
          disabled={!current || picking}
          onClick={onSkip}
        >
          Skip
        </button>
        <button
          className="bevel"
          type="button"
          disabled={!current || picking}
          onClick={onBlocked}
        >
          Blocked
        </button>
        <button
          className="bevel"
          type="button"
          disabled={!canRedo || picking}
          onClick={onRedo}
        >
          Redo
        </button>
        <button className="bevel" type="button" onClick={onUndo}>
          Undo
        </button>
        <button className="bevel" type="button" onClick={onCancel}>
          Esc
        </button>
      </div>
    </form>
  );
}
