import { useEffect, useMemo, useRef, useState } from 'react';
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
import type { Point, PointRef, Project } from '../model/types';
import { moveMeasurement, updatePlacementSigma } from '../model/measurements';
import { consistencyDiagnostics } from '../solver/diagnostics';
import {
  addCustomMeasurement,
  currentMeasurement,
  replaceBlockedPoint,
  selectMeasurement,
  skipCurrent,
  startSurvey,
  submitMeasurement,
} from '../survey/session';
import type { EditorState } from '../survey/session';
import { measurementPrompt, measurementRoom } from '../survey/points';
import { SurveyPanel } from './SurveyPanel';
import { SurveyCommand } from './SurveyCommand';
import { SettingsPanel } from './SettingsPanel';
import { DrawingCanvas } from './DrawingCanvas';
import { MenuBar } from './MenuBar';
import { ProjectPanel } from './ProjectPanel';
import { StatusBar } from './StatusBar';
import { ToolPalette } from './ToolPalette';
import {
  AUTOSAVE_KEY,
  DEFAULT_ROOM_HEIGHT,
  isTextInput,
  UPCOMING_TOOLS,
} from './editor';
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
  M: 'MEASURE: click two corners, jambs or points on edges.',
  Space: 'PAN: drag the drawing. Wheel zooms around the cursor. F fits all.',
};
export function App() {
  const [initial] = useState(_initialProject);
  const [history, setHistory] = useState(() =>
    createHistory<EditorState>({ project: initial.project, survey: null }),
  );
  // A blur commit and a canvas action can happen in the same browser event.
  // Keep their history updates sequential before React renders the next frame.
  const historyRef = useRef(history);
  const state = history.present;
  const project = state.project;
  const [activeId, setActiveId] = useState<string | null>(
    project.blocks[0]?.id ?? null,
  );
  const activeBlock =
    project.blocks.find(
      (block) => block.id === (state.survey?.blockId ?? activeId),
    ) ?? project.blocks[0];
  const surveying = !!state.survey && activeBlock?.id === state.survey.blockId;
  const current = currentMeasurement(state);
  const diagnostics = useMemo(
    () =>
      activeBlock
        ? consistencyDiagnostics(activeBlock, project.settings.tolerance)
        : null,
    [activeBlock, project.settings.tolerance],
  );
  const [picking, setPicking] = useState<
    | { kind: 'custom'; first?: PointRef }
    | { kind: 'blocked'; end: 'a' | 'b' }
    | null
  >(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const commandRef = useRef<HTMLInputElement>(null);
  const lastMeasurement =
    activeBlock?.measurements.find(
      (item) => item.id === state.survey?.lastId && item.status === 'done',
    ) ??
    activeBlock?.measurements
      .filter((item) => item.status === 'done' && item.kind !== 'height')
      .at(-1);
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
  function applyState(next: EditorState): void {
    if (next === historyRef.current.present) return;
    if (next.survey?.currentId !== historyRef.current.present.survey?.currentId)
      selectCurrentRoom(next);
    historyRef.current = commit(historyRef.current, next);
    setHistory(historyRef.current);
    setMessage('');
    persist(next.project);
  }
  function selectCurrentRoom(next: EditorState): void {
    const measurement = currentMeasurement(next);
    const block = next.project.blocks.find(
      (item) => item.id === next.survey?.blockId,
    );
    const room =
      block && measurement ? measurementRoom(block, measurement) : undefined;
    if (room) setSelection({ roomId: room.id });
  }
  function apply(next: Project): void {
    if (next === historyRef.current.present.project) return;
    applyState({ ...historyRef.current.present, project: next });
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
    setPicking(null);
  }
  function changeTool(next: Tool): void {
    if (next === 'M') {
      beginCustom();
      return;
    }
    cancel();
    if (historyRef.current.present.survey && next !== 'Space')
      applyState({ ...historyRef.current.present, survey: null });
    setTool(next);
  }
  function travel(direction: 'undo' | 'redo'): void {
    const current = historyRef.current;
    const next = direction === 'undo' ? undo(current) : redo(current);
    if (next === current) return;
    cancel();
    setSelection(null);
    selectCurrentRoom(next.present);
    historyRef.current = next;
    setHistory(next);
    persist(next.present.project);
    if (next.present.survey) setActiveId(next.present.survey.blockId);
    setTool('V');
  }
  function remove(): void {
    if (!selection || !activeBlock) return;
    attempt(() => {
      apply(
        selection.vertexId
          ? deleteCorner(
              historyRef.current.present.project,
              activeBlock.id,
              selection.vertexId,
            )
          : deleteRoom(
              historyRef.current.present.project,
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
    applyState({
      project: createProject(new Date().toISOString()),
      survey: null,
    });
    setFitToken((value) => value + 1);
  }
  function saveFile(): void {
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
    attempt(() => {
      const blob = new Blob([saveProject(historyRef.current.present.project)], {
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
      applyState({ project: next, survey: null });
      setFitToken((value) => value + 1);
    } catch (error) {
      setMessage(
        `Open failed: ${error instanceof Error ? error.message : 'Unable to read the file.'}`,
      );
    }
  }
  function focusCommand(): void {
    commandRef.current?.focus();
  }
  function toggleSurvey(): void {
    cancel();
    setTool('V');
    if (historyRef.current.present.survey)
      applyState({ ...historyRef.current.present, survey: null });
    else if (activeBlock)
      attempt(() => {
        applyState(
          startSurvey(
            historyRef.current.present,
            activeBlock.id,
            selectedRoom?.id,
          ),
        );
        setFitToken((value) => value + 1);
      });
    else setMessage('Draw a room before starting the survey.');
  }
  function chooseMeasurement(id: string): void {
    cancel();
    attempt(() => {
      const next = historyRef.current.present.survey
        ? historyRef.current.present
        : startSurvey(historyRef.current.present, activeBlock!.id);
      applyState(selectMeasurement(next, id));
      setTool('V');
      focusCommand();
    });
  }
  function beginCustom(): void {
    cancel();
    if (
      attempt(() => {
        if (!historyRef.current.present.survey) {
          if (!activeBlock) throw new Error('Draw a room before measuring.');
          applyState(startSurvey(historyRef.current.present, activeBlock.id));
          setFitToken((value) => value + 1);
        }
      })
    ) {
      setTool('M');
      setPicking({ kind: 'custom' });
    }
  }
  function pickPoint(point: PointRef): void {
    if (!picking) return;
    if (picking.kind === 'custom' && !picking.first) {
      setPicking({ ...picking, first: point });
      return;
    }
    if (
      attempt(() =>
        applyState(
          picking.kind === 'blocked'
            ? replaceBlockedPoint(
                historyRef.current.present,
                picking.end,
                point,
              )
            : addCustomMeasurement(
                historyRef.current.present,
                picking.first!,
                point,
              ),
        ),
      )
    ) {
      setPicking(null);
      setTool('V');
    }
  }
  function cancelSurveyAction(): void {
    cancel();
    setTool('V');
    focusCommand();
  }
  useEffect(() => {
    if (surveying && !picking && !settingsOpen) commandRef.current?.focus();
  }, [surveying, state.survey?.currentId, resetToken, picking, settingsOpen]);
  useEffect(() => {
    const keyDown = (event: KeyboardEvent): void => {
      const modifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (modifier && key === 's') {
        event.preventDefault();
        saveFile();
        return;
      }
      const upcoming = UPCOMING_TOOLS[key.toUpperCase()];
      if (
        upcoming &&
        !modifier &&
        !event.altKey &&
        (!isTextInput(event.target) ||
          (event.target === commandRef.current && !commandRef.current?.value))
      ) {
        event.preventDefault();
        setMessage(
          `${upcoming} is not available yet. Use R for rectangles, P for polygons, or M for measurements.`,
        );
        return;
      }
      if (event.target === commandRef.current) {
        if (modifier && key === 'z') {
          event.preventDefault();
          travel(event.shiftKey ? 'redo' : 'undo');
          return;
        }
        if (key === 'escape') {
          event.preventDefault();
          cancelSurveyAction();
          return;
        }
        if (!modifier && !event.altKey && commandRef.current?.value === '') {
          if (key === 'm') {
            event.preventDefault();
            beginCustom();
            return;
          }
          if (key === 's') {
            event.preventDefault();
            toggleSurvey();
            return;
          }
          if (key === 'f') {
            event.preventDefault();
            setFitToken((value) => value + 1);
            return;
          }
        }
      }
      // Other inputs use native text undo until their edit is committed.
      if (isTextInput(event.target)) return;
      if (modifier && key === 'z') {
        event.preventDefault();
        travel(event.shiftKey ? 'redo' : 'undo');
        return;
      }
      if (modifier || event.altKey) return;
      if (key === 's') {
        event.preventDefault();
        toggleSurvey();
        return;
      }
      if (key === 'm') {
        event.preventDefault();
        beginCustom();
        return;
      }
      if (key === 'v' || key === 'r' || key === 'p') {
        event.preventDefault();
        changeTool(key.toUpperCase() as Tool);
      }
      if (key === 'f') {
        event.preventDefault();
        setFitToken((value) => value + 1);
      }
      if (!surveying && (key === 'delete' || key === 'backspace')) {
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
        historyRef.current.present.project,
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
        canDelete={!!selectedRoom && !surveying}
        surveying={surveying}
        onSurvey={toggleSurvey}
        onCustom={beginCustom}
        onSettings={() => setSettingsOpen((value) => !value)}
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
            survey={surveying}
            currentMeasurement={current}
            surveyRoomId={
              current && activeBlock
                ? measurementRoom(activeBlock, current)?.id
                : selectedRoom?.id
            }
            residuals={diagnostics?.residuals ?? []}
            pickMode={picking?.kind ?? null}
            pickedPoint={picking?.kind === 'custom' ? picking.first : undefined}
            onPickPoint={pickPoint}
            onSurveyFocus={focusCommand}
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
                      historyRef.current.present.project,
                      activeBlock.id,
                      id,
                      point,
                    ),
                  ),
                );
            }}
            onCursor={setCursor}
            onMessage={setMessage}
            onCancel={() =>
              surveying ? cancelSurveyAction() : changeTool('V')
            }
          />
        </main>
        <ProjectPanel
          project={project}
          activeBlock={activeBlock}
          selectedRoom={selectedRoom}
          diagnostics={diagnostics?.rooms ?? []}
          settings={
            settingsOpen && (
              <SettingsPanel
                key={project.settings.placementSigma}
                placementSigma={project.settings.placementSigma}
                onClose={() => setSettingsOpen(false)}
                onSave={(value) => {
                  apply(
                    updatePlacementSigma(
                      historyRef.current.present.project,
                      value,
                    ),
                  );
                  return true;
                }}
              />
            )
          }
          queue={
            <SurveyPanel
              block={activeBlock}
              diagnostics={diagnostics}
              currentId={state.survey?.currentId ?? null}
              active={surveying}
              onPick={chooseMeasurement}
              onMove={(id, direction) => {
                if (activeBlock)
                  attempt(() =>
                    apply(
                      moveMeasurement(
                        historyRef.current.present.project,
                        activeBlock.id,
                        id,
                        direction,
                      ),
                    ),
                  );
                focusCommand();
              }}
            />
          }
          onBlock={(id) => {
            cancel();
            setActiveId(id);
            if (historyRef.current.present.survey)
              attempt(() =>
                applyState(startSurvey(historyRef.current.present, id)),
              );
            setSelection(null);
            setFitToken((value) => value + 1);
          }}
          onSelect={(roomId) => {
            setSelection({ roomId });
            if (surveying) focusCommand();
          }}
          onUpdate={(changes) =>
            activeBlock && selectedRoom
              ? attempt(() =>
                  apply(
                    updateRoom(
                      historyRef.current.present.project,
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
      {surveying ? (
        <SurveyCommand
          key={`${current?.id ?? 'finished'}:${current?.status}:${resetToken}`}
          inputRef={commandRef}
          current={current}
          message={message}
          prompt={
            picking?.kind === 'blocked'
              ? 'Pick a reachable point on an edge to replace the blocked corner.'
              : picking?.kind === 'custom'
                ? `Custom measurement: pick the ${picking.first ? 'second' : 'first'} corner, jamb or edge point.`
                : current && activeBlock
                  ? measurementPrompt(activeBlock, current)
                  : 'Queue finished. Review room status and re-measure suggestions.'
          }
          picking={!!picking}
          blockedEnd={picking?.kind === 'blocked' ? picking.end : null}
          canRedo={!!lastMeasurement}
          onSubmit={(value) =>
            attempt(() =>
              applyState(submitMeasurement(historyRef.current.present, value)),
            )
          }
          onSkip={() => {
            attempt(() => applyState(skipCurrent(historyRef.current.present)));
            focusCommand();
          }}
          onBlocked={() => {
            setPicking({ kind: 'blocked', end: 'a' });
            setMessage('');
          }}
          onBlockedEnd={(end) => setPicking({ kind: 'blocked', end })}
          onRedo={() =>
            lastMeasurement && chooseMeasurement(lastMeasurement.id)
          }
          onUndo={() => travel('undo')}
          onCancel={cancelSurveyAction}
        />
      ) : (
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
      )}
      <StatusBar
        cursor={cursor}
        block={activeBlock}
        residuals={diagnostics?.residuals ?? []}
      />
    </div>
  );
}
