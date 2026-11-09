// #207 / time-log F9 — "what did I work on, when". Tasks × days from the
// durable time log (history survives task deletion). Week or month, ‹ › to
// page through time.
//   - each row: the task's colour dot, its name, its tag
//   - each cell: time worked that day, in the task's own colour (darker = more;
//     the minutes are written in the cell in Week)
//   - right: worked / planned (rust when over), ✓ when done
//   - bottom: per-day totals, then "By tag" — the share of time per tag
// Built once per open / range change — no animation.

import { LineGlyph } from '../../ui/LineGlyph';
import { useEffect, useMemo, useState } from 'react';
import { foldTimeLog, type TimeLogEntry, type TimeLogFold } from '../../../../shared/timelog';
import { queryTimeLog } from '../../../store/timeLog';
import { useBoardStore } from '../../../store/boardStore';
import { boardTagLibrary } from '../../../store/spanTags';
import { toneVarForTask } from '../../../utils/taskColor';
import { CategoryIcon } from '../PomoNode/CategoryIcon';

type Span = 'week' | 'month';

const pad = (n: number): string => String(n).padStart(2, '0');
const ymd = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmt = (m: number): string => {
  const r = Math.round(m);
  if (r < 60) return `${r}m`;
  return r % 60 ? `${Math.floor(r / 60)}h${pad(r % 60)}` : `${Math.floor(r / 60)}h`;
};

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
  fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.04em',
  padding: '4px 10px', borderRadius: 999, cursor: 'pointer',
  border: `1px solid ${on ? 'var(--k-an-ink-1, var(--ink))' : 'var(--k-an-line, var(--paper-3))'}`,
  background: on ? 'var(--k-an-ink-1, var(--ink))' : 'transparent', color: on ? 'var(--k-an-bg, var(--paper))' : 'var(--k-an-ink-2, var(--ink-2))',
});

