// Small pieces the pocket looks share: icons, round icon buttons, the
// control row, the progress ring and the Observe day ring.

import type { CSSProperties, ReactNode } from 'react';
import type { PomoControl, PomoControlId } from '../components/nodes/PomoNode/derive';
import type { DaySpans } from '../components/nodes/PomoNode/daySpans';
import { ACID, COAL, EDGE, INK, INK3, MONO, MUTED, NO_DRAG, openMain, runControl } from './model';

const ICONS: Record<PomoControlId | 'open' | 'dock' | 'expand', ReactNode> = {
  start: <path d="M8 5l11 7-11 7z" fill="currentColor" stroke="none" />,
  resume: <path d="M8 5l11 7-11 7z" fill="currentColor" stroke="none" />,
  backToWork: <path d="M8 5l11 7-11 7z" fill="currentColor" stroke="none" />,
  extend: <path d="M12 5v14M5 12h14" />,
  pause: <><path d="M9 5v14" /><path d="M15 5v14" /></>,
  break: <><path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z" /><path d="M16 11h1.5a2.5 2.5 0 0 1 0 5H16" /><path d="M9 3v3M12 3v3" /></>,
  endBreak: <rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" stroke="none" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" stroke="none" />,
  open: <><path d="M14 4h6v6M20 4l-8 8" /><path d="M18 14v5H5V6h5" /></>,
  dock: <path d="M5 12h14" />,
  expand: <><path d="M12 5v14M5 12h14" /></>,
};

export function Icon({ name, size = 15 }: { name: keyof typeof ICONS; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {ICONS[name]}
    </svg>
  );
}

export function RoundButton({ title, onClick, children, primary = false, size = 32, testId }: {
  title: string; onClick: () => void; children: ReactNode; primary?: boolean; size?: number; testId?: string;
}) {
  return (
    <button
      type="button"
      aria-label={title}
      title={title}
      data-testid={testId}
      onClick={onClick}
      className="pk-btn"
      style={{
        ...NO_DRAG, width: size, height: size, display: 'grid', placeItems: 'center', border: 0, borderRadius: 999, cursor: 'pointer', flexShrink: 0,
        background: primary ? ACID : 'transparent', color: primary ? COAL : INK,
      }}
    >
      {children}
    </button>
  );
}

