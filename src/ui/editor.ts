import type { Point } from '../model/types';
export type Tool = 'V' | 'R' | 'P' | 'D' | 'W' | 'A' | 'M' | 'Space';
export interface Selection {
  roomId: string;
  vertexId?: string;
  openingId?: string;
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
};
export function isTextInput(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
      target.isContentEditable)
  );
}
