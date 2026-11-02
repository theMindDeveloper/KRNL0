// Pen tool — freehand drawing on the canvas (perfect-freehand outlines).
//
// Strokes are stored in flow coordinates on board.drawings and rendered in a
// ViewportPortal, so they pan and zoom with the canvas. While the pen is on,
// a transparent capture layer sits over the canvas (under the dock):
//   - left-drag    draws with the current tool (pen / marker / highlighter / arrow)
//   - eraser       removes whole strokes it touches
//   - middle-drag  pans the canvas; wheel pans, Ctrl+wheel zooms
//   - right-click  opens the radial tool wheel (tools, sizes, colours, clear)
//   - Esc          leaves the pen
// The cursor is a pen tip in the current colour (a ring for the eraser).

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ViewportPortal, useReactFlow } from '@xyflow/react';
import { getStroke } from 'perfect-freehand';
import { useBoardStore } from '../../store/boardStore';
import { useDrawStore, TOOL_SIZE, type PenTool } from '../../store/drawStore';
import { PenWheel } from './PenWheel';
import type { DrawStroke, DrawTool } from '../../../shared/types/board';

/** SVG path for a stroke: perfect-freehand outline, or a straight arrow. Exported for tests. */
export function strokePath(points: DrawStroke['points'], size: number, tool: DrawTool): string {
  if (tool === 'arrow') return arrowPath(points, size);
  const outline = getStroke(points, {
    size,
    thinning: tool === 'pen' ? 0.6 : 0,
    smoothing: 0.55,
    streamline: 0.45,
    simulatePressure: points.every((p) => p[2] === 0.5),
    last: true,
  });
  if (outline.length < 2) return '';
  const d = outline.reduce<string[]>((acc, p0, i, arr) => {
    const p1 = arr[(i + 1) % arr.length]!;
    const x0 = p0[0] ?? 0, y0 = p0[1] ?? 0, x1 = p1[0] ?? 0, y1 = p1[1] ?? 0;
    acc.push(`${x0.toFixed(1)},${y0.toFixed(1)} ${((x0 + x1) / 2).toFixed(1)},${((y0 + y1) / 2).toFixed(1)}`);
    return acc;
  }, []);
  return `M${d[0]} Q${d.slice(1).join(' ')} Z`;
}

/** Filled arrow from the first to the last point (shaft + head). */
function arrowPath(points: DrawStroke['points'], size: number): string {
  const a = points[0];
  const b = points[points.length - 1];
  if (!a || !b) return '';
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len < 1) return '';
  const ux = dx / len, uy = dy / len;      // along
  const nx = -uy, ny = ux;                 // normal
  const w = size / 2;
  const head = Math.min(len * 0.5, size * 4);
  const hw = size * 2.2;
  const bx = b[0] - ux * head, by = b[1] - uy * head;
  const pts = [
    [a[0] + nx * w, a[1] + ny * w], [bx + nx * w, by + ny * w], [bx + nx * hw, by + ny * hw],
    [b[0], b[1]],
    [bx - nx * hw, by - ny * hw], [bx - nx * w, by - ny * w], [a[0] - nx * w, a[1] - ny * w],
  ];
  return `M${pts.map(([x, y]) => `${x!.toFixed(1)},${y!.toFixed(1)}`).join(' L')} Z`;
}

/** Ids of strokes passing within `radius` of (x, y). Exported for tests. */
export function strokesHit(strokes: readonly DrawStroke[], x: number, y: number, radius: number): string[] {
  const near = (s: DrawStroke) => {
    const r = radius + s.size / 2;
    const r2 = r * r;
    const pts = s.points;
    if (pts.length === 1) return (pts[0]![0] - x) ** 2 + (pts[0]![1] - y) ** 2 <= r2;
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1]!;
      const [bx, by] = pts[i]!;
      const vx = bx - ax, vy = by - ay;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy || 1)));
      if ((ax + t * vx - x) ** 2 + (ay + t * vy - y) ** 2 <= r2) return true;
    }
    return false;
  };
  return strokes.filter(near).map((s) => s.id);
}

function StrokeSvg({ s }: { s: Pick<DrawStroke, 'points' | 'size' | 'tool' | 'color'> }) {
  return (
    <path
      d={strokePath(s.points, s.size, s.tool)}
      fill={s.color}
      opacity={s.tool === 'highlighter' ? 0.32 : s.tool === 'marker' ? 0.9 : 1}
    />
  );
}

