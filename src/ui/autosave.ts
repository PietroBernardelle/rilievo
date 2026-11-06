import { loadProject, saveProject } from '../model/json';
import type { Project } from '../model/types';

// Keep the original key so existing installations and schema-1 saves still load.
export const AUTOSAVE_KEY = 'rilievo.project.v1';
export const AUTOSAVE_HISTORY_KEY = 'rilievo.autosaves.v1';
export const DOWNLOAD_BACKUP_KEY = 'rilievo.download-backup.v1';
export const AUTOSAVE_LIMIT = 5;
export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export interface Snapshot {
  savedAt: number;
  json: string;
}
export interface Recovery {
  project: Project | null;
  warning: string;
  snapshots: Snapshot[];
}

function _snapshots(json: string | null): Snapshot[] {
  try {
    const parsed: unknown = JSON.parse(json ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item: unknown): item is Snapshot => {
        try {
          if (
            typeof item !== 'object' ||
            item === null ||
            !('savedAt' in item) ||
            !('json' in item) ||
            typeof item.savedAt !== 'number' ||
            !Number.isFinite(item.savedAt) ||
            typeof item.json !== 'string'
          )
            return false;
          loadProject(item.json);
          return true;
        } catch {
          return false;
        }
      })
      .sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}
export function autosaveHistory(storage: SaveStorage): Snapshot[] {
  return _snapshots(storage.getItem(AUTOSAVE_HISTORY_KEY)).slice(
    0,
    AUTOSAVE_LIMIT,
  );
}
function _backups(storage: SaveStorage, history: Snapshot[]): Snapshot[] {
  return [...history, ..._snapshots(storage.getItem(DOWNLOAD_BACKUP_KEY))].sort(
    (a, b) => b.savedAt - a.savedAt,
  );
}
export function restoreAutosave(storage: SaveStorage): Recovery {
  const snapshots = autosaveHistory(storage);
  const backups = _backups(storage, snapshots);
  const json = storage.getItem(AUTOSAVE_KEY);
  let project: Project | null = null;
  let warning = json ? '' : 'Autosave is missing.';
  if (json) {
    try {
      project = loadProject(json);
    } catch {
      warning = 'Autosave is unreadable.';
    }
  }
  const latest = backups[0];
  // Matching contents are just as safe as matching dates, including old saves
  // without metadata. A journal write may have succeeded before the main write.
  if (
    project &&
    latest &&
    saveProject(project) !== saveProject(loadProject(latest.json))
  ) {
    warning =
      'Autosave is older than the latest backup (or its date cannot be verified).';
  }
  if (warning && latest) {
    project = loadProject(latest.json);
    warning += ` Recovered the latest local backup from ${new Date(latest.savedAt).toLocaleString()}. Use File to restore an earlier autosave or open a downloaded JSON backup.`;
  } else if (warning) {
    warning +=
      ' No local backup is available. Use File > Open to recover a downloaded JSON backup.';
  }
  return { project, warning, snapshots };
}
export function writeAutosave(
  storage: SaveStorage,
  project: Project,
  now = Date.now(),
): Snapshot[] {
  const json = saveProject(project);
  const history = autosaveHistory(storage);
  const backups = _backups(storage, history);
  const savedAt = Math.max(now, (backups[0]?.savedAt ?? 0) + 1);
  const previous = storage.getItem(AUTOSAVE_KEY);
  // Preserve a pre-upgrade autosave before the first edit in this version.
  if (previous && !history.some((item) => item.json === previous)) {
    try {
      history.unshift({
        savedAt: savedAt - 1,
        json: saveProject(loadProject(previous)),
      });
    } catch {
      /* A corrupt primary must not replace a usable recovery copy. */
    }
  }
  if (history[0]?.json !== json) history.unshift({ savedAt, json });
  else history[0] = { savedAt, json };
  const next = history.slice(0, AUTOSAVE_LIMIT);
  // Write recovery data first: a quota error or interrupted main write leaves
  // the previous primary intact, and the new snapshot can be recovered on load.
  storage.setItem(AUTOSAVE_HISTORY_KEY, JSON.stringify(next));
  storage.setItem(AUTOSAVE_KEY, json);
  return next;
}
export function rememberDownload(
  storage: SaveStorage,
  project: Project,
  now = Date.now(),
): void {
  const latest = _backups(storage, autosaveHistory(storage))[0];
  storage.setItem(
    DOWNLOAD_BACKUP_KEY,
    JSON.stringify([
      {
        savedAt: Math.max(now, (latest?.savedAt ?? 0) + 1),
        json: saveProject(project),
      },
    ]),
  );
}