export function TimeLogHeatmap({ width, height }: { width: number; height: number }): JSX.Element {
  const [span, setSpan] = useState<Span>('week');
  const [anchor, setAnchor] = useState(() => new Date());
  const [entries, setEntries] = useState<TimeLogEntry[] | null>(null);
  const r = rangeOf(span, anchor);
  const todoNode = useBoardStore((st) => st.board?.nodes.find((n) => n.kind === 'todo' && n.isMother));
  const library = useMemo(() => boardTagLibrary(todoNode ? { nodes: [todoNode] } : null), [todoNode]);
  const tagOfTask = useMemo(() => {
    const m = new Map<string, string>();
    for (const it of ((todoNode?.state as { items?: Array<{ taskNodeId?: string | null; tag?: string }> } | undefined)?.items ?? [])) {
      if (it.taskNodeId && it.tag) m.set(it.taskNodeId, it.tag);
    }
    return m;
  }, [todoNode]);

  useEffect(() => {
    let alive = true;
    setEntries(null);
    void queryTimeLog(r.from, r.to).then((e) => { if (alive) setEntries(e); });
    return () => { alive = false; };
  }, [r.from, r.to]);

  const fold: TimeLogFold | null = useMemo(() => (entries ? foldTimeLog(entries, { fromYMD: r.from, toYMD: r.to }) : null), [entries, r.from, r.to]);

  const days = fold?.days ?? [];
  const NAME_W = Math.min(190, Math.max(110, width * 0.26));
  const TOTAL_W = 104;
  const GAP = span === 'week' ? 4 : 2;
  const cellW = days.length ? Math.max(8, (width - NAME_W - TOTAL_W - 12 - GAP * days.length) / days.length) : 10;
  const ROW_H = 26;
  const rows = (fold?.tasks ?? []).filter((t) => t.totalMin > 0 || t.plan || t.completions.length > 0);
  const maxRows = Math.max(1, Math.floor((height - 150) / (ROW_H + 4)));
  // Every row stays readable: past the window's height the list scrolls
  // (never "+N more").
  const shown = rows;
  const maxCell = Math.max(30, ...shown.flatMap((t) => Object.values(t.byDay)));
  const today = ymd(new Date());
  const tagInfo = (id: string) => library.find((t) => t.id === id);
  const rowColor = (t: TimeLogFold['tasks'][number]): string => (t.taskId ? toneVarForTask(t.taskId) : tagInfo(t.tag ?? '')?.color ?? 'var(--k-an-ink-3, var(--ink-3))');
  const rowTag = (t: TimeLogFold['tasks'][number]): string | null => (t.taskId ? tagOfTask.get(t.taskId) ?? t.tag : t.tag);
  // By tag: each row's own tag (a task's Todo tag, else the span's category).
  const byTag = new Map<string, number>();
  for (const t of rows) if (t.totalMin > 0) { const k = rowTag(t) ?? 'untagged'; byTag.set(k, (byTag.get(k) ?? 0) + t.totalMin); }
  const tagEntries = [...byTag.entries()].map(([k, m]) => [k, { totalMin: m }] as const).sort((x, y) => y[1].totalMin - x[1].totalMin);
  const tagTotal = tagEntries.reduce((n, [, v]) => n + v.totalMin, 0);
  const ink1 = 'var(--k-an-ink-1, var(--ink))';
  const ink3 = 'var(--k-an-ink-3, var(--ink-3))';

  return (
    <div data-testid="time-log-heatmap" style={{ display: 'flex', flexDirection: 'column', gap: 12, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--k-an-ink-2, var(--ink-2))', minWidth: 0 }}>
      {/* controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" style={segBtn(span === 'week')} onClick={() => setSpan('week')}>Week</button>
        <button type="button" style={segBtn(span === 'month')} onClick={() => setSpan('month')}>Month</button>
        <span style={{ flex: 1 }} />
        {/* The arrows and the range wrap as one unit, never "›" alone on a line. */}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
          <button type="button" aria-label="Earlier" style={{ ...segBtn(false), display: 'inline-grid', placeItems: 'center' }} onClick={() => setAnchor(shift(span, anchor, -1))}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 5l-7 7 7 7" /></svg>
          </button>
          <span data-testid="time-log-range" style={{ minWidth: 110, textAlign: 'center', color: ink1, fontSize: 12 }}>{r.title}</span>
          <button type="button" aria-label="Later" style={{ ...segBtn(false), display: 'inline-grid', placeItems: 'center' }} onClick={() => setAnchor(shift(span, anchor, 1))}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 5l7 7-7 7" /></svg>
          </button>
          <button type="button" style={segBtn(false)} onClick={() => setAnchor(new Date())}>This {span}</button>
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: ink1, fontFamily: 'var(--font-sans)' }}>{fold ? fmt(fold.totalMin) : '…'}</span>
        <span style={{ color: ink3 }}>worked{rows.length ? ` on ${rows.filter((t) => t.totalMin > 0).length} things` : ''} · each square is a day, darker = more time</span>
      </div>

      {!fold ? (
        <div style={{ color: ink3, padding: 8 }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={{ color: ink3, padding: '16px 0' }}>Nothing recorded this {span}. Start a session on the Pomo, or log past time from the Calendar.</div>
      ) : (
        <div role="table" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div role="row" style={{ display: 'flex', alignItems: 'center', height: 16, color: ink3, fontSize: 11 }}>
            <span style={{ width: NAME_W, flexShrink: 0 }} />
            {days.map((d) => {
              const dt = new Date(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
              const label = span === 'week' ? dt.toLocaleDateString(undefined, { weekday: 'short' }) : (dt.getDate() === 1 || dt.getDate() % 5 === 0 ? String(dt.getDate()) : '');
              return <span key={d} style={{ width: cellW, marginRight: GAP, textAlign: 'center', color: d === today ? ink1 : undefined, fontWeight: d === today ? 700 : 400, flexShrink: 0 }}>{label}</span>;
            })}
            <span style={{ width: TOTAL_W, textAlign: 'right', flexShrink: 0 }}>worked / plan</span>
          </div>
          <div className="nowheel" style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: maxRows * (ROW_H + 4), overflowY: rows.length > maxRows ? 'auto' : 'visible', scrollbarWidth: 'thin' }}>
          {shown.map((t) => {
            const color = rowColor(t);
            const tag = rowTag(t);
            const ti = tag ? tagInfo(tag) : undefined;
            return (
              <div role="row" key={t.key} data-testid="time-log-row" style={{ display: 'flex', alignItems: 'center', height: ROW_H }}>
                <span title={t.taskText} style={{ width: NAME_W, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, paddingRight: 8, minWidth: 0 }}>
                  <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: color, flexShrink: 0, opacity: t.done ? 0.5 : 1 }} />
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: t.taskId ? ink1 : 'var(--k-an-ink-2, var(--ink-2))', textDecoration: t.done ? 'line-through' : 'none' }}>
                    {t.taskText || 'untagged'}
                  </span>
                  {ti && (
                    <span title={ti.label} style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', padding: 2, borderRadius: 999, background: `color-mix(in srgb, ${ti.color} 18%, transparent)` }}>
                      <CategoryIcon id={ti.id} color={ti.color} size={10} />
                    </span>
                  )}
                </span>
                {days.map((d) => {
                  const m = t.byDay[d] ?? 0;
                  const strength = m ? Math.round(30 + 70 * Math.min(1, m / maxCell)) : 0;
                  return (
                    <span
                      key={d}
                      title={m ? `${t.taskText || 'untagged'} · ${d} · ${fmt(m)}` : undefined}
                      style={{
                        width: cellW, height: ROW_H - 4, marginRight: GAP, borderRadius: 4, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600,
                        background: m ? `color-mix(in srgb, ${color} ${strength}%, transparent)` : 'var(--k-an-tile, rgba(255,255,255,0.03))',
                        color: strength > 60 ? 'var(--k-an-bg, #111)' : ink1,
                        overflow: 'hidden', whiteSpace: 'nowrap',
                      }}
                    >
                      {m && span === 'week' && cellW >= 30 ? fmt(m) : ''}
                    </span>
                  );
                })}
                <span style={{ width: TOTAL_W, flexShrink: 0, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                  <span style={{ color: ink1, fontWeight: 600 }}>{fmt(t.totalMin)}</span>
                  {t.plannedMin ? <span style={{ color: t.totalMin > t.plannedMin ? 'var(--rust)' : ink3 }}> / {fmt(t.plannedMin)}</span> : null}
                  {t.done && <span style={{ color: 'var(--acid-ink, var(--acid))', marginLeft: 4 }}><LineGlyph name="check" size={10} /></span>}
                </span>
              </div>
            );
          })}
          </div>
          <div role="row" style={{ display: 'flex', alignItems: 'center', height: 18, color: 'var(--k-an-ink-2, var(--ink-2))', fontSize: 11, borderTop: '1px solid var(--k-an-line, var(--paper-3))', paddingTop: 4 }}>
            <span style={{ width: NAME_W, flexShrink: 0 }}>per day</span>
            {days.map((d) => (
              <span key={d} style={{ width: cellW, marginRight: GAP, flexShrink: 0, textAlign: 'center', fontWeight: 600 }}>
                {fold.byDay[d] ? (span === 'week' ? fmt(fold.byDay[d] ?? 0) : '•') : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      {tagEntries.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: ink3 }}>By tag · on the days worked</span>
          <div style={{ display: 'flex', height: 10, borderRadius: 999, overflow: 'hidden', background: 'var(--k-an-tile, rgba(255,255,255,0.03))' }}>
            {tagEntries.map(([id, v]) => (
              <span key={id} title={`${tagInfo(id)?.label ?? 'untagged'} · ${fmt(v.totalMin)}`} style={{ width: `${(v.totalMin / tagTotal) * 100}%`, background: tagInfo(id)?.color ?? 'var(--k-an-ink-3, var(--ink-3))' }} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11 }}>
            {tagEntries.map(([id, v]) => {
              const ti = tagInfo(id);
              return (
                <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  {ti ? <CategoryIcon id={ti.id} color={ti.color} size={11} /> : <span style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--ink-3)' }} />}
                  <span style={{ color: 'var(--k-an-ink-2, var(--ink-2))' }}>{ti?.label ?? 'untagged'}</span>
                  <span style={{ color: ink1, fontWeight: 600 }}>{fmt(v.totalMin)}</span>
                  <span style={{ color: ink3 }}>{Math.round((v.totalMin / tagTotal) * 100)}%</span>
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
