// `krnl time log` / `krnl time report` — CLI parity for the durable time log
// (Decision 35, time-log F13). Reads <boardDir>/timelog/*.jsonl; runs the
// one-time backfill lazily first (F4) so a fresh install answers from history.

import { dirname } from 'path';
import type { SysResult } from '../SysFacade';
import { loadBoardFrom } from '../../main/persistence/board';
import {
  asBackfillBoard,
  ensureTimeLogBackfilled,
  queryTimeLog,
  readTimeLog,
} from '../../main/persistence/timelog';
import { foldTimeLog, UNTAGGED, type TimeLogEntry, type TimeLogFold } from '../../shared/timelog';
import { isValidYMD, localYMD } from '../../shared/ymd';

export interface TimeCtx {
  boardPath: string;
}

export type TimeReportBy = 'task' | 'tag' | 'day';

function boardDirOf(ctx: TimeCtx): string {
  return dirname(ctx.boardPath);
}

function backfillLazily(ctx: TimeCtx): void {
  try {
    ensureTimeLogBackfilled(boardDirOf(ctx), () => asBackfillBoard(loadBoardFrom(ctx.boardPath)));
  } catch (err) {
    // A read-only report still answers from whatever the log holds.
    console.warn('[timelog] backfill skipped:', err instanceof Error ? err.message : err);
  }
}

/** "1h05", "45m", "0m". */
export function fmtMinutes(min: number): string {
  const m = Math.round(min);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
}

const hm = (iso: string): string => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

function describeEntry(e: TimeLogEntry): string {
  const when = `${localYMD(new Date(e.at))} ${hm(e.at)}`;
  const q = (s: string): string => (s ? `"${s}"` : '(untagged)');
  switch (e.type) {
    case 'span.closed': {
      const min = Math.max(0, Math.round((Date.parse(e.endedAt) - Date.parse(e.startedAt)) / 60_000));
      return `${when}  span.closed     ${e.spanId.slice(0, 8)} ${e.kind === 'break' ? 'break' : 'focus'} ${localYMD(new Date(e.startedAt))} ${hm(e.startedAt)}–${hm(e.endedAt)} (${fmtMinutes(min)}) ${q(e.taskText)}${e.tag ? ` [${e.tag}]` : ''}${e.manual ? ' manual' : ''}`;
    }
    case 'span.edited':    return `${when}  span.edited     ${e.spanId.slice(0, 8)} → ${localYMD(new Date(e.startedAt))} ${hm(e.startedAt)}–${hm(e.endedAt)}`;
    case 'span.retagged':  return `${when}  span.retagged   ${e.spanId.slice(0, 8)} → ${q(e.taskText)}${e.tag ? ` [${e.tag}]` : ''}`;
    case 'span.deleted':   return `${when}  span.deleted    ${e.spanId.slice(0, 8)}`;
    case 'plan.set':       return `${when}  plan.set        ${q(e.taskText)} ${e.start.replace('T', ' ')} (${fmtMinutes(e.durationMin)})`;
    case 'plan.cleared':   return `${when}  plan.cleared    ${e.taskId.slice(0, 13)}`;
    case 'task.created':   return `${when}  task.created    ${q(e.taskText)}${e.tag ? ` [${e.tag}]` : ''}`;
    case 'task.renamed':   return `${when}  task.renamed    ${e.taskId.slice(0, 13)} → ${q(e.taskText)}`;
    case 'task.completed': return `${when}  task.completed  ${q(e.taskText)}${e.tag ? ` [${e.tag}]` : ''} (planned ${fmtMinutes(e.plannedMin)})`;
    case 'task.reopened':  return `${when}  task.reopened   ${e.taskId.slice(0, 13)}`;
    case 'app.opened':     return `${when}  app.opened`;
    case 'app.closed':     return `${when}  app.closed`;
    case 'history.cleared': return `${when}  history.cleared (earlier focus time no longer counts)`;
  }
}

/**
 * `krnl time log --from YYYY-MM-DD --to YYYY-MM-DD [--json]` — the raw entries
 * logged on those local days (by `at`), oldest first.
 */
export function timeLog(ctx: TimeCtx, opts: { from?: string | undefined; to?: string | undefined; json?: boolean }): SysResult {
  const today = localYMD(new Date());
  const from = opts.from ?? opts.to ?? today;
  const to = opts.to ?? opts.from ?? today;
  if (!isValidYMD(from)) return { ok: false, message: `bad --from "${from}" (want YYYY-MM-DD)` };
  if (!isValidYMD(to)) return { ok: false, message: `bad --to "${to}" (want YYYY-MM-DD)` };
  if (from > to) return { ok: false, message: `--from ${from} is after --to ${to}` };
  backfillLazily(ctx);
  const entries = readTimeLog(boardDirOf(ctx), { fromMonth: from.slice(0, 7), toMonth: to.slice(0, 7) })
    .filter((e) => {
      const d = localYMD(new Date(e.at));
      return d >= from && d <= to;
    });
  if (opts.json) return { ok: true, message: JSON.stringify(entries), data: entries };
  if (entries.length === 0) return { ok: true, message: `no time log entries ${from === to ? `on ${from}` : `from ${from} to ${to}`}`, data: entries };
  return { ok: true, message: [`time log — ${from === to ? from : `${from} … ${to}`} (${entries.length})`, ...entries.map(describeEntry)].join('\n'), data: entries };
}

