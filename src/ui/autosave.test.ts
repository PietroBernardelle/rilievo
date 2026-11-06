import { describe, expect, it } from 'vitest';
import { createProject } from '../model/project';
import { loadProject, saveProject } from '../model/json';
import {
  AUTOSAVE_HISTORY_KEY,
  AUTOSAVE_KEY,
  DOWNLOAD_BACKUP_KEY,
  autosaveHistory,
  rememberDownload,
  restoreAutosave,
  writeAutosave,
} from './autosave';
import type { SaveStorage } from './autosave';

function storage(): SaveStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}
const project = (name: string) => ({ ...createProject('2026-11-06'), name });

describe('autosave recovery', () => {
  it('keeps the last five distinct consecutive states and leaves JSON schema unchanged', () => {
    const store = storage();
    for (let i = 1; i <= 7; i++) writeAutosave(store, project(`Edit ${i}`), i);
    writeAutosave(store, project('Edit 7'), 8);
    expect(
      autosaveHistory(store).map((item) => loadProject(item.json).name),
    ).toEqual(['Edit 7', 'Edit 6', 'Edit 5', 'Edit 4', 'Edit 3']);
    expect(store.getItem(AUTOSAVE_KEY)).toBe(saveProject(project('Edit 7')));
    expect(restoreAutosave(store).warning).toBe('');
  });
  it('preserves pre-upgrade autosaves and can restore a historical edit undoably', () => {
    const store = storage();
    store.setItem(AUTOSAVE_KEY, saveProject(project('Original')));
    expect(restoreAutosave(store).project?.name).toBe('Original');
    writeAutosave(store, project('Edit'), 10);
    const old = autosaveHistory(store)[1]!;
    expect(loadProject(old.json).name).toBe('Original');
    writeAutosave(store, loadProject(old.json), 11);
    expect(
      autosaveHistory(store).map((item) => loadProject(item.json).name),
    ).toEqual(['Original', 'Edit', 'Original']);
    expect(restoreAutosave(store).warning).toBe('');
  });
  it('warns about missing or corrupt saves, recovers the latest usable copy without writing', () => {
    for (const primary of [null, '{corrupt']) {
      const store = storage();
      writeAutosave(store, project('Safe'), 10);
      if (primary === null) store.data.delete(AUTOSAVE_KEY);
      else store.setItem(AUTOSAVE_KEY, primary);
      const before = [...store.data];
      const restored = restoreAutosave(store);
      expect(restored.project?.name).toBe('Safe');
      expect(restored.warning).toContain(primary ? 'unreadable' : 'missing');
      expect(restored.warning).toContain('Recovered');
      expect([...store.data]).toEqual(before);
    }
    expect(restoreAutosave(storage())).toMatchObject({
      project: null,
      snapshots: [],
    });
    expect(restoreAutosave(storage()).warning).toContain('No local backup');
  });
  it('detects a stale primary, including a newer downloaded backup', () => {
    const store = storage();
    writeAutosave(store, project('Old'), 10);
    const old = store.getItem(AUTOSAVE_KEY)!;
    writeAutosave(store, project('Latest'), 20);
    store.setItem(AUTOSAVE_KEY, old);
    expect(restoreAutosave(store).project?.name).toBe('Latest');
    expect(restoreAutosave(store).warning).toContain('older');
    rememberDownload(store, project('Downloaded'), 30);
    store.data.delete(AUTOSAVE_HISTORY_KEY);
    expect(restoreAutosave(store).project?.name).toBe('Downloaded');
    expect(restoreAutosave(store).warning).toContain('older');
    writeAutosave(store, project('Newer edit'), 40);
    expect(restoreAutosave(store).warning).toBe('');
    expect(restoreAutosave(store).project?.name).toBe('Newer edit');
  });
  it('does not warn about identical backup contents, even with clock changes', () => {
    const store = storage();
    writeAutosave(store, project('A'), 20);
    rememberDownload(store, project('A'), 10);
    expect(restoreAutosave(store).warning).toBe('');
    writeAutosave(store, project('B'), 1);
    expect(restoreAutosave(store).project?.name).toBe('B');
    expect(restoreAutosave(store).warning).toBe('');
  });
  it('ignores invalid snapshots and recovers from the valid remainder', () => {
    const store = storage();
    store.setItem(
      AUTOSAVE_HISTORY_KEY,
      JSON.stringify([
        { savedAt: 20, json: '{invalid' },
        { savedAt: 30, json: '{"schemaVersion":999}' },
        { savedAt: 'not a date', json: saveProject(project('Invalid')) },
        { savedAt: 10, json: saveProject(project('Valid')) },
      ]),
    );
    store.setItem(DOWNLOAD_BACKUP_KEY, 'garbage');
    expect(restoreAutosave(store).project?.name).toBe('Valid');
    expect(autosaveHistory(store)).toHaveLength(1);
  });
  it('retains old data on quota failure and recovers an interrupted primary write', () => {
    const store = storage();
    writeAutosave(store, project('Old'), 10);
    for (const failingKey of [AUTOSAVE_HISTORY_KEY, AUTOSAVE_KEY]) {
      const failing = {
        ...store,
        setItem(key: string, value: string) {
          if (key === failingKey) throw new Error('Storage full');
          store.setItem(key, value);
        },
      };
      expect(() => writeAutosave(failing, project('New'), 20)).toThrow(
        'Storage full',
      );
      expect(loadProject(store.getItem(AUTOSAVE_KEY)!).name).toBe('Old');
      expect(restoreAutosave(store).project?.name).toBe(
        failingKey === AUTOSAVE_KEY ? 'New' : 'Old',
      );
    }
  });
});
