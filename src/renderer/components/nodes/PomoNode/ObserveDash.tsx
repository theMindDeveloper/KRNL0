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
  /** Which part to draw: the clock, today's line, or both (the default). The
   *  Timer draws them apart so what you are on sits between them. */
  part?: 'clock' | 'today' | 'both';
}

/** The Timer's clock in both modes (window-frame.md, Timer A): the time,
 *  large and centred, always at full brightness, and nothing else. The state
 *  (Recording, Break, Paused) is said in the header beside the window's name,
 *  not under the time and not in the row with the task (owner, 2026-11-20). */
export function TimerClock({ text, blink = false, testId = 'pomo-clock' }: { text: string; /** The colon blinks while time is being recorded; it is still when paused or idle. */ blink?: boolean; testId?: string }): JSX.Element {
  const i = text.lastIndexOf(':');
  return (
    <div data-testid="pomo-timer-clock" style={{ display: 'flex', justifyContent: 'center' }}>
      <div data-testid={testId} style={{ display: 'flex', alignItems: 'baseline', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', lineHeight: 1, fontSize: 64, fontWeight: 500, letterSpacing: '-0.035em', color: 'var(--ink)' }}>
        <span>{i < 0 ? text : text.slice(0, i)}</span>
        {i >= 0 && <span data-testid="pomo-colon" style={{ color: 'var(--ink-4)', animation: blink ? 'pomo-blink 1s steps(1) infinite' : 'none' }}>:</span>}
        {i >= 0 && <span>{text.slice(i + 1)}</span>}
      </div>
    </div>
  );
}

export function ObserveDash({ state, liveMs, library, nowMs, plain = false, part = 'both' }: ObserveDashProps) {
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
  const todayLine = workMs <= 0 ? 'nothing recorded yet' : `${fmtMin(workMs)} recorded`;
  const todayMore = `${fmtMin(workMs)} recorded in ${workSpans} span${workSpans === 1 ? '' : 's'}${breakMs > 0 ? `, ${fmtMin(breakMs)} of breaks` : ''}`;

  const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em' };

  return (
    <div data-testid={part === 'today' ? 'pomo-today-part' : 'pomo-observe-dash'} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {part !== 'today' && (
        <TimerClock
          testId="pomo-observe-clock"
          blink={state.status === 'running'}
          text={h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`}
        />
      )}

      {/* Today on a strip: where the time went. */}
      {part !== 'clock' && <div data-testid="pomo-today">
        <div title={todayMore} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 12, fontFamily: 'var(--font-read)', fontSize: 13.5 }}>
          <span style={{ color: 'var(--ink-2)', fontWeight: 500 }}>Today</span>
          <span data-testid="pomo-observe-today" style={{ color: 'var(--ink-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{todayLine}</span>
        </div>
        <div data-testid="pomo-observe-strip" style={{ position: 'relative', height: 10, background: 'var(--paper-2)', borderRadius: 999 }}>
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
        <div style={{ position: 'relative', height: 14, marginTop: 8 }}>
          {ticks.map((t) => (
            <span key={t} style={{ ...mono, position: 'absolute', left: pct(d0 + t * 3_600_000), transform: 'translateX(-50%)', fontSize: 11, color: 'var(--ink-3)', letterSpacing: 0, textTransform: 'none' }}>
              {String(t).padStart(2, '0')}
            </span>
          ))}
        </div>
      </div>}

    </div>
  );
}
