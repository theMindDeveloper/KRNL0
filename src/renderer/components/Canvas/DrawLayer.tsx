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

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ViewportPortal, useReactFlow } from '@xyflow/react';
import { getStroke } from 'perfect-freehand';
import { useBoardStore } from '../../store/boardStore';
import { useDrawStore, PEN_COLORS, TOOL_SIZE, type PenTool } from '../../store/drawStore';
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
  const [wheel, setWheel] = useState<{ x: number; y: number } | null>(null);
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

      {active && wheel && <ToolWheel x={wheel.x} y={wheel.y} onClose={() => setWheel(null)} />}
    </>
  );
}

// ── Radial tool wheel (right-click while the pen is on) ─────────────────────

// Pie menu: every tool, size and colour is a whole ring slice, so the click
// target is big even though the icons are small. Centre = done.

const TOOLS: Array<{ id: PenTool; label: string; paths: ReactNode }> = [
  { id: 'pen', label: 'Pen', paths: <><path d="M4 20l1.5-4.5L16 5a2 2 0 0 1 3 3L8.5 18.5z" /><path d="M14 7l3 3" /></> },
  { id: 'marker', label: 'Marker', paths: <><path d="M9 15l-4 4h4l2-2" /><path d="M9 15l8.5-8.5a2.1 2.1 0 0 1 3 3L12 18z" /></> },
  { id: 'highlighter', label: 'Highlighter', paths: <><path d="M5 20h6" /><path d="M8 16l-2-2 9-9 4 4-9 9z" /><path d="M12 8l4 4" /></> },
  { id: 'arrow', label: 'Arrow', paths: <><path d="M5 19L19 5" /><path d="M10 5h9v9" /></> },
  { id: 'eraser', label: 'Eraser', paths: <><path d="M7 20h13" /><path d="M5.5 14.5l8-8a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L11 19H8z" /><path d="M9.5 10.5l4 4" /></> },
];
const SIZES = [{ v: 0.5, label: 'Thin line', dot: 2.5 }, { v: 1, label: 'Medium line', dot: 4.5 }, { v: 2, label: 'Thick line', dot: 7 }];
const TRASH = <><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 13h10l1-13" /></>;
const CHECK = <path d="M5 12.5l4.5 4.5L19 7.5" />;

const WHEEL_CSS = `
@keyframes krnl-pie-in { from { opacity: 0; transform: scale(0.55) rotate(-25deg); } to { opacity: 1; transform: scale(1) rotate(0); } }
.krnl-pie { animation: krnl-pie-in 200ms cubic-bezier(.2,.9,.3,1.15) both; transform-origin: center; }
.krnl-pie-slice { cursor: pointer; transition: filter 100ms; }
.krnl-pie-slice:hover { filter: brightness(1.45); }
`;

const R_C = 30;                    // centre button
const R1: [number, number] = [36, 92];   // inner ring: tools + sizes
const R2: [number, number] = [96, 140];  // outer ring: colours + clear
const GAP = 1.6;                   // degrees between slices

