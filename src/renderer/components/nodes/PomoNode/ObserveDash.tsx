// The Timer's stopwatch face (window-frame.md, "Timer"; owner pick A,
// 2026-11-19): the running time, large and centred; its state in words; then
// today as one quiet line over a day strip (work as rounded segments in its
// category / task colour, breaks as a thin line in the gap). The three total
// tiles are gone: they showed 0m, 0m, 0 most of the day, and Analytics has them.

import type { PomoState } from './types';
import type { TagDef } from '../../../../shared/tags/classify';
import { fmtMin, todaySpans } from './daySpans';

export interface ObserveDashProps {
  state: PomoState;
  /** Elapsed ms of the in-flight span (work or break). */
  liveMs: number;
  library: readonly TagDef[];
  nowMs: number;
  /** Easy mode — all work in one colour. */
  plain?: boolean;
}



export function ObserveDash({ state, liveMs, library, nowMs, plain = false }: ObserveDashProps) {
  const { d0, spans, workMs, breakMs, workSpans } = todaySpans(state, library, nowMs, plain);

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
  const status = state.status === 'running' ? 'Recording' : state.status === 'break' ? 'On break' : 'Not running';
  const statusColor = state.status === 'running' ? 'var(--acid-ink, var(--acid))' : state.status === 'break' ? 'var(--ink-2)' : 'var(--ink-3)';
  const todayLine = workMs <= 0 && breakMs <= 0 ? 'nothing recorded yet'
    : `${fmtMin(workMs)} recorded${breakMs > 0 ? ` · ${fmtMin(breakMs)} break` : ''}${workSpans > 1 ? ` · ${workSpans} spans` : ''}`;

  const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em' };

  return (
    <div data-testid="pomo-observe-dash" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <div data-testid="pomo-observe-clock" style={{ display: 'flex', alignItems: 'baseline', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', lineHeight: 1, fontSize: 64, fontWeight: 500, letterSpacing: '-0.03em', color: 'var(--ink)' }}>
          <span>{h > 0 ? `${h}:${String(m).padStart(2, '0')}` : `${String(m).padStart(2, '0')}`}</span>
          <span style={{ color: 'var(--ink-4)' }}>:</span>
          <span>{String(s).padStart(2, '0')}</span>
        </div>
        <span data-testid="pomo-observe-status" style={{ fontFamily: 'var(--font-read)', fontSize: 13.5, color: statusColor, display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          {state.status === 'running' && <span aria-hidden style={{ width: 7, height: 7, borderRadius: 999, background: 'var(--acid)', boxShadow: '0 0 6px var(--acid)' }} />}
          {status}
        </span>
      </div>

      {/* Today on a strip: where the time went. */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 8, fontFamily: 'var(--font-read)', fontSize: 12.5, color: 'var(--ink-3)' }}>
          <span>Today</span>
          <span data-testid="pomo-observe-today" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{todayLine}</span>
        </div>
        <div data-testid="pomo-observe-strip" style={{ position: 'relative', height: 8, background: 'var(--paper-2)', borderRadius: 999 }}>
          {spans.map((sp) => {
            const w = ((sp.end - sp.start) / (hi - lo)) * 100;
            // Work: a rounded segment, 1px clear of its neighbours so spans
            // read as separate pieces. Break: a thin line through the gap.
            return sp.break ? (
              <span
                key={sp.id}
                data-span="break"
                style={{
                  position: 'absolute', top: 4, height: 2, left: pct(sp.start),
                  width: `max(2px, ${w}%)`, borderRadius: 999, background: 'var(--ink-4)',
                }}
              />
            ) : (
              <span
                key={sp.id}
                data-span="work"
                style={{
                  position: 'absolute', top: 0, bottom: 0, left: `calc(${pct(sp.start)} + 1px)`,
                  width: `max(4px, calc(${w}% - 2px))`, borderRadius: 999, background: sp.color,
                }}
              />
            );
          })}
          <span aria-hidden style={{ position: 'absolute', top: -3, bottom: -3, left: pct(nowMs), width: 2, marginLeft: -1, borderRadius: 999, background: 'var(--ink)' }} />
        </div>
        <div style={{ position: 'relative', height: 12, marginTop: 3 }}>
          {ticks.map((t) => (
            <span key={t} style={{ ...mono, position: 'absolute', left: pct(d0 + t * 3_600_000), transform: 'translateX(-50%)', fontSize: 'var(--face-label, 11px)', color: 'var(--ink-4)', letterSpacing: 0 }}>
              {String(t).padStart(2, '0')}
            </span>
          ))}
        </div>
      </div>

    </div>
  );
}
