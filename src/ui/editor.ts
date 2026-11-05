import type { Point } from '../model/types';
export type Tool = 'V' | 'R' | 'P' | 'M' | 'Space';
export interface Selection {
  roomId: string;
  vertexId?: string;
}
export interface Cursor {
  point: Point;
  snap: string | null;
}
export const DEFAULT_ROOM_HEIGHT = 2.7;
export const AUTOSAVE_KEY = 'rilievo.project.v1';
export const UPCOMING_TOOLS: Record<string, string> = {
  C: 'Circle',
  L: 'Line',
  D: 'Door',
  W: 'Window',
};
export function isTextInput(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
      target.isContentEditable)
  );
}
