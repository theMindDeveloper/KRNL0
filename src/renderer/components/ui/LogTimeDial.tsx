// #207 — "Log time" pieces (no clock face):
//   LogTimeDayPicker  Today · Yesterday · ‹ Thu, Nov 5 ›
//   LogTimeBar        the day as a 0–24 h strip: recorded sessions grey, the
//                     selection bright; drag on it to pick a stretch, click a
//                     grey-free part to start there (15-min snap, never past now)
//   LogTimeQuickFill  duration chips (15m · 30m · 1h · 2h from the start) and
//                     the day's gaps between sessions

import { useMemo, useRef } from 'react';
import { useBoardStore } from '../../store/boardStore';
import { selectPomoReality } from '../../store/pomoReality';
import { ymdOf } from '../nodes/PomoNode/spanEdit';

const SNAP_MIN = 15;
const DAY = 1440;

export const toMin = (hm: string): number => { const [h, m] = hm.split(':').map(Number) as [number, number]; return h * 60 + m; };
export const toHM = (min: number): string => { const m = ((Math.round(min) % DAY) + DAY) % DAY; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };

export interface DaySpanMin { startMin: number; endMin: number }

/** Recorded work on `dayYMD` in minutes of the day (clipped to the day). */
export function workSpansOfDay(segs: ReadonlyArray<{ startMs: number; endMs: number; kind: string }>, dayYMD: string): DaySpanMin[] {
  const [y, mo, d] = dayYMD.split('-').map(Number) as [number, number, number];
  const dayStart = new Date(y, mo - 1, d).getTime();
  const dayEnd = new Date(y, mo - 1, d + 1).getTime();
  return segs
    .filter((s) => s.kind === 'work' && s.endMs > dayStart && s.startMs < dayEnd)
    .map((s) => ({ startMin: (Math.max(s.startMs, dayStart) - dayStart) / 60_000, endMin: (Math.min(s.endMs, dayEnd) - dayStart) / 60_000 }))
    .sort((a, b) => a.startMin - b.startMin);
}

/** Empty stretches ≥ 10 min between recorded sessions (and up to now, today). */
export function gapsOfDay(spans: readonly DaySpanMin[], nowMin: number | null): DaySpanMin[] {
  const out: DaySpanMin[] = [];
  for (let i = 1; i < spans.length; i++) {
    const a = spans[i - 1]!.endMin;
    const b = spans[i]!.startMin;
    if (b - a >= 10) out.push({ startMin: a, endMin: b });
  }
  const last = spans[spans.length - 1];
  if (last && nowMin !== null && nowMin - last.endMin >= 10) out.push({ startMin: last.endMin, endMin: nowMin });
  return out;
}

/** Shift a YYYY-MM-DD by `n` days. */
export function addDaysYMD(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  return ymdOf(new Date(y, m - 1, d + n).getTime());
}

const chip = (on = false): React.CSSProperties => ({
  fontFamily: 'var(--font-mono)', fontSize: 10, padding: '4px 9px', borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap',
  border: `1px solid ${on ? 'var(--ink)' : 'var(--paper-3)'}`, background: on ? 'var(--ink)' : 'transparent', color: on ? 'var(--paper)' : 'var(--ink-2)',
});

function useDay(dayYMD: string): { spans: DaySpanMin[]; nowMin: number | null } {
  const board = useBoardStore((s) => s.board);
  const spans = useMemo(() => workSpansOfDay(selectPomoReality(board, Date.now()), dayYMD), [board, dayYMD]);
  const now = new Date();
  return { spans, nowMin: dayYMD === ymdOf(Date.now()) ? now.getHours() * 60 + now.getMinutes() : null };
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Today · Yesterday · ‹ date › — never a future day. */
export function LogTimeDayPicker({ dayYMD, onChange }: { dayYMD: string; onChange: (ymd: string) => void }): JSX.Element {
  const today = ymdOf(Date.now());
  const yesterday = addDaysYMD(today, -1);
  const [y, m, d] = dayYMD.split('-').map(Number) as [number, number, number];
  const date = new Date(y, m - 1, d);
  const arrow: React.CSSProperties = { ...chip(), padding: '4px 8px' };
  return (
    <div data-testid="log-time-day" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <button type="button" data-testid="log-time-today" style={chip(dayYMD === today)} onClick={() => onChange(today)}>Today</button>
      <button type="button" data-testid="log-time-yesterday" style={chip(dayYMD === yesterday)} onClick={() => onChange(yesterday)}>Yesterday</button>
      <span style={{ flex: 1 }} />
      <button type="button" aria-label="Day before" style={arrow} onClick={() => onChange(addDaysYMD(dayYMD, -1))}>‹</button>
      <span data-testid="log-time-date" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink)', minWidth: 86, textAlign: 'center' }}>
        {`${DOW[date.getDay()]}, ${MON[date.getMonth()]} ${date.getDate()}`}
      </span>
      <button type="button" aria-label="Day after" style={{ ...arrow, opacity: dayYMD >= today ? 0.35 : 1 }} disabled={dayYMD >= today} onClick={() => onChange(addDaysYMD(dayYMD, 1))}>›</button>
    </div>
  );
}

