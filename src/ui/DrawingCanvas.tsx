import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { containsPoint, distance, roomPoints } from '../model/geometry';
import type { Block, Point } from '../model/types';
import { GRID_STEP, rectanglePoints, snapPoint } from '../tools/snapping';
import {
  fitView,
  INITIAL_VIEW,
  labelStep,
  toScreen,
  toWorld,
  zoomAt,
} from '../tools/viewport';
import type { Viewport } from '../tools/viewport';
import { isTextInput } from './editor';
import type { Cursor, Selection, Tool } from './editor';

interface Props {
  block: Block | undefined;
  tool: Tool;
  selection: Selection | null;
  resetToken: number;
  fitToken: number;
  onSelect: (selection: Selection | null) => void;
  onCreate: (points: Point[]) => boolean;
  onMove: (vertexId: string, point: Point) => void;
  onCursor: (cursor: Cursor | null) => void;
  onMessage: (message: string) => void;
  onCancel: () => void;
}
type Gesture =
  | { type: 'pan'; start: Point; view: Viewport }
  | { type: 'corner'; vertexId: string; point: Point; start: Point };
function EdgeLabels({
  points,
  closed = true,
  view,
}: {
  points: Point[];
  closed?: boolean;
  view: Viewport;
}) {
  return (
    <g className="edge-labels" pointerEvents="none">
      {points.slice(0, closed ? undefined : -1).map((a, i) => {
        const b = points[(i + 1) % points.length]!;
        const start = toScreen(a, view);
        const end = toScreen(b, view);
        return (
          <text
            key={i}
            x={(start.x + end.x) / 2}
            y={(start.y + end.y) / 2 - 9}
            textAnchor="middle"
          >
            {distance(a, b).toFixed(3)}
          </text>
        );
      })}
    </g>
  );
}
function Grid({
  view,
  width,
  height,
}: {
  view: Viewport;
  width: number;
  height: number;
}) {
  const step = labelStep(view.scale);
  const left = toWorld({ x: 0, y: 0 }, view);
  const right = toWorld({ x: width, y: height }, view);
  const xs: number[] = [];
  const ys: number[] = [];
  for (let x = Math.ceil(left.x / step) * step; x < right.x; x += step)
    xs.push(x);
  for (let y = Math.ceil(right.y / step) * step; y < left.y; y += step)
    ys.push(y);
  // Thin the displayed dots when individual 0.10 m dots are smaller than four pixels.
  const displayStep =
    GRID_STEP *
    Math.max(1, 10 ** Math.ceil(Math.log10(4 / (GRID_STEP * view.scale))));
  const spacing = displayStep * view.scale;
  return (
    <g pointerEvents="none">
      <defs>
        <pattern
          id="drawing-grid"
          patternUnits="userSpaceOnUse"
          x={view.x % spacing}
          y={view.y % spacing}
          width={spacing}
          height={spacing}
        >
          <circle cx="0" cy="0" r="0.8" fill="var(--color-grid)" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#drawing-grid)" />
      <g className="axis-labels">
        {xs.map((x) => (
          <text key={x} x={toScreen({ x, y: 0 }, view).x + 3} y={height - 6}>
            {Math.abs(x) < 1e-9 ? '0.000' : x.toFixed(3)}
          </text>
        ))}
        {ys.map((y) => (
          <text key={y} x="5" y={toScreen({ x: 0, y }, view).y - 4}>
            {Math.abs(y) < 1e-9 ? '0.000' : y.toFixed(3)}
          </text>
        ))}
      </g>
    </g>
  );
}
export function DrawingCanvas(props: Props) {
  const {
    block,
    tool,
    selection,
    onSelect,
    onCreate,
    onMove,
    onCursor,
    onMessage,
    onCancel,
    fitToken,
  } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState(INITIAL_VIEW);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [draft, setDraft] = useState<Point[]>([]);
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [space, setSpace] = useState(false);
  const lastScreen = useRef<Point | null>(null);
  const previousFit = useRef(0);
  const [lastReset, setLastReset] = useState(props.resetToken);
  if (lastReset !== props.resetToken) {
    setLastReset(props.resetToken);
    setDraft([]);
    setGesture(null);
    setCursor(null);
  }
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry)
        setSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
    });
    observer.observe(svg);
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = svg.getBoundingClientRect();
      const point = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
      const delta =
        event.deltaY *
        (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1);
      setView((current) =>
        zoomAt(
          current,
          point,
          Math.exp(-Math.max(-400, Math.min(400, delta)) * 0.0015),
        ),
      );
    };
    svg.addEventListener('wheel', wheel, { passive: false });
    return () => {
      observer.disconnect();
      svg.removeEventListener('wheel', wheel);
    };
  }, []);
  useEffect(() => {
    if (previousFit.current === fitToken) return;
    previousFit.current = fitToken;
    const svg = svgRef.current;
    if (svg)
      setView(
        fitView(block?.vertices ?? [], svg.clientWidth, svg.clientHeight),
      );
  }, [fitToken, block]);
  const complete = (): void => {
    if (draft.length < 3) {
      onMessage('A polygon needs at least three corners.');
      return;
    }
    if (onCreate(draft)) {
      setDraft([]);
      setCursor(null);
    }
  };
  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      if (isTextInput(event.target)) return;
      if (event.code === 'Space') {
        event.preventDefault();
        setSpace(true);
      }
      if (event.key === 'Enter' && tool === 'P') {
        event.preventDefault();
        complete();
      }
      if (event.key === 'Escape') {
        setDraft([]);
        setGesture(null);
        setCursor(null);
        onCancel();
      }
      if (event.key === 'Shift' && lastScreen.current) {
        const point = toWorld(lastScreen.current, view);
        setCursor({ point, snap: null });
        onCursor({ point, snap: null });
      }
    };
    const keyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpace(false);
      if (event.key === 'Shift' && lastScreen.current) {
        const raw = toWorld(lastScreen.current, view);
        const target = snapPoint(
          raw,
          block,
          view.scale,
          false,
          gesture?.type === 'corner' ? gesture.vertexId : undefined,
          draft,
        );
        const next = {
          point: target?.point ?? raw,
          snap: target?.kind ?? null,
        };
        setCursor(next);
        onCursor(next);
      }
    };
    const blur = (): void => {
      setSpace(false);
      setGesture(null);
    };
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', blur);
    };
  });
  function pointer(event: ReactPointerEvent<SVGSVGElement>): {
    screen: Point;
    raw: Point;
    next: Cursor;
  } {
    const rect = event.currentTarget.getBoundingClientRect();
    const screen = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    lastScreen.current = screen;
    const raw = toWorld(screen, view);
    const target = snapPoint(
      raw,
      block,
      view.scale,
      event.shiftKey,
      gesture?.type === 'corner' ? gesture.vertexId : undefined,
      draft,
    );
    return {
      screen,
      raw,
      next: { point: target?.point ?? raw, snap: target?.kind ?? null },
    };
  }
  function down(event: ReactPointerEvent<SVGSVGElement>): void {
    if (event.button !== 0 && event.button !== 1) return;
    event.preventDefault();
    event.currentTarget.focus();
    const { screen, raw, next } = pointer(event);
    if (event.button === 1 || space || tool === 'Space') {
      event.currentTarget.setPointerCapture(event.pointerId);
      setGesture({ type: 'pan', start: screen, view });
      return;
    }
    setCursor(next);
    onCursor(next);
    if (tool === 'R') {
      if (!draft[0]) setDraft([next.point]);
      else if (onCreate(rectanglePoints(draft[0], next.point))) {
        setDraft([]);
        setCursor(null);
      }
      return;
    }
    if (tool === 'P') {
      if (draft.length >= 3 && distance(raw, draft[0]!) * view.scale <= 10)
        complete();
      else if (!draft.length || distance(next.point, draft.at(-1)!) > 1e-8)
        setDraft([...draft, next.point]);
      return;
    }
    const corners = (block?.vertices ?? [])
      .filter((vertex) => distance(vertex, raw) * view.scale <= 10)
      .sort((a, b) => distance(a, raw) - distance(b, raw));
    const corner = corners[0];
    if (corner) {
      const room = block?.rooms.find((item) =>
        item.vertexIds.includes(corner.id),
      );
      if (room) {
        onSelect({ roomId: room.id, vertexId: corner.id });
        setGesture({
          type: 'corner',
          vertexId: corner.id,
          point: { x: corner.x, y: corner.y },
          start: screen,
        });
        event.currentTarget.setPointerCapture(event.pointerId);
      }
    } else {
      const room = [...(block?.rooms ?? [])]
        .reverse()
        .find((item) => containsPoint(roomPoints(block!, item, false), raw));
      onSelect(room ? { roomId: room.id } : null);
    }
  }
  function move(event: ReactPointerEvent<SVGSVGElement>): void {
    const { screen, next } = pointer(event);
    if (gesture?.type === 'pan') {
      setView({
        ...gesture.view,
        x: gesture.view.x + screen.x - gesture.start.x,
        y: gesture.view.y + screen.y - gesture.start.y,
      });
      return;
    }
    setCursor(next);
    onCursor(next);
    if (gesture?.type === 'corner')
      setGesture({ ...gesture, point: next.point });
  }
  function up(event: ReactPointerEvent<SVGSVGElement>): void {
    if (gesture?.type === 'corner') {
      const { screen, next } = pointer(event);
      if (distance(screen, gesture.start) > 2)
        onMove(gesture.vertexId, next.point);
    }
    setGesture(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }
  const preview =
    tool === 'R' && draft[0] && cursor
      ? rectanglePoints(draft[0], cursor.point)
      : [...draft, ...(cursor && draft.length ? [cursor.point] : [])];
  return (
    <svg
      ref={svgRef}
      className={`drawing-canvas ${space || gesture?.type === 'pan' || tool === 'Space' ? 'is-panning' : ''}`}
      tabIndex={0}
      role="application"
      aria-label="Drawing area"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => setGesture(null)}
      onLostPointerCapture={() => setGesture(null)}
      onPointerLeave={() => {
        if (!gesture) {
          setCursor(null);
          onCursor(null);
        }
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <title>Drawing area</title>
      <desc>
        R: rectangle. P: polygon. V: select. Space drag: pan. F: fit all.
      </desc>
      <Grid view={view} {...size} />
      {block?.rooms.map((room) => {
        const points = roomPoints(block, room, false).map((point, i) =>
          gesture?.type === 'corner' && room.vertexIds[i] === gesture.vertexId
            ? gesture.point
            : point,
        );
        const selected = selection?.roomId === room.id;
        const screens = points.map((point) => toScreen(point, view));
        const centre = screens.reduce(
          (sum, p) => ({
            x: sum.x + p.x / screens.length,
            y: sum.y + p.y / screens.length,
          }),
          { x: 0, y: 0 },
        );
        return (
          <g
            key={room.id}
            className={selected ? 'room selected' : 'room'}
            data-room-id={room.id}
          >
            <polygon points={screens.map((p) => `${p.x},${p.y}`).join(' ')} />
            <text
              className="room-label"
              x={centre.x}
              y={centre.y}
              textAnchor="middle"
            >
              {room.name}
            </text>
            {screens.map((point, i) => (
              <rect
                key={room.vertexIds[i]}
                className={
                  selection?.vertexId === room.vertexIds[i]
                    ? 'corner selected-corner'
                    : 'corner'
                }
                data-vertex-id={room.vertexIds[i]}
                x={point.x - 3}
                y={point.y - 3}
                width="6"
                height="6"
              />
            ))}
            <EdgeLabels points={points} view={view} />
          </g>
        );
      })}
      {preview.length > 0 && (
        <g className="draft" pointerEvents="none">
          <polyline
            points={preview
              .map((point) => {
                const p = toScreen(point, view);
                return `${p.x},${p.y}`;
              })
              .join(' ')}
          />
          <EdgeLabels points={preview} closed={tool === 'R'} view={view} />
          {draft[0] && (
            <rect
              x={toScreen(draft[0], view).x - 4}
              y={toScreen(draft[0], view).y - 4}
              width="8"
              height="8"
            />
          )}
        </g>
      )}
      {cursor?.snap && gesture?.type !== 'pan' && (
        <rect
          className="snap-target"
          data-snap-kind={cursor.snap}
          x={toScreen(cursor.point, view).x - 5}
          y={toScreen(cursor.point, view).y - 5}
          width="10"
          height="10"
          pointerEvents="none"
        />
      )}
    </svg>
  );
}
