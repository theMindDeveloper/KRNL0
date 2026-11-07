// #207 / time-log F12 — a task's story in one glance, from the time log:
//   "Mon 3 · 2h  ·  Tue 4 · 1h  ·  planned Wed 10:00 (moved 1×)  ·  done Wed 5"
// Survives the task node (the log keeps its text), shows postponed plans
// (every plan.set is kept) and every completion.

import { useEffect, useState } from 'react';
import { foldTimeLog, type TimeLogFold } from '../../../shared/timelog';
import { queryTimeLog } from '../../store/timeLog';

const pad = (n: number): string => String(n).padStart(2, '0');
const ymd = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayLabel = (s: string): string => {
  const d = new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
};
const fmt = (m: number): string => {
  const r = Math.round(m);
  if (r < 60) return `${r}m`;
  return r % 60 ? `${Math.floor(r / 60)}h${pad(r % 60)}` : `${Math.floor(r / 60)}h`;
};

export interface TimelineItem { key: string; text: string; tone: 'work' | 'plan' | 'done' }

/** Pure: the timeline pieces for one task, oldest first. */
export function taskTimeline(fold: TimeLogFold, taskId: string): TimelineItem[] {
  const out: Array<TimelineItem & { at: string }> = [];
  const row = fold.tasks.find((t) => t.taskId === taskId);
  for (const [day, min] of Object.entries(row?.byDay ?? {})) {
    if (min > 0) out.push({ key: `w-${day}`, text: `${dayLabel(day)} · ${fmt(min)}`, tone: 'work', at: `${day}T00:00` });
  }
  const plans = (fold.plans[taskId] ?? []).filter((p) => p.start !== null);
  if (plans.length > 0) {
    const last = plans[plans.length - 1]!;
    const s = last.start!;
    const moved = plans.length - 1;
    out.push({
      key: 'plan',
      text: `planned ${dayLabel(s.slice(0, 10))} ${s.slice(11, 16)}${moved > 0 ? ` (moved ${moved}×)` : ''}`,
      tone: 'plan',
      at: s,
    });
  }
  for (const c of fold.completions.filter((x) => x.taskId === taskId)) {
    out.push({ key: `d-${c.at}`, text: `done ${dayLabel(ymd(new Date(c.at)))}`, tone: 'done', at: c.at });
  }
  return out.sort((a, b) => a.at.localeCompare(b.at)).map(({ at: _at, ...rest }) => rest);
}

/** Last ~3 months of a task's history, shown in the task details popup. */
export function TaskTimeline({ taskId }: { taskId: string }): JSX.Element | null {
  const [items, setItems] = useState<TimelineItem[] | null>(null);
  useEffect(() => {
    let alive = true;
    const to = new Date();
    const from = new Date(to.getFullYear(), to.getMonth(), to.getDate() - 90);
    void queryTimeLog(ymd(from), ymd(to)).then((entries) => {
      if (!alive) return;
      setItems(taskTimeline(foldTimeLog(entries, { fromYMD: ymd(from), toYMD: ymd(to) }), taskId));
    });
    return () => { alive = false; };
  }, [taskId]);
  if (!items || items.length === 0) return null;
  const color = { work: 'var(--ink-2)', plan: 'var(--ink-3)', done: 'var(--acid-ink, var(--acid))' } as const;
  return (
    <div data-testid="task-timeline" style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 0', fontSize: 11, marginBottom: 10, lineHeight: 1.5 }}>
      {items.slice(-8).map((it, i) => (
        <span key={it.key} style={{ color: color[it.tone], whiteSpace: 'nowrap' }}>
          {i > 0 && <span style={{ color: 'var(--ink-4)', margin: '0 5px' }}>·</span>}
          {it.text}
        </span>
      ))}
    </div>
  );
}