/** The day as a 0–24 h strip. Drag to pick a stretch (snaps to 15 min, stops at now). */
export function LogTimeBar({ dayYMD, startHM, endHM, onChange }: {
  dayYMD: string;
  startHM: string;
  endHM: string;
  onChange: (startHM: string, endHM: string) => void;
}): JSX.Element {
  const { spans, nowMin } = useDay(dayYMD);
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<number | null>(null);
  const cap = nowMin ?? DAY;
  const a = toMin(startHM);
  const bRaw = toMin(endHM);
  const b = bRaw <= a ? DAY : bRaw; // past midnight: the strip shows it to 24:00
  const pct = (m: number): string => `${(Math.max(0, Math.min(DAY, m)) / DAY) * 100}%`;
  const minAt = (e: React.PointerEvent): number => {
    const r = ref.current!.getBoundingClientRect();
    const m = ((e.clientX - r.left) / r.width) * DAY;
    return Math.max(0, Math.min(cap, Math.round(m / SNAP_MIN) * SNAP_MIN));
  };
  const set = (x: number, y: number): void => {
    const lo = Math.min(x, y);
    const hi = Math.min(cap, Math.max(x, y) === lo ? lo + SNAP_MIN : Math.max(x, y));
    onChange(toHM(Math.min(lo, hi - 5)), toHM(hi));
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div
        ref={ref}
        data-testid="log-time-bar"
        title="Drag to pick when you worked"
        onPointerDown={(e) => { (e.currentTarget as Element).setPointerCapture(e.pointerId); const m = minAt(e); drag.current = m; set(m, m + 60); }}
        onPointerMove={(e) => { if (drag.current !== null) set(drag.current, minAt(e)); }}
        onPointerUp={() => { drag.current = null; }}
        style={{ position: 'relative', height: 26, borderRadius: 6, background: 'var(--paper-2)', border: '1px solid var(--paper-3)', cursor: 'crosshair', touchAction: 'none', overflow: 'hidden' }}
      >
        {/* hour grid every 3 h */}
        {Array.from({ length: 7 }).map((_, i) => (
          <span key={i} style={{ position: 'absolute', top: 0, bottom: 0, left: pct((i + 1) * 180), width: 1, background: 'var(--paper-3)' }} />
        ))}
        {/* the future (today) is out of reach */}
        {nowMin !== null && <span style={{ position: 'absolute', top: 0, bottom: 0, left: pct(nowMin), right: 0, background: 'repeating-linear-gradient(45deg, transparent 0 4px, color-mix(in srgb, var(--ink-4) 18%, transparent) 4px 5px)' }} />}
        {spans.map((s, i) => (
          <span key={i} title="Already recorded" style={{ position: 'absolute', top: 4, bottom: 4, left: pct(s.startMin), width: `calc(${pct(s.endMin - s.startMin)})`, borderRadius: 3, background: 'var(--ink-3)', opacity: 0.55 }} />
        ))}
        <span data-testid="log-time-bar-selection" style={{ position: 'absolute', top: 2, bottom: 2, left: pct(a), width: `calc(${pct(b - a)})`, minWidth: 3, borderRadius: 4, background: 'var(--acid)', opacity: 0.9, boxShadow: '0 0 0 1px var(--acid)' }} />
        {nowMin !== null && <span style={{ position: 'absolute', top: 0, bottom: 0, left: pct(nowMin), width: 2, background: 'var(--rust)' }} />}
      </div>
      <div style={{ position: 'relative', height: 10, fontFamily: 'var(--font-mono)', fontSize: 8.5, color: 'var(--ink-4)' }}>
        {[0, 6, 12, 18, 24].map((h) => (
          <span key={h} style={{ position: 'absolute', left: pct(h * 60), transform: h === 0 ? 'none' : h === 24 ? 'translateX(-100%)' : 'translateX(-50%)' }}>{String(h).padStart(2, '0')}</span>
        ))}
      </div>
    </div>
  );
}

/** Duration chips (from the start time) and the day's gaps. */
export function LogTimeQuickFill({ dayYMD, startHM, onChange }: { dayYMD: string; startHM: string; onChange: (startHM: string, endHM: string) => void }): JSX.Element {
  const { spans, nowMin } = useDay(dayYMD);
  const gaps = gapsOfDay(spans, nowMin).slice(-3);
  const start = toMin(startHM);
  return (
    <div data-testid="log-time-quick" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      {[15, 30, 60, 120].map((m) => {
        const end = start + m;
        const tooLate = nowMin !== null && end > nowMin;
        return (
          <button key={m} type="button" data-testid={`log-time-dur-${m}`} style={{ ...chip(), opacity: tooLate ? 0.4 : 1 }} disabled={tooLate}
            title={tooLate ? 'That would end in the future' : `${startHM} + ${m >= 60 ? `${m / 60}h` : `${m}m`}`}
            onClick={() => onChange(startHM, toHM(end))}>
            {m >= 60 ? `${m / 60}h` : `${m}m`}
          </button>
        );
      })}
      {gaps.map((g) => (
        <button key={g.startMin} type="button" data-testid="log-time-gap" style={chip()} title="Fill the gap between two sessions"
          onClick={() => onChange(toHM(g.startMin), toHM(g.endMin))}>
          gap {toHM(g.startMin)}–{toHM(g.endMin)}
        </button>
      ))}
    </div>
  );
}
