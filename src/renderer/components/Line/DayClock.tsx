// The same day bent into a ring: the outer ring is the PLAN lane, the inner
// ring is the REAL lane, the hand is now. Noon is at the top and midnight at
// the bottom, so the day still runs left to right.

import { useContext, type MouseEvent, type ReactNode } from 'react';
import { LineUiContext } from './DayLine';
import { fmtClock, fmtDur, type DayData } from './dayData';

const HOUR = 3_600_000;

function pol(c: number, r: number, h: number): [number, number] {
  const a = ((h / 24) * 360 + 90) * (Math.PI / 180);
  return [c + r * Math.cos(a), c + r * Math.sin(a)];
}

/** A clockwise arc from hour `a` to hour `b` (0–24) at radius `r`. */
export function arcPath(c: number, r: number, a: number, b: number): string {
  const [x1, y1] = pol(c, r, a);
  const [x2, y2] = pol(c, r, b);
  return `M${x1.toFixed(1)} ${y1.toFixed(1)} A${r.toFixed(1)} ${r.toFixed(1)} 0 ${b - a > 12 ? 1 : 0} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

interface Props {
  data: DayData;
  nowMs: number;
  size: number;
  /** Hour numbers and ticks (off for the small dials of a week). */
  labels?: boolean;
  children?: ReactNode;
}

export function DayClock({ data, nowMs, size, labels = true, children }: Props) {
  const ui = useContext(LineUiContext);
  const c = size / 2;
  const k = size / 500;
  const rp = 205 * k;
  const rr = 170 * k;
  const wp = 20 * k;
  const wr = 32 * k;
  const hourOf = (ms: number): number => Math.min(24, Math.max(0, (ms - data.d0) / HOUR));
  // A small gap between neighbours, never more than a mark is long.
  const ends = (a: number, b: number): [number, number] => {
    const e = Math.min(0.05, (b - a) / 4);
    return [a + e, b - e];
  };
  const isToday = nowMs >= data.d0 && nowMs < data.d1;
  const at = (e: MouseEvent): { x: number; y: number } => ({ x: e.clientX, y: e.clientY });

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }} data-testid={`line-clock-${data.day}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
        <circle cx={c} cy={c} r={rp} fill="none" stroke="var(--paper-3)" strokeWidth={wp} strokeOpacity={0.45} />
        <circle cx={c} cy={c} r={rr} fill="none" stroke="var(--paper-3)" strokeWidth={wr} strokeOpacity={0.3} />
        {data.plans.map((p) => {
          const [a, b] = ends(hourOf(p.startMs), hourOf(p.endMs));
          const common = { d: arcPath(c, rp, a, b), fill: 'none', strokeWidth: wp } as const;
          const title = <title>{`${p.text} · ${fmtClock(p.startMs)} – ${fmtClock(p.endMs)}`}</title>;
          if (p.kind === 'event') return <path key={p.id} {...common} stroke="var(--ink-4)" strokeOpacity={0.5} strokeDasharray={`${4 * k} ${3 * k}`}>{title}</path>;
          const click = (e: MouseEvent): void => ui.openPlan(p, at(e));
          if (p.state === 'missed') return <path key={p.id} {...common} stroke="var(--rust)" strokeDasharray={`${3 * k} ${3 * k}`} style={{ cursor: 'pointer' }} onClick={click}>{title}</path>;
          return <path key={p.id} {...common} stroke="var(--acid)" strokeOpacity={p.state === 'open' ? 0.3 : 0.8} style={{ cursor: 'pointer' }} onClick={click} data-testid={`clock-plan-${p.id}`}>{title}</path>;
        })}
        {data.real.map((r) => {
          const [a, b] = ends(hourOf(r.startMs), hourOf(r.endMs));
          return <path key={r.id} d={arcPath(c, rr, a, b)} fill="none" stroke={r.color} strokeWidth={wr}><title>{`${r.label} · ${fmtClock(r.startMs)} – ${fmtClock(r.endMs)} · ${fmtDur(r.endMs - r.startMs)}`}</title></path>;
        })}
        {data.gaps.map((g) => {
          const [a, b] = ends(hourOf(g.startMs), hourOf(g.endMs));
          return <path key={g.startMs} d={arcPath(c, rr, a, b)} fill="none" stroke="var(--ink-4)" strokeOpacity={0.75} strokeWidth={wr} strokeDasharray={`${2 * k} ${5 * k}`} style={{ cursor: 'pointer' }} onClick={(e) => ui.openGap(g, at(e))}><title>{`${fmtClock(g.startMs)} – ${fmtClock(g.endMs)} · nothing recorded. Click to say what it was.`}</title></path>;
        })}
        {labels && Array.from({ length: 24 }, (_, h) => {
          const [x1, y1] = pol(c, 222 * k, h);
          const [x2, y2] = pol(c, (h % 3 ? 229 : 233) * k, h);
          return <line key={h} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--ink-4)" strokeWidth={1} strokeOpacity={0.7} />;
        })}
        {labels && [0, 3, 6, 9, 12, 15, 18, 21].map((h) => {
          const [x, y] = pol(c, 244 * k, h);
          return <text key={h} x={x} y={y + 3.5} textAnchor="middle" fontSize={10} fontFamily="var(--font-mono)" fill="var(--ink-3)">{String(h).padStart(2, '0')}</text>;
        })}
        {isToday && (() => {
          const h = hourOf(nowMs);
          const [x1, y1] = pol(c, 132 * k, h);
          const [x2, y2] = pol(c, 234 * k, h);
          return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--rust)" strokeWidth={Math.max(1.5, 2.5 * k)} strokeLinecap="round" data-testid="clock-now" />;
        })()}
      </svg>
      {children && <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', textAlign: 'center' }}>{children}</div>}
    </div>
  );
}
