// Pen tool — freehand drawing on the canvas (perfect-freehand outlines).
//
// Strokes are stored in flow coordinates on board.drawings and rendered in a
// ViewportPortal, so they pan and zoom with the canvas. While the pen is on,
// a transparent capture layer sits over the canvas:
//   - left-drag   draws with the current tool (pen / marker / highlighter)
//   - eraser      removes whole strokes it touches
//   - right-click opens the radial tool wheel (tools, colours, sizes, clear)
//   - Esc         leaves the pen
// The mouse wheel still pans/zooms the canvas (forwarded to React Flow).

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { ViewportPortal, useReactFlow } from '@xyflow/react';
import { getStroke } from 'perfect-freehand';
import { useBoardStore } from '../../store/boardStore';
import { useDrawStore, PEN_COLORS, TOOL_SIZE, type PenTool } from '../../store/drawStore';
import type { DrawStroke, DrawTool } from '../../../shared/types/board';

/** SVG path for a perfect-freehand outline. Exported for tests. */
export function strokePath(points: DrawStroke['points'], size: number, tool: DrawTool): string {
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

/** Ids of strokes with a point within `radius` of (x, y). Exported for tests. */
export function strokesHit(strokes: readonly DrawStroke[], x: number, y: number, radius: number): string[] {
  const r2 = radius * radius;
  return strokes
    .filter((s) => s.points.some(([px, py]) => (px - x) ** 2 + (py - y) ** 2 <= r2 + (s.size / 2) ** 2))
    .map((s) => s.id);
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

export function DrawLayer() {
  const drawings = useBoardStore((s) => s.board?.drawings);
  const addStroke = useBoardStore((s) => s.addStroke);
  const removeStrokes = useBoardStore((s) => s.removeStrokes);
  const { active, tool, color, sizeScale, setActive } = useDrawStore();
  const { screenToFlowPosition, getZoom, getViewport, setViewport } = useReactFlow();
  const [live, setLive] = useState<DrawStroke['points'] | null>(null);
  const [wheel, setWheel] = useState<{ x: number; y: number } | null>(null);
  const drawing = useRef(false);

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
    if (e.button !== 0) return;
    setWheel(null);
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    if (tool === 'eraser') erase(e);
    else setLive([toFlow(e)]);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drawing.current) return;
    if (tool === 'eraser') erase(e);
    else setLive((pts) => (pts ? [...pts, toFlow(e)] : pts));
  };
  const onPointerUp = () => {
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
          onContextMenu={(e) => { e.preventDefault(); setWheel({ x: e.clientX, y: e.clientY }); }}
          onWheel={(e) => {
            // Keep pan/zoom working while the pen is on.
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
            position: 'absolute', inset: 0, zIndex: 20, touchAction: 'none',
            cursor: tool === 'eraser' ? 'cell' : 'crosshair',
          }}
        />
      )}

      {active && wheel && <ToolWheel x={wheel.x} y={wheel.y} onClose={() => setWheel(null)} />}
    </>
  );
}

// ── Radial tool wheel (right-click while the pen is on) ─────────────────────

const TOOLS: Array<{ id: PenTool; label: string; glyph: string }> = [
  { id: 'pen', label: 'Pen', glyph: '✎' },
  { id: 'marker', label: 'Marker', glyph: '▮' },
  { id: 'highlighter', label: 'Highlighter', glyph: '▬' },
  { id: 'eraser', label: 'Eraser', glyph: '⌫' },
];
const SIZES = [{ v: 0.5, label: 'S' }, { v: 1, label: 'M' }, { v: 2, label: 'L' }];

function ToolWheel({ x, y, onClose }: { x: number; y: number; onClose: () => void }) {
  const { tool, color, sizeScale, setTool, setColor, setSizeScale, setActive } = useDrawStore();
  const clearDrawings = useBoardStore((s) => s.clearDrawings);
  const R_IN = 54;
  const R_OUT = 104;
  // Keep the whole wheel on screen.
  const cx = Math.min(Math.max(x, R_OUT + 24), window.innerWidth - R_OUT - 24);
  const cy = Math.min(Math.max(y, R_OUT + 24), window.innerHeight - R_OUT - 24);
  const at = (i: number, n: number, r: number, offset = -90) => {
    const a = ((offset + (360 / n) * i) * Math.PI) / 180;
    return { left: cx + r * Math.cos(a), top: cy + r * Math.sin(a) };
  };
  const btn = (on: boolean, size: number): React.CSSProperties => ({
    position: 'fixed', width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2,
    borderRadius: 999, display: 'grid', placeItems: 'center', cursor: 'pointer',
    border: `2px solid ${on ? 'var(--acid, #c9f158)' : 'rgba(255,255,255,0.12)'}`,
    background: 'var(--paper-2, #1a1d20)', color: 'var(--ink, #eee)',
    fontFamily: 'var(--font-mono)', fontSize: 14, boxShadow: '0 4px 14px rgba(0,0,0,0.45)',
    transition: 'transform 120ms', padding: 0,
  });
  const ring = [...TOOLS.map((t) => ({ kind: 'tool' as const, ...t })), ...SIZES.map((s) => ({ kind: 'size' as const, ...s }))];

  return createPortal(
    <div data-testid="draw-wheel" onContextMenu={(e) => { e.preventDefault(); onClose(); }}>
      <div onPointerDown={onClose} style={{ position: 'fixed', inset: 0, zIndex: 3000 }} />
      <div style={{ position: 'fixed', inset: 0, zIndex: 3001, pointerEvents: 'none' }}>
        <div style={{
          position: 'fixed', left: cx - R_OUT - 26, top: cy - R_OUT - 26, width: (R_OUT + 26) * 2, height: (R_OUT + 26) * 2,
          borderRadius: 999, background: 'rgba(10,12,14,0.55)', backdropFilter: 'blur(6px)',
        }} />
        <div style={{ pointerEvents: 'auto' }}>
          {/* Centre: leave the pen */}
          <button type="button" aria-label="Exit pen" title="Exit pen (Esc)" onClick={() => { setActive(false); onClose(); }}
            style={{ ...btn(false, 44), left: cx, top: cy, fontSize: 12 }}>✕</button>
          {/* Inner ring: tools + sizes */}
          {ring.map((it, i) => {
            const on = it.kind === 'tool' ? tool === it.id : sizeScale === it.v;
            return (
              <button key={`${it.kind}-${it.label}`} type="button" aria-label={it.label} title={it.label}
                onClick={() => { if (it.kind === 'tool') setTool(it.id); else setSizeScale(it.v); onClose(); }}
                style={{ ...btn(on, 40), ...at(i, ring.length, R_IN) }}>
                {it.kind === 'tool' ? it.glyph : it.label}
              </button>
            );
          })}
          {/* Outer ring: colours + clear */}
          {[...PEN_COLORS, 'clear'].map((c, i, arr) => (
            c === 'clear' ? (
              <button key="clear" type="button" aria-label="Clear drawing" title="Clear all drawings (undo with Ctrl+Z)"
                onClick={() => { clearDrawings(); onClose(); }}
                style={{ ...btn(false, 34), ...at(i, arr.length, R_OUT), color: 'var(--rust, #ff8e64)', fontSize: 11 }}>⨯</button>
            ) : (
              <button key={c} type="button" aria-label={`Colour ${c}`} title={c}
                onClick={() => { setColor(c); onClose(); }}
                style={{ ...btn(color === c && tool !== 'eraser', 34), ...at(i, arr.length, R_OUT), background: c }} />
            )
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