/** CSS cursor: a pen tip in the current colour, or a ring for the eraser. */
export function penCursor(tool: PenTool, color: string): string {
  const c = encodeURIComponent(color);
  if (tool === 'eraser') {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24'><circle cx='12' cy='12' r='9' fill='rgba(255,255,255,0.08)' stroke='white' stroke-width='1.5'/><circle cx='12' cy='12' r='9' fill='none' stroke='black' stroke-opacity='0.5' stroke-width='0.5'/></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12, cell`;
  }
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='26' height='26' viewBox='0 0 24 24'><path d='M3 21l1.6-5.2L16.3 4.1a2 2 0 0 1 2.8 0l.8.8a2 2 0 0 1 0 2.8L8.2 19.4z' fill='%23111' stroke='white' stroke-width='1.2' stroke-linejoin='round'/><path d='M3 21l1.6-5.2 3.6 3.6z' fill='COLOR'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg).replace('COLOR', c)}") 2 24, crosshair`;
}

export function DrawLayer() {
  const drawings = useBoardStore((s) => s.board?.drawings);
  const addStroke = useBoardStore((s) => s.addStroke);
  const removeStrokes = useBoardStore((s) => s.removeStrokes);
  const { active, tool, color, sizeScale, setActive } = useDrawStore();
  const { screenToFlowPosition, getZoom, getViewport, setViewport } = useReactFlow();
  const [live, setLive] = useState<DrawStroke['points'] | null>(null);
  const wheel = useDrawStore((st) => st.wheel);
  const openWheel = useDrawStore((st) => st.openWheel);
  const closeWheel = useDrawStore((st) => st.closeWheel);
  const setWheel = (w: { x: number; y: number } | null) => (w ? openWheel(w.x, w.y) : closeWheel());
  const drawing = useRef(false);
  const panning = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setWheel(null); setActive(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, setActive]);

  const toFlow = (e: ReactPointerEvent): [number, number, number] => {
    const p = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    return [p.x, p.y, e.pointerType === 'pen' ? e.pressure : 0.5];
  };

  const erase = (e: ReactPointerEvent) => {
    const [x, y] = toFlow(e);
    const hit = strokesHit(useBoardStore.getState().board?.drawings ?? [], x, y, 10 / getZoom());
    if (hit.length) removeStrokes(hit);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button === 1) {
      // Middle button: pan the camera.
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      panning.current = { x: e.clientX, y: e.clientY };
      return;
    }
    if (e.button !== 0) return;
    setWheel(null);
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    if (tool === 'eraser') erase(e);
    else setLive([toFlow(e)]);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (panning.current) {
      const v = getViewport();
      setViewport({ ...v, x: v.x + e.clientX - panning.current.x, y: v.y + e.clientY - panning.current.y });
      panning.current = { x: e.clientX, y: e.clientY };
      return;
    }
    if (!drawing.current) return;
    if (tool === 'eraser') erase(e);
    else if (tool === 'arrow') setLive((pts) => (pts ? [pts[0]!, toFlow(e)] : pts));
    else setLive((pts) => (pts ? [...pts, toFlow(e)] : pts));
  };
  const onPointerUp = () => {
    if (panning.current) { panning.current = null; return; }
    if (!drawing.current) return;
    drawing.current = false;
    if (tool !== 'eraser' && live && live.length > 0) {
      addStroke({
        id: `stroke-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        tool,
        color,
        size: (TOOL_SIZE[tool] * sizeScale) / getZoom(),
        points: live,
        createdAt: new Date().toISOString(),
      });
    }
    setLive(null);
  };

  const liveTool: DrawTool = tool === 'eraser' ? 'pen' : tool;

  return (
    <>
      <ViewportPortal>
        <svg
          data-testid="draw-layer"
          style={{ position: 'absolute', left: 0, top: 0, width: 1, height: 1, overflow: 'visible', pointerEvents: 'none', zIndex: 4 }}
        >
          {(drawings ?? []).map((s) => <StrokeSvg key={s.id} s={s} />)}
          {live && <StrokeSvg s={{ points: live, size: (TOOL_SIZE[liveTool] * sizeScale) / getZoom(), tool: liveTool, color }} />}
        </svg>
      </ViewportPortal>

      {active && (
        <div
          data-testid="draw-capture"
          className="nowheel nodrag nopan"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onAuxClick={(e) => e.preventDefault()}
          onContextMenu={(e) => { e.preventDefault(); setWheel({ x: e.clientX, y: e.clientY }); }}
          onWheel={(e) => {
            const v = getViewport();
            if (e.ctrlKey || e.metaKey) {
              const z = Math.max(0.1, Math.min(4, v.zoom * (e.deltaY > 0 ? 0.9 : 1.1)));
              const rect = e.currentTarget.getBoundingClientRect();
              const cx = e.clientX - rect.left;
              const cy = e.clientY - rect.top;
              setViewport({ zoom: z, x: cx - ((cx - v.x) * z) / v.zoom, y: cy - ((cy - v.y) * z) / v.zoom });
            } else {
              setViewport({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY });
            }
          }}
          style={{
            position: 'absolute', inset: 0, zIndex: 4, touchAction: 'none',
            cursor: penCursor(tool, color),
          }}
        />
      )}

      {active && wheel && <PenWheel x={wheel.x} y={wheel.y} onClose={closeWheel} />}
    </>
  );
}
