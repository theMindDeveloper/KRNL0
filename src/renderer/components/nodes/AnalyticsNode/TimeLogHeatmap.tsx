// #207 / time-log F9 — "what did I do, when, on what": tasks × days from the
// durable time log. Week or month, ‹ › to page through time. Each cell is the
// recorded work on that task that day; the row ends with the total and the
// plan. Rows come from the log's text snapshot, so deleted tasks keep their
// history. Built once per open/range change (NF3) — no animation.

import { useEffect, useMemo, useState } from 'react';
import { foldTimeLog, type TimeLogEntry, type TimeLogFold } from '../../../../shared/timelog';
import { queryTimeLog } from '../../../store/timeLog';
import { fmtMinutes } from '../ClockNode/dayModel';

type Span = 'week' | 'month';

const pad = (n: number): string => String(n).padStart(2, '0');
const ymd = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** [from, to] of the week (Mon–Sun) or month containing `anchor`. */
export function rangeOf(span: Span, anchor: Date): { from: string; to: string; title: string } {
  if (span === 'month') {
    const a = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const b = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    return { from: ymd(a), to: ymd(b), title: a.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) };
  }
  const dow = (anchor.getDay() + 6) % 7; // Mon = 0
  const a = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - dow);
  const b = new Date(a.getFullYear(), a.getMonth(), a.getDate() + 6);
  return { from: ymd(a), to: ymd(b), title: `${a.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${b.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` };
}

function shift(span: Span, anchor: Date, dir: -1 | 1): Date {
  return span === 'month'
    ? new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1)
    : new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + 7 * dir);
}

const segBtn = (on: boolean): React.CSSProperties => ({
  fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.06em', textTransform: 'uppercase',
  padding: '2px 8px', borderRadius: 4, cursor: 'pointer',
  border: '1px solid var(--paper-3)', background: on ? 'var(--ink)' : 'transparent', color: on ? 'var(--paper)' : 'var(--ink-3)',
});

