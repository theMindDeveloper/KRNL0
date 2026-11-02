// Observe mode face — the running time of the current span, today's spans on
// a day strip (work in its category / task colour, breaks hatched) and three
// small totals. Replaces the pomodoro timer faces, which assume a session
// length Observe mode doesn't have.

import type { PomoState } from './types';
import type { TagDef } from '../../../../shared/tags/classify';
import { spanTone } from '../../../store/spanTags';

export interface ObserveDashProps {
  state: PomoState;
  /** Elapsed ms of the in-flight span (work or break). */
  liveMs: number;
  library: readonly TagDef[];
  nowMs: number;
}

const HATCH = 'repeating-linear-gradient(135deg, var(--ink-3) 0 1px, transparent 1px 3px)';

function fmtMin(ms: number): string {
  const min = Math.floor(ms / 60_000);
  return min < 60 ? `${min}m` : `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`;
}

export function ObserveDash({ state, liveMs, library, nowMs }: ObserveDashProps) {
  const dayStart = new Date(nowMs);
  dayStart.setHours(0, 0, 0, 0);
  const d0 = dayStart.getTime();
  const DAY = 86_400_000;

  // Today's spans, clipped to the day, plus the live one.
  const spans: Array<{ id: string; start: number; end: number; break: boolean; color: string }> = [];
  for (const r of state.history) {
    const start = Math.max(d0, Date.parse(r.startedAt));
    const end = Math.min(d0 + DAY, Date.parse(r.endedAt));
    if (!(end > start)) continue;
    const color = spanTone(library, r);
    spans.push({ id: r.id, start, end, break: r.kind === 'break', color });
  }
  const live = (state.status === 'running' || state.status === 'break') && state.startedAt !== null;
  if (live) {
    const start = Math.max(d0, Date.parse(state.startedAt as string));
    if (nowMs > start) {
      spans.push({
        id: 'live', start, end: nowMs, break: state.status === 'break',
        color: spanTone(library, { kind: 'work', taskId: state.activeTaskId, tag: state.tag ?? null }),
      });
    }
  }
  let workMs = 0;
  let breakMs = 0;
  let workSpans = 0;
  for (const s of spans) {
    if (s.break) breakMs += s.end - s.start;
    else { workMs += s.end - s.start; workSpans++; }
  }

  // Show the waking part of the day: 06–22 by default, widened to fit spans.
  const firstH = Math.min(6, ...spans.map((s) => Math.floor((s.start - d0) / 3_600_000)));
  const lastH = Math.max(22, Math.ceil((nowMs - d0) / 3_600_000), ...spans.map((s) => Math.ceil((s.end - d0) / 3_600_000)));
  const lo = d0 + Math.max(0, firstH) * 3_600_000;
  const hi = d0 + Math.min(24, lastH) * 3_600_000;
  const pct = (ms: number) => `${((ms - lo) / (hi - lo)) * 100}%`;
  const ticks: number[] = [];
  for (let h = Math.ceil((lo - d0) / 3_600_000); h <= (hi - d0) / 3_600_000; h += 3) ticks.push(h);

  const totalSec = Math.floor(Math.max(0, liveMs) / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const status = state.status === 'running' ? 'working' : state.status === 'break' ? 'on break' : 'idle';
  const statusColor = state.status === 'running' ? 'var(--acid)' : state.status === 'break' ? 'var(--ink-2)' : 'var(--ink-4)';

  const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em' };

  return (
    <div data-testid="pomo-observe-dash" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <div data-testid="pomo-observe-clock" style={{ display: 'flex', alignItems: 'baseline', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
          <span style={{ fontSize: 40, fontWeight: 700, letterSpacing: '-0.03em', color: live ? 'var(--ink)' : 'var(--ink-3)' }}>
            {h > 0 ? `${h}:${String(m).padStart(2, '0')}` : `${String(m).padStart(2, '0')}`}
          </span>
          <span style={{ fontSize: 20, fontWeight: 600, color: 'var(--ink-3)', marginLeft: 2 }}>
            :{String(s).padStart(2, '0')}
          </span>
          <span style={{ ...mono, fontSize: 9, color: 'var(--ink-4)', marginLeft: 8 }}>{h > 0 ? 'h:m:s' : 'min:s'}</span>
        </div>
        <span style={{ ...mono, fontSize: 9, color: statusColor, display: 'inline-flex', alignItems: 'center', gap: 5, paddingBottom: 4 }}>
          <span aria-hidden style={{ width: 6, height: 6, borderRadius: 999, background: statusColor, boxShadow: state.status === 'running' ? '0 0 6px var(--acid)' : 'none' }} />
          {status}
        </span>
      </div>

      {/* Today on a strip: where the time went. */}
      <div>
        <div style={{ position: 'relative', height: 14, background: 'var(--paper-2)', border: '1px solid var(--paper-3)', borderRadius: 3, overflow: 'hidden' }}>
          {spans.map((sp) => (
            <span
              key={sp.id}
              style={{
                position: 'absolute', top: 0, bottom: 0, left: pct(sp.start),
                width: `max(2px, ${((sp.end - sp.start) / (hi - lo)) * 100}%)`,
                background: sp.break ? HATCH : sp.color,
                opacity: sp.break ? 0.8 : 0.9,
              }}
            />
          ))}
          <span aria-hidden style={{ position: 'absolute', top: -1, bottom: -1, left: pct(nowMs), width: 1.5, background: 'var(--rust)' }} />
        </div>
        <div style={{ position: 'relative', height: 12, marginTop: 3 }}>
          {ticks.map((t) => (
            <span key={t} style={{ ...mono, position: 'absolute', left: pct(d0 + t * 3_600_000), transform: 'translateX(-50%)', fontSize: 8, color: 'var(--ink-4)', letterSpacing: 0 }}>
              {String(t).padStart(2, '0')}
            </span>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
        {[
          ['work today', fmtMin(workMs)],
          ['breaks', fmtMin(breakMs)],
          ['spans', String(workSpans)],
        ].map(([label, value]) => (
          <div key={label} style={{ padding: '6px 8px', background: 'var(--paper-2)', borderRadius: 4 }}>
            <div style={{ ...mono, fontSize: 8, color: 'var(--ink-4)' }}>{label}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
