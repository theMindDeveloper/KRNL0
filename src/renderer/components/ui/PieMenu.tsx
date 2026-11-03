// PieMenu — a radial menu with nested panels. The first ring shows a few
// categories; picking one with children opens its own ring (the centre turns
// into "back"). Every item is a whole ring slice, so targets stay big.

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Z } from './layers';

export interface PieItem {
  key: string;
  label: string;
  /** SVG paths drawn in a 24×24 box, or a custom swatch colour. */
  icon?: ReactNode;
  swatch?: string;
  active?: boolean;
  /** Keyboard shortcut, shown faintly on the slice. */
  shortcut?: string;
  children?: PieItem[];
  onSelect?: () => void;
}

const CSS = `
@keyframes krnl-pie-pop { from { opacity: 0; transform: scale(0.6) rotate(-20deg); } to { opacity: 1; transform: scale(1) rotate(0); } }
.krnl-piemenu { animation: krnl-pie-pop 190ms cubic-bezier(.2,.9,.3,1.15) both; transform-origin: center; }
.krnl-piemenu-slice { cursor: pointer; transition: filter 100ms; }
.krnl-piemenu-slice:hover { filter: brightness(1.45); }
`;

const R_C = 30;
const R0 = 36;
const R1 = 112;
const GAP = 1.8;

function sector(r0: number, r1: number, a0: number, a1: number): string {
  const rad = (d: number) => ((d - 90) * Math.PI) / 180;
  const p = (r: number, d: number) => `${(r * Math.cos(rad(d))).toFixed(2)},${(r * Math.sin(rad(d))).toFixed(2)}`;
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${p(r1, a0)} A${r1},${r1} 0 ${large} 1 ${p(r1, a1)} L${p(r0, a1)} A${r0},${r0} 0 ${large} 0 ${p(r0, a0)} Z`;
}

const BACK = <path d="M14 6l-6 6 6 6" />;
const CLOSE = <path d="M6 6l12 12M18 6L6 18" />;

export function PieMenu({ x, y, items, onClose, testId = 'pie-menu', center }: {
  x: number; y: number; items: PieItem[]; onClose: () => void; testId?: string;
  /** Root-level centre button (default: close). */
  center?: { label: string; icon: ReactNode; onSelect: () => void };
}) {
  const [stack, setStack] = useState<PieItem[][]>([items]);
  const [hover, setHover] = useState<string | null>(null);
  const level = stack[stack.length - 1]!;
  const nested = stack.length > 1;
  const R = R1 + 8;
  const cx = Math.min(Math.max(x, R + 12), window.innerWidth - R - 12);
  const cy = Math.min(Math.max(y, R + 12), window.innerHeight - R - 12);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (stack.length > 1) setStack((st) => st.slice(0, -1));
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stack.length, onClose]);

  const glyph = (paths: ReactNode, ink: string, px: number, py: number) => (
    <g transform={`translate(${px - 11},${py - 11}) scale(0.92)`} fill="none" stroke={ink} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none">{paths}</g>
  );

  const step = 360 / level.length;
  return createPortal(
    <div data-testid={testId} onContextMenu={(e) => { e.preventDefault(); onClose(); }}>
      <style>{CSS}</style>
      <div onPointerDown={onClose} style={{ position: 'fixed', inset: 0, zIndex: Z.radialBackdrop }} />
      <svg
        key={stack.length}
        className="krnl-piemenu"
        width={R * 2}
        height={R * 2}
        viewBox={`${-R} ${-R} ${R * 2} ${R * 2}`}
        style={{ position: 'fixed', left: cx - R, top: cy - R, zIndex: Z.radial, overflow: 'visible', filter: 'drop-shadow(0 10px 24px rgba(0,0,0,0.55))' }}
      >
        <circle r={R - 2} fill="rgba(12,14,16,0.74)" />
        {level.map((it, i) => {
          const a0 = i * step - step / 2 + GAP / 2;
          const a1 = (i + 1) * step - step / 2 - GAP / 2;
          const mid = (((a0 + a1) / 2 - 90) * Math.PI) / 180;
          const rm = (R0 + R1) / 2;
          const px = rm * Math.cos(mid);
          const py = rm * Math.sin(mid);
          // The wheel is dark in every theme: the active wedge takes the
          // theme's on-dark accent (lime, cyan, amber, white …), never a fixed lime.
          const fill = it.swatch ?? (it.active ? 'var(--accent-on-dark)' : 'rgba(30,33,37,0.97)');
          const ink = it.active && !it.swatch ? '#0e1012' : '#e8ebee';
          return (
            <g key={it.key}>
              <path
                className="krnl-piemenu-slice"
                data-testid={`${testId}-${it.key}`}
                role="button"
                aria-label={it.label}
                d={sector(R0, R1, a0, a1)}
                style={{ fill, stroke: it.active ? 'var(--accent-on-dark)' : 'rgba(255,255,255,0.07)' }}
                strokeWidth={it.active ? 2 : 1}
                onPointerEnter={() => setHover(it.label)}
                onPointerLeave={() => setHover(null)}
                onClick={() => {
                  if (it.children?.length) { setStack((st) => [...st, it.children!]); setHover(null); return; }
                  it.onSelect?.();
                  onClose();
                }}
              >
                <title>{it.label}</title>
              </path>
              {it.icon && glyph(it.icon, it.swatch ? '#1a1814' : ink, px, py - (it.swatch ? 0 : 6))}
              {!it.swatch && (
                <text x={px} y={py + 14} textAnchor="middle" fontSize={8.5} fontFamily="var(--font-sans)" fontWeight={600} fill={ink} pointerEvents="none">
                  {it.label.length > 10 ? `${it.label.slice(0, 9)}…` : it.label}
                </text>
              )}
              {it.shortcut && (
                <text x={(R1 - 12) * Math.cos(mid)} y={(R1 - 12) * Math.sin(mid) + 3} textAnchor="middle" fontSize={8} fontFamily="var(--font-mono)" fill={ink} opacity={0.4} pointerEvents="none">{it.shortcut}</text>
              )}
              {it.children?.length ? (
                <circle cx={(R0 + 6) * Math.cos(mid)} cy={(R0 + 6) * Math.sin(mid)} r={1.8} fill={ink} opacity={0.7} pointerEvents="none" />
              ) : null}
            </g>
          );
        })}
        <circle
          className="krnl-piemenu-slice"
          data-testid={`${testId}-center`}
          role="button"
          aria-label={nested ? 'Back' : center?.label ?? 'Close'}
          r={R_C}
          fill="#24282d"
          stroke="rgba(255,255,255,0.12)"
          onClick={() => {
            if (nested) { setStack((st) => st.slice(0, -1)); return; }
            center?.onSelect();
            onClose();
          }}
        >
          <title>{nested ? 'Back' : center ? center.label : 'Close (Esc)'}</title>
        </circle>
        {hover
          ? <text y={4} textAnchor="middle" fontSize={9} fontFamily="var(--font-sans)" fontWeight={600} fill="#e8ebee" pointerEvents="none">{hover.slice(0, 11)}</text>
          : glyph(nested ? BACK : center?.icon ?? CLOSE, '#e8ebee', 0, 0)}
      </svg>
    </div>,
    document.body,
  );
}