/** Icon buttons for Pomodoro, words for Observe (as in the designs), plus Open and an optional extra. */
export function ControlRow({ controls, words, extra }: { controls: PomoControl[]; words: boolean; extra?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      {controls.map((c) => (words ? (
        <button
          key={c.id}
          type="button"
          data-testid={`pocket-${c.id}`}
          onClick={() => runControl(c)}
          className="pk-btn"
          style={{
            ...NO_DRAG, height: 32, padding: '0 14px', borderRadius: 999, border: 0, cursor: 'pointer', whiteSpace: 'nowrap',
            fontFamily: MONO, fontSize: 11, fontWeight: c.primary ? 700 : 500, letterSpacing: '0.08em', textTransform: 'uppercase',
            background: c.primary ? ACID : 'transparent', color: c.primary ? COAL : INK,
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}
        >
          {c.id === 'stop' && <span style={{ width: 8, height: 8, background: c.primary ? COAL : INK }} />}
          {c.label}
        </button>
      ) : (
        <RoundButton key={c.id} title={c.label} onClick={() => runControl(c)} primary={c.primary} testId={`pocket-${c.id}`}>
          <Icon name={c.id} />
        </RoundButton>
      )))}
      <span style={{ width: 1, height: 20, background: EDGE, margin: '0 4px' }} />
      <RoundButton title="Open KRNL0" onClick={openMain}><Icon name="open" /></RoundButton>
      {extra}
    </div>
  );
}

/** A ring that shows a fraction, starting at 12 o'clock. */
export function Ring({ size, stroke, fraction, color, track = '#2f2b24', pulse = false }: {
  size: number; stroke: number; fraction: number; color: string; track?: string; pulse?: boolean;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, fraction));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden style={{ display: 'block', flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
      {f > 0 && (
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${c * f} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className={pulse ? 'pk-pulse' : undefined}
        />
      )}
    </svg>
  );
}

function polar(c: number, r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [c + r * Math.sin(a), c - r * Math.cos(a)];
}

function arcPath(c: number, r: number, d0: number, d1: number): string {
  const [x0, y0] = polar(c, r, d0);
  const [x1, y1] = polar(c, r, d1);
  const large = d1 - d0 > 180 ? 1 : 0;
  return `M${x0.toFixed(1)} ${y0.toFixed(1)}A${r} ${r} 0 ${large} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}

/** 60 clock ticks inside the ring, five-minute ones longer (the Clock node's ticks). */
export function Ticks({ size, inset }: { size: number; inset: number }) {
  const c = size / 2;
  const out: ReactNode[] = [];
  for (let i = 0; i < 60; i++) {
    const major = i % 5 === 0;
    const [x0, y0] = polar(c, c - inset, i * 6);
    const [x1, y1] = polar(c, c - inset - (major ? 6 : 3), i * 6);
    out.push(<line key={i} x1={x0} y1={y0} x2={x1} y2={y1} stroke={major ? '#5f5541' : '#2f2b24'} strokeWidth={major ? 1.5 : 1} />);
  }
  return <svg width={size} height={size} aria-hidden style={{ position: 'absolute', inset: 0 }}>{out}</svg>;
}

/**
 * Observe: the ring is the waking day, 06–22 (widened to fit). Work spans are
 * rounded arcs in their colour, breaks small dots, now a bright dot.
 */
export function DayRing({ size, stroke, day, now }: { size: number; stroke: number; day: DaySpans; now: number }) {
  const c = size / 2;
  const r = c - stroke / 2 - 2;
  const H = 3_600_000;
  const first = Math.min(6, ...day.spans.map((s) => Math.floor((s.start - day.d0) / H)));
  const last = Math.max(22, Math.ceil((now - day.d0) / H), ...day.spans.map((s) => Math.ceil((s.end - day.d0) / H)));
  const lo = day.d0 + Math.max(0, first) * H;
  const hi = day.d0 + Math.min(24, last) * H;
  const deg = (ms: number) => ((ms - lo) / (hi - lo)) * 360;
  const trim = ((stroke / 2 + 1.5) / r) * (180 / Math.PI);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden style={{ position: 'absolute', inset: 0 }}>
      <circle cx={c} cy={c} r={r} fill="none" stroke="#24211b" strokeWidth={stroke} />
      {day.spans.filter((s) => !s.break).map((s) => {
        const a = deg(s.start) + trim;
        const b = deg(s.end) - trim;
        if (b <= a) {
          const [x, y] = polar(c, r, (deg(s.start) + deg(s.end)) / 2);
          return <circle key={s.id} cx={x} cy={y} r={stroke / 2} fill={s.color} />;
        }
        return <path key={s.id} d={arcPath(c, r, a, b)} fill="none" stroke={s.color} strokeWidth={stroke} strokeLinecap="round" />;
      })}
      {day.spans.filter((s) => s.break).map((s) => {
        const [x, y] = polar(c, r, (deg(s.start) + deg(s.end)) / 2);
        return <circle key={s.id} cx={x} cy={y} r={1.6} fill={MUTED} />;
      })}
      {(() => {
        const [x, y] = polar(c, r, deg(now));
        return (
          <>
            <circle cx={x} cy={y} r={stroke / 2 + 2.5} fill={COAL} />
            <circle cx={x} cy={y} r={stroke / 2} fill={INK} />
          </>
        );
      })()}
    </svg>
  );
}

export const labelStyle: CSSProperties = { fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: INK3 };
export const cardStyle: CSSProperties = {
  background: COAL, borderRadius: 14, boxShadow: `inset 0 0 0 1px ${EDGE}, 0 10px 24px rgba(0,0,0,.45)`, color: INK, fontFamily: MONO,
};
