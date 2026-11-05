export interface History<T> {
  past: T[];
  present: T;
  future: T[];
}
export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] };
}
export function commit<T>(history: History<T>, present: T): History<T> {
  return present === history.present
    ? history
    : { past: [...history.past, history.present], present, future: [] };
}
export function undo<T>(history: History<T>): History<T> {
  const present = history.past.at(-1);
  return present === undefined
    ? history
    : {
        past: history.past.slice(0, -1),
        present,
        future: [history.present, ...history.future],
      };
}
export function redo<T>(history: History<T>): History<T> {
  const present = history.future[0];
  return present === undefined
    ? history
    : {
        past: [...history.past, history.present],
        present,
        future: history.future.slice(1),
      };
}