function monthRange(month: string): { from: string; to: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  const last = new Date(y, mo, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

function table(header: string[], rows: string[][]): string {
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)));
  const line = (cells: string[]): string =>
    cells.map((c, i) => (i === 0 ? c.padEnd(widths[i] ?? 0) : c.padStart(widths[i] ?? 0))).join('  ').trimEnd();
  return [line(header), ...rows.map(line)].join('\n');
}

const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function reportText(fold: TimeLogFold, month: string, by: TimeReportBy): string {
  const head = `time report — ${month} · ${fmtMinutes(fold.totalMin)} worked`;
  // Only the days with time keep the table compact.
  const activeDays = fold.days.filter((d) => (fold.byDay[d] ?? 0) > 0);
  const dayCols = activeDays.map((d) => d.slice(8));
  const cell = (byDay: Record<string, number>, d: string): string => {
    const v = byDay[d] ?? 0;
    return v > 0 ? String(v) : '·';
  };
  if (by === 'day') {
    if (activeDays.length === 0) return `${head}\nno recorded work`;
    const rows = activeDays.map((d) => {
      const top = fold.tasks
        .filter((t) => (t.byDay[d] ?? 0) > 0)
        .sort((a, b) => (b.byDay[d] ?? 0) - (a.byDay[d] ?? 0))
        .slice(0, 3)
        .map((t) => `${clip(t.taskText || 'untagged', 18)} ${fmtMinutes(t.byDay[d] ?? 0)}`)
        .join(', ');
      return [d, fmtMinutes(fold.byDay[d] ?? 0), top];
    });
    return `${head}\n${table(['day', 'total', 'top'], rows).replace(/ +$/gm, '')}`;
  }
  if (by === 'tag') {
    const tags = Object.entries(fold.byTag).sort((a, b) => b[1].totalMin - a[1].totalMin);
    if (tags.length === 0) return `${head}\nno recorded work`;
    const rows = tags.map(([tag, t]) => [clip(tag, 24), fmtMinutes(t.totalMin), ...activeDays.map((d) => cell(t.byDay, d))]);
    return `${head} (minutes per day)\n${table(['tag', 'total', ...dayCols], rows)}`;
  }
  if (fold.tasks.length === 0) return `${head}\nno recorded work`;
  const rows = fold.tasks.map((t) => [
    `${clip(t.taskText || UNTAGGED, 28)}${t.done ? ' ✓' : ''}`,
    fmtMinutes(t.totalMin),
    t.plannedMin !== null ? fmtMinutes(t.plannedMin) : '·',
    ...activeDays.map((d) => cell(t.byDay, d)),
  ]);
  return `${head} (minutes per day)\n${table(['task', 'total', 'plan', ...dayCols], rows)}`;
}

/**
 * `krnl time report --month YYYY-MM [--by task|tag|day] [--json]` — the month
 * folded from the log: time per task (plan vs actual), per tag (booked on the
 * days worked) or per day.
 */
export function timeReport(ctx: TimeCtx, opts: { month?: string | undefined; by?: string | undefined; json?: boolean }): SysResult {
  const month = opts.month ?? localYMD(new Date()).slice(0, 7);
  const range = monthRange(month);
  if (!range) return { ok: false, message: `bad --month "${month}" (want YYYY-MM)` };
  const by = opts.by ?? 'task';
  if (by !== 'task' && by !== 'tag' && by !== 'day') return { ok: false, message: `bad --by "${by}" (want task, tag or day)` };
  backfillLazily(ctx);
  const fold = foldTimeLog(queryTimeLog(boardDirOf(ctx), range.from, range.to), { fromYMD: range.from, toYMD: range.to });
  if (opts.json) {
    const data = by === 'task'
      ? { month, by, totalMin: fold.totalMin, rows: fold.tasks.map((t) => ({ taskId: t.taskId, taskText: t.taskText, tag: t.tag, totalMin: t.totalMin, plannedMin: t.plannedMin, byDay: t.byDay, completions: t.completions, done: t.done })) }
      : by === 'tag'
        ? { month, by, totalMin: fold.totalMin, rows: Object.entries(fold.byTag).map(([tag, t]) => ({ tag, totalMin: t.totalMin, byDay: t.byDay })) }
        : { month, by, totalMin: fold.totalMin, rows: fold.days.map((d) => ({ day: d, workMin: fold.byDay[d] ?? 0, breakMin: fold.breakByDay[d] ?? 0 })) };
    return { ok: true, message: JSON.stringify(data), data };
  }
  return { ok: true, message: reportText(fold, month, by), data: fold };
}