export function TimeLogHeatmap({ width, height }: { width: number; height: number }): JSX.Element {
  const [span, setSpan] = useState<Span>('week');
  const [anchor, setAnchor] = useState(() => new Date());
  const [entries, setEntries] = useState<TimeLogEntry[] | null>(null);
  const r = rangeOf(span, anchor);

  useEffect(() => {
    let alive = true;
    setEntries(null);
    void queryTimeLog(r.from, r.to).then((e) => { if (alive) setEntries(e); });
    return () => { alive = false; };
  }, [r.from, r.to]);

  const fold: TimeLogFold | null = useMemo(() => (entries ? foldTimeLog(entries, { fromYMD: r.from, toYMD: r.to }) : null), [entries, r.from, r.to]);

  const NAME_W = Math.min(150, Math.max(90, width * 0.22));
  const TOTAL_W = 92;
  const days = fold?.days ?? [];
  const cellW = days.length ? Math.max(8, (width - NAME_W - TOTAL_W - 8) / days.length) : 10;
  const ROW_H = 18;
  const maxRows = Math.max(1, Math.floor((height - 28 - 20 - 22) / (ROW_H + 2)));
  const rows = (fold?.tasks ?? []).filter((t) => t.totalMin > 0 || t.plan || t.completions.length > 0);
  const shown = rows.slice(0, maxRows);
  const maxCell = Math.max(30, ...shown.flatMap((t) => Object.values(t.byDay)));
  const today = ymd(new Date());
  const tagEntries = Object.entries(fold?.byTag ?? {}).filter(([, v]) => v.totalMin > 0).sort((a, b) => b[1].totalMin - a[1].totalMin);

  return (
    <div data-testid="time-log-heatmap" style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button type="button" style={segBtn(span === 'week')} onClick={() => setSpan('week')}>Week</button>
        <button type="button" style={segBtn(span === 'month')} onClick={() => setSpan('month')}>Month</button>
        <span style={{ flex: 1 }} />
        <button type="button" aria-label="Earlier" style={segBtn(false)} onClick={() => setAnchor(shift(span, anchor, -1))}>‹</button>
        <span data-testid="time-log-range" style={{ minWidth: 120, textAlign: 'center', color: 'var(--ink)' }}>{r.title}</span>
        <button type="button" aria-label="Later" style={segBtn(false)} onClick={() => setAnchor(shift(span, anchor, 1))}>›</button>
        <button type="button" style={segBtn(false)} onClick={() => setAnchor(new Date())}>Now</button>
        <span style={{ color: 'var(--ink)', marginLeft: 6 }}>{fold ? `${fmtMinutes(fold.totalMin)} total` : '…'}</span>
      </div>

      {!fold ? (
        <div style={{ color: 'var(--ink-4)', padding: 8 }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={{ color: 'var(--ink-4)', padding: 8 }}>Nothing recorded in this {span}. Start Observe, or log past time from the Calendar.</div>
      ) : (
        <div role="table" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div role="row" style={{ display: 'flex', alignItems: 'center', height: 14, color: 'var(--ink-4)', fontSize: 8.5 }}>
            <span style={{ width: NAME_W }} />
            {days.map((d) => {
              const dt = new Date(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
              const label = span === 'week' ? dt.toLocaleDateString(undefined, { weekday: 'short' }) : (dt.getDate() === 1 || dt.getDate() % 5 === 0 ? String(dt.getDate()) : '');
              return <span key={d} style={{ width: cellW, textAlign: 'center', color: d === today ? 'var(--ink)' : undefined }}>{label}</span>;
            })}
            <span style={{ width: TOTAL_W, textAlign: 'right' }}>worked / plan</span>
          </div>
          {shown.map((t) => (
            <div role="row" key={t.key} data-testid="time-log-row" style={{ display: 'flex', alignItems: 'center', height: ROW_H }}>
              <span title={t.taskText} style={{ width: NAME_W, paddingRight: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: t.taskId ? 'var(--ink)' : 'var(--ink-3)' }}>
                {t.done ? '✓ ' : ''}{t.taskText || 'untagged'}
              </span>
              {days.map((d) => {
                const m = t.byDay[d] ?? 0;
                return (
                  <span
                    key={d}
                    title={m ? `${t.taskText || 'untagged'} · ${d} · ${fmtMinutes(m)}` : undefined}
                    style={{
                      width: Math.max(4, cellW - 2), height: ROW_H - 4, marginRight: 2, borderRadius: 3,
                      background: m ? `color-mix(in srgb, var(--acid) ${Math.round(25 + 75 * Math.min(1, m / maxCell))}%, transparent)` : 'var(--paper-2)',
                    }}
                  />
                );
              })}
              <span style={{ width: TOTAL_W, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                <span style={{ color: 'var(--ink)' }}>{fmtMinutes(t.totalMin)}</span>
                {t.plannedMin ? (
                  <span style={{ color: t.totalMin > t.plannedMin ? 'var(--rust)' : 'var(--ink-4)' }}> / {fmtMinutes(t.plannedMin)}</span>
                ) : null}
              </span>
            </div>
          ))}
          {rows.length > shown.length && (
            <div style={{ color: 'var(--ink-4)', fontSize: 9 }}>+{rows.length - shown.length} more — switch to Week or make the window taller</div>
          )}
          <div role="row" style={{ display: 'flex', alignItems: 'center', height: 14, color: 'var(--ink-3)', fontSize: 8.5, borderTop: '1px solid var(--paper-3)', paddingTop: 2 }}>
            <span style={{ width: NAME_W }}>per day</span>
            {days.map((d) => (
              <span key={d} style={{ width: cellW, textAlign: 'center' }}>{fold.byDay[d] ? (span === 'week' ? fmtMinutes(fold.byDay[d] ?? 0) : '•') : ''}</span>
            ))}
            <span style={{ width: TOTAL_W }} />
          </div>
        </div>
      )}
      {tagEntries.length > 0 && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', color: 'var(--ink-3)', fontSize: 9 }}>
          {tagEntries.slice(0, 8).map(([tag, v]) => <span key={tag}>{tag} <span style={{ color: 'var(--ink)' }}>{fmtMinutes(v.totalMin)}</span></span>)}
        </div>
      )}
    </div>
  );
}
