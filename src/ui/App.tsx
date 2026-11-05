import { useEffect, useRef, useState } from 'react';
import { commit, createHistory, redo, undo } from '../model/history';
import { loadProject, saveProject } from '../model/json';
import {
  createProject,
  createRoom,
  deleteCorner,
  deleteRoom,
  moveCorner,
  updateRoom,
} from '../model/project';
import type { Point, Project } from '../model/types';
import { DrawingCanvas } from './DrawingCanvas';
import { MenuBar } from './MenuBar';
import { ProjectPanel } from './ProjectPanel';
import { StatusBar } from './StatusBar';
import { ToolPalette } from './ToolPalette';
import { AUTOSAVE_KEY, DEFAULT_ROOM_HEIGHT, isTextInput } from './editor';
import type { Cursor, Selection, Tool } from './editor';

function _initialProject(): { project: Project; message: string } {
  try {
    const json =
      typeof window === 'undefined'
        ? null
        : window.localStorage.getItem(AUTOSAVE_KEY);
    if (json)
      return {
        project: loadProject(json),
        message: 'Restored autosaved project.',
      };
  } catch (error) {
    return {
      project: createProject(new Date().toISOString()),
      message: `Autosave could not be restored: ${error instanceof Error ? error.message : 'Storage unavailable.'} Use Open to recover a file.`,
    };
  }
  return { project: createProject(new Date().toISOString()), message: '' };
}
const PROMPTS: Record<Tool, string> = {
  V: 'Select a room or corner. Drag a corner to move. Delete removes the selection.',
  R: 'RECTANGLE: click two opposite corners. Shift disables snap. Esc cancels.',
  P: 'POLYGON: click corners; Enter or click the first corner to close. Esc cancels.',
  Space: 'PAN: drag the drawing. Wheel zooms around the cursor. F fits all.',
};
export function App() {
  const [initial] = useState(_initialProject);
  const [history, setHistory] = useState(() => createHistory(initial.project));
  // A blur commit and a canvas action can happen in the same browser event.
  // Keep their history updates sequential before React renders the next frame.
  const historyRef = useRef(history);
  const project = history.present;
  const [activeId, setActiveId] = useState<string | null>(
    project.blocks[0]?.id ?? null,
  );
  const activeBlock =
    project.blocks.find((block) => block.id === activeId) ?? project.blocks[0];
  const [selection, setSelection] = useState<Selection | null>(null);
  const selectedRoom = activeBlock?.rooms.find(
    (room) => room.id === selection?.roomId,
  );
  const [tool, setTool] = useState<Tool>('V');
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const [message, setMessage] = useState(initial.message);
  const [resetToken, setResetToken] = useState(0);
  const [fitToken, setFitToken] = useState(project.blocks.length ? 1 : 0);
  const inputRef = useRef<HTMLInputElement>(null);
  const openRequest = useRef(0);
  function persist(next: Project): void {
    try {
      window.localStorage.setItem(AUTOSAVE_KEY, saveProject(next));
    } catch (error) {
      setMessage(
        `Autosave failed: ${error instanceof Error ? error.message : 'Storage unavailable.'} Use File > Save.`,
      );
    }
  }
  function apply(next: Project): void {
    if (next === historyRef.current.present) return;
    historyRef.current = commit(historyRef.current, next);
    setHistory(historyRef.current);
    setMessage('');
    persist(next);
  }
  function attempt(action: () => void): boolean {
    try {
      action();
      return true;
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'The action could not be completed.',
      );
      return false;
    }
  }
  function cancel(): void {
    setResetToken((value) => value + 1);
    setCursor(null);
    setMessage('');
  }
  function changeTool(next: Tool): void {
    cancel();
    setTool(next);
  }
  function travel(direction: 'undo' | 'redo'): void {
    const current = historyRef.current;
    const next = direction === 'undo' ? undo(current) : redo(current);
    if (next === current) return;
    cancel();
    setSelection(null);
    historyRef.current = next;
    setHistory(next);
    persist(next.present);
  }
  function remove(): void {
    if (!selection || !activeBlock) return;
    attempt(() => {
      apply(
        selection.vertexId
          ? deleteCorner(
              historyRef.current.present,
              activeBlock.id,
              selection.vertexId,
            )
          : deleteRoom(
              historyRef.current.present,
              activeBlock.id,
              selection.roomId,
            ),
      );
      setSelection(null);
      setResetToken((value) => value + 1);
    });
  }
  function newFile(): void {
    openRequest.current++;
    cancel();
    setSelection(null);
    setActiveId(null);
    apply(createProject(new Date().toISOString()));
    setFitToken((value) => value + 1);
  }
  function saveFile(): void {
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
    attempt(() => {
      const blob = new Blob([saveProject(historyRef.current.present)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${project.name.replace(/[^\p{L}\p{N} _-]/gu, '_') || 'rilievo'}.json`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage('Project saved as JSON.');
    });
  }
  async function openFile(file: File): Promise<void> {
    const request = ++openRequest.current;
    try {
      const next = loadProject(await file.text());
      if (request !== openRequest.current) return;
      cancel();
      setSelection(null);
      setActiveId(next.blocks[0]?.id ?? null);
      apply(next);
      setFitToken((value) => value + 1);
    } catch (error) {
      setMessage(
        `Open failed: ${error instanceof Error ? error.message : 'Unable to read the file.'}`,
      );
    }
  }
  useEffect(() => {
    const keyDown = (event: KeyboardEvent): void => {
      const modifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (modifier && key === 's') {
        event.preventDefault();
        saveFile();
        return;
      }
      // Inputs use native text undo while being edited; Enter/blur commits one project edit.
      if (isTextInput(event.target)) return;
      if (modifier && key === 'z') {
        event.preventDefault();
        travel(event.shiftKey ? 'redo' : 'undo');
        return;
      }
      if (modifier || event.altKey) return;
      if (key === 'v' || key === 'r' || key === 'p') {
        event.preventDefault();
        changeTool(key.toUpperCase() as Tool);
      }
      if (key === 'f') {
        event.preventDefault();
        setFitToken((value) => value + 1);
      }
      if (key === 'delete' || key === 'backspace') {
        event.preventDefault();
        remove();
      }
    };
    window.addEventListener('keydown', keyDown);
    return () => window.removeEventListener('keydown', keyDown);
  });
  function draw(points: Point[]): boolean {
    return attempt(() => {
      const result = createRoom(
        historyRef.current.present,
        activeBlock?.id ?? null,
        points,
        DEFAULT_ROOM_HEIGHT,
      );
      apply(result.project);
      setActiveId(result.blockId);
      setSelection({ roomId: result.roomId });
    });
  }
  return (
    <div className="app-shell">
      <MenuBar
        projectName={project.name}
        canUndo={history.past.length > 0}
        canRedo={history.future.length > 0}
        canDelete={!!selectedRoom}
        onNew={newFile}
        onOpen={() => inputRef.current?.click()}
        onSave={saveFile}
        onUndo={() => travel('undo')}
        onRedo={() => travel('redo')}
        onDelete={remove}
        onFit={() => setFitToken((value) => value + 1)}
      />
      <input
        className="visually-hidden"
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        aria-label="Open project JSON"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void openFile(file);
        }}
      />
      <div className="workspace">
        <ToolPalette tool={tool} onTool={changeTool} />
        <main className="drawing-area" aria-label="Drawing workspace">
          <DrawingCanvas
            block={activeBlock}
            tool={tool}
            selection={selectedRoom ? selection : null}
            resetToken={resetToken}
            fitToken={fitToken}
            onSelect={(next) => {
              setSelection(next);
              setMessage('');
            }}
            onCreate={draw}
            onMove={(id, point) => {
              if (activeBlock)
                attempt(() =>
                  apply(
                    moveCorner(
                      historyRef.current.present,
                      activeBlock.id,
                      id,
                      point,
                    ),
                  ),
                );
            }}
            onCursor={setCursor}
            onMessage={setMessage}
            onCancel={() => changeTool('V')}
          />
        </main>
        <ProjectPanel
          project={project}
          activeBlock={activeBlock}
          selectedRoom={selectedRoom}
          onBlock={(id) => {
            cancel();
            setActiveId(id);
            setSelection(null);
            setFitToken((value) => value + 1);
          }}
          onSelect={(roomId) => setSelection({ roomId })}
          onUpdate={(changes) =>
            activeBlock && selectedRoom
              ? attempt(() =>
                  apply(
                    updateRoom(
                      historyRef.current.present,
                      activeBlock.id,
                      selectedRoom.id,
                      changes,
                    ),
                  ),
                )
              : false
          }
        />
      </div>
      <section className="command-line" aria-label="Command line">
        <span aria-hidden="true">&gt;</span>
        <p role="status">{message || PROMPTS[tool]}</p>
        <button
          className="command-button bevel"
          type="button"
          onClick={() => changeTool('V')}
        >
          Esc
        </button>
      </section>
      <StatusBar cursor={cursor} block={activeBlock} />
    </div>
  );
}