function sector(r0: number, r1: number, a0: number, a1: number): string {
  const rad = (d: number) => ((d - 90) * Math.PI) / 180;
  const p = (r: number, d: number) => `${(r * Math.cos(rad(d))).toFixed(2)},${(r * Math.sin(rad(d))).toFixed(2)}`;
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${p(r1, a0)} A${r1},${r1} 0 ${large} 1 ${p(r1, a1)} L${p(r0, a1)} A${r0},${r0} 0 ${large} 0 ${p(r0, a0)} Z`;
}
function centroid(r0: number, r1: number, a0: number, a1: number): [number, number] {
  const d = (((a0 + a1) / 2 - 90) * Math.PI) / 180;
  const r = (r0 + r1) / 2;
  return [r * Math.cos(d), r * Math.sin(d)];
}

interface Slice { key: string; label: string; on: boolean; fill: string; content: (x: number, y: number) => ReactNode; pick: () => void }

function ToolWheel({ x, y, onClose }: { x: number; y: number; onClose: () => void }) {
  const { tool, color, sizeScale, setTool, setColor, setSizeScale, setActive } = useDrawStore();
  const clearDrawings = useBoardStore((s) => s.clearDrawings);
  const [hover, setHover] = useState<string | null>(null);
  const R = R2[1] + 8;
  const cx = Math.min(Math.max(x, R + 12), window.innerWidth - R - 12);
  const cy = Math.min(Math.max(y, R + 12), window.innerHeight - R - 12);
  const BASE = 'rgba(30,33,37,0.97)';
  const icon = (paths: ReactNode, ink: string) => (px: number, py: number) => (
    <g transform={`translate(${px - 10},${py - 10}) scale(0.833)`} fill="none" stroke={ink} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none">{paths}</g>
  );

  const inner: Slice[] = [
    ...TOOLS.map((t) => {
      const on = tool === t.id;
      return { key: t.id, label: t.label, on, fill: on ? '#c9f158' : BASE, content: icon(t.paths, on ? '#0e1012' : '#e8ebee'), pick: () => setTool(t.id) };
    }),
    ...SIZES.map((sz) => {
      const on = sizeScale === sz.v;
      return {
        key: `size-${sz.v}`, label: sz.label, on, fill: on ? '#3a3f45' : BASE,
        content: (px: number, py: number) => <circle cx={px} cy={py} r={sz.dot} fill={color} stroke="rgba(255,255,255,0.35)" strokeWidth={on ? 1.5 : 0.5} pointerEvents="none" />,
        pick: () => setSizeScale(sz.v),
      };
    }),
  ];
  const outer: Slice[] = [
    ...PEN_COLORS.map((col) => {
      const on = color === col && tool !== 'eraser';
      return {
        key: col, label: `Colour ${col}`, on, fill: col,
        content: (px: number, py: number) => (on
          ? <circle cx={px} cy={py} r={5} fill="none" stroke={col === '#1a1814' ? '#fff' : '#0e1012'} strokeWidth={2} pointerEvents="none" />
          : null),
        pick: () => setColor(col),
      };
    }),
    { key: 'clear', label: 'Clear all drawings', on: false, fill: BASE, content: icon(TRASH, '#ff8e64'), pick: () => clearDrawings() },
  ];

  const ring = (slices: Slice[], r0: number, r1: number) => slices.map((sl, i) => {
    const step = 360 / slices.length;
    const a0 = i * step + GAP / 2 - step / 2;
    const a1 = (i + 1) * step - GAP / 2 - step / 2;
    const [px, py] = centroid(r0, r1, a0, a1);
    return (
      <g key={sl.key}>
        <path
          className="krnl-pie-slice"
          data-testid={`draw-wheel-${sl.key}`}
          role="button"
          aria-label={sl.label}
          d={sector(r0, r1, a0, a1)}
          fill={sl.fill}
          stroke={sl.on ? '#c9f158' : 'rgba(255,255,255,0.07)'}
          strokeWidth={sl.on ? 2 : 1}
          onPointerEnter={() => setHover(sl.label)}
          onPointerLeave={() => setHover(null)}
          onClick={() => { sl.pick(); onClose(); }}
        >
          <title>{sl.label}</title>
        </path>
        {sl.content(px, py)}
      </g>
    );
  });

  return createPortal(
    <div data-testid="draw-wheel" onContextMenu={(e) => { e.preventDefault(); onClose(); }}>
      <style>{WHEEL_CSS}</style>
      <div onPointerDown={onClose} style={{ position: 'fixed', inset: 0, zIndex: 3000 }} />
      <svg
        className="krnl-pie"
        width={R * 2}
        height={R * 2}
        viewBox={`${-R} ${-R} ${R * 2} ${R * 2}`}
        style={{ position: 'fixed', left: cx - R, top: cy - R, zIndex: 3001, overflow: 'visible', filter: 'drop-shadow(0 10px 24px rgba(0,0,0,0.55))' }}
      >
        <circle r={R - 2} fill="rgba(12,14,16,0.72)" />
        {ring(inner, R1[0], R1[1])}
        {ring(outer, R2[0], R2[1])}
        <circle
          className="krnl-pie-slice"
          data-testid="draw-wheel-done"
          role="button"
          aria-label="Done drawing"
          r={R_C}
          fill="#24282d"
          stroke="rgba(255,255,255,0.12)"
          onPointerEnter={() => setHover('Done')}
          onPointerLeave={() => setHover(null)}
          onClick={() => { setActive(false); onClose(); }}
        >
          <title>Done (Esc)</title>
        </circle>
        {hover && hover !== 'Done'
          ? <text y={4} textAnchor="middle" fontSize={9.5} fontFamily="var(--font-sans)" fontWeight={600} fill="#e8ebee" pointerEvents="none">{hover.replace('Colour ', '').slice(0, 11)}</text>
          : icon(CHECK, '#e8ebee')(0, 0)}
      </svg>
    </div>,
    document.body,
  );
}
