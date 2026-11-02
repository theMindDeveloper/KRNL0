// The pen tool wheel (right-click while drawing, or Pen in the canvas wheel):
// inner ring = tools + line sizes, outer ring = colours + clear, centre = done.

import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useBoardStore } from '../../store/boardStore';
import { useDrawStore, PEN_COLORS, type PenTool } from '../../store/drawStore';

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

export function PenWheel({ x, y, onClose }: { x: number; y: number; onClose: () => void }) {
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
