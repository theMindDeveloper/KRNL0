// Fold the time log into per-day summaries (time-log F6, NF3). Pure.
//
// Rules:
//  - Entries are applied in log order (by `at`). `span.closed` is an upsert by
//    spanId, so a duplicate is harmless and a close after a delete brings the
//    span back (undo). Edits, retags and deletes apply by spanId, last wins.
//  - Only `kind: 'work'` spans count as time spent; breaks are reported apart.
//  - A span's minutes are split at local midnight (the same split every view
//    uses) and booked on the days they cover — also per tag, so time per tag
//    is booked on the days worked, not the completion day, and includes open
//    tasks.
//  - Rows: one per task id; a span with no task but a free-text label (Observe
//    mode, "emails") gets a row keyed by that label; no task and no label is
//    "untagged".

import type { TimeLogEntry } from './entries';
import { sortEntries } from './entries';
import { splitMinutesByLocalDay } from '../../renderer/analytics/dateRange';
import { isValidYMD, localYMD } from '../ymd';

/** byTag key for spans with no tag. */
export const UNTAGGED = 'untagged';

export interface FoldRange {
  fromYMD: string;
  toYMD: string;
}

export interface FoldedSpan {
  spanId: string;
  taskId: string | null;
  taskText: string;
  tag: string | null;
  kind: 'work' | 'break';
  startedAt: string;
  endedAt: string;
  manual: boolean;
  /** Whole minutes of the span (all of it, also the part outside the range). */
  minutes: number;
}

export interface PlanEvent {
  /** When the plan was set or cleared. */
  at: string;
  /** Local start ("YYYY-MM-DDTHH:MM"), null when this event cleared the plan. */
  start: string | null;
  durationMin: number | null;
}

export interface CompletionEvent {
  taskId: string;
  taskText: string;
  tag: string | null;
  plannedMin: number;
  at: string;
}

export interface TaskTimeRow {
  /** `task:<id>`, `label:<text>` or `untagged`. */
  key: string;
  taskId: string | null;
  /** Latest known text (snapshot — survives task deletion). */
  taskText: string;
  tag: string | null;
  /** Work minutes inside the range. */
  totalMin: number;
  /** Work minutes per local day inside the range (days with time only). */
  byDay: Record<string, number>;
  /** The latest plan, null when none or cleared. */
  plan: { start: string; durationMin: number } | null;
  /** Plan length, else the planned minutes recorded at the last completion. */
  plannedMin: number | null;
  /** Every completion of the task (ISO), oldest first — F5 keeps them all. */
  completions: string[];
  /** Completed and not reopened since. */
  done: boolean;
}

export interface TimeLogFold {
  fromYMD: string;
  toYMD: string;
  /** Every local day of the range, in order. */
  days: string[];
  /** Tasks / labels with work, a completion or a plan start inside the range; most time first. */
  tasks: TaskTimeRow[];
  /** Work minutes per day (days with time only). */
  byDay: Record<string, number>;
  /** Break minutes per day. */
  breakByDay: Record<string, number>;
  /** Work minutes per tag, booked on the days worked. */
  byTag: Record<string, { totalMin: number; byDay: Record<string, number> }>;
  totalMin: number;
  /** Plan history per task id (every plan.set / plan.cleared seen), oldest first. */
  plans: Record<string, PlanEvent[]>;
  /** task.completed entries whose `at` falls inside the range, oldest first. */
  completions: CompletionEvent[];
  /** Effective spans (after edits/retags/deletes) that overlap the range, by start. */
  spans: FoldedSpan[];
}

/** Every local YYYY-MM-DD from `from` to `to` inclusive (empty if reversed or invalid). */
export function daysInRange(fromYMD: string, toYMD: string): string[] {
  if (!isValidYMD(fromYMD) || !isValidYMD(toYMD) || fromYMD > toYMD) return [];
  const [y, m, d] = fromYMD.split('-').map(Number) as [number, number, number];
  const out: string[] = [];
  for (let i = 0; ; i++) {
    const ymd = localYMD(new Date(y, m - 1, d + i));
    if (ymd > toYMD) break;
    out.push(ymd);
  }
  return out;
}

interface TaskInfo {
  text: string;
  textAt: number;
  tag: string | null;
  tagAt: number;
}

const rowKey = (taskId: string | null, text: string): string =>
  taskId ? `task:${taskId}` : text.trim() ? `label:${text.trim().toLowerCase()}` : UNTAGGED;

/**
 * Fold `entries` for the local days `fromYMD`..`toYMD`. Pass every entry that
 * may touch the range (see `queryTimeLog`): later corrections included.
 */
export function foldTimeLog(entries: readonly TimeLogEntry[], range: FoldRange): TimeLogFold {
  const { fromYMD, toYMD } = range;
  const days = daysInRange(fromYMD, toYMD);
  const inRange = (ymd: string): boolean => ymd >= fromYMD && ymd <= toYMD;

  const spans = new Map<string, FoldedSpan & { deleted: boolean }>();
  const taskInfo = new Map<string, TaskInfo>();
  const plans: Record<string, PlanEvent[]> = {};
  const completionsByTask = new Map<string, string[]>();
  const lastPlannedMin = new Map<string, number>();
  const doneState = new Map<string, boolean>();
  const completions: CompletionEvent[] = [];

  const noteTask = (taskId: string | null, text: string | undefined, tag: string | null | undefined, atMs: number): void => {
    if (!taskId) return;
    const info = taskInfo.get(taskId) ?? { text: '', textAt: -Infinity, tag: null, tagAt: -Infinity };
    if (text !== undefined && text !== '' && atMs >= info.textAt) { info.text = text; info.textAt = atMs; }
    if (tag !== undefined && tag !== null && atMs >= info.tagAt) { info.tag = tag; info.tagAt = atMs; }
    taskInfo.set(taskId, info);
  };

  for (const e of sortEntries(entries)) {
    const atMs = Date.parse(e.at);
    switch (e.type) {
      case 'span.closed': {
        const startMs = Date.parse(e.startedAt);
        const endMs = Date.parse(e.endedAt);
        spans.set(e.spanId, {
          spanId: e.spanId, taskId: e.taskId, taskText: e.taskText, tag: e.tag, kind: e.kind,
          startedAt: e.startedAt, endedAt: e.endedAt, manual: e.manual === true,
          minutes: Math.max(0, Math.round((endMs - startMs) / 60_000)),
          deleted: false,
        });
        noteTask(e.taskId, e.taskText, e.tag, atMs);
        break;
      }
      case 'span.edited': {
        const s = spans.get(e.spanId);
        if (!s) break;
        s.startedAt = e.startedAt;
        s.endedAt = e.endedAt;
        s.minutes = Math.max(0, Math.round((Date.parse(e.endedAt) - Date.parse(e.startedAt)) / 60_000));
        break;
      }
      case 'span.retagged': {
        const s = spans.get(e.spanId);
        if (!s) break;
        s.taskId = e.taskId;
        s.taskText = e.taskText;
        s.tag = e.tag;
        noteTask(e.taskId, e.taskText, e.tag, atMs);
        break;
      }
      case 'span.deleted': {
        const s = spans.get(e.spanId);
        if (s) s.deleted = true;
        break;
      }
      case 'plan.set':
      case 'plan.cleared': {
        const list = (plans[e.taskId] ??= []);
        const start = e.type === 'plan.set' ? e.start : null;
        const durationMin = e.type === 'plan.set' ? e.durationMin : null;
        const last = list[list.length - 1];
        // A repeat of the current plan (backfill, undo of a delete) is not a move.
        if (!(last && last.start === start && last.durationMin === durationMin) && !(list.length === 0 && start === null)) {
          list.push({ at: e.at, start, durationMin });
        }
        if (e.type === 'plan.set') noteTask(e.taskId, e.taskText, undefined, atMs);
        break;
      }
      case 'task.created':
        noteTask(e.taskId, e.taskText, e.tag, atMs);
        break;
      case 'task.renamed':
        noteTask(e.taskId, e.taskText, undefined, atMs);
        break;
      case 'task.completed': {
        noteTask(e.taskId, e.taskText, e.tag, atMs);
        const list = completionsByTask.get(e.taskId) ?? [];
        list.push(e.at);
        completionsByTask.set(e.taskId, list);
        lastPlannedMin.set(e.taskId, e.plannedMin);
        doneState.set(e.taskId, true);
        if (Number.isFinite(atMs) && inRange(localYMD(new Date(atMs)))) {
          completions.push({ taskId: e.taskId, taskText: e.taskText, tag: e.tag, plannedMin: e.plannedMin, at: e.at });
        }
        break;
      }
      case 'task.reopened':
        doneState.set(e.taskId, false);
        break;
      case 'history.cleared':
        // A wipe: everything recorded before it stops counting.
        for (const s of spans.values()) s.deleted = true;
        completionsByTask.clear();
        completions.length = 0;
        break;
    }
  }

  // ── book work minutes on the days worked ──────────────────────────────────
  const rows = new Map<string, TaskTimeRow>();
  const ensureRow = (taskId: string | null, text: string, tag: string | null): TaskTimeRow => {
    const key = rowKey(taskId, text);
    let row = rows.get(key);
    if (!row) {
      const info = taskId ? taskInfo.get(taskId) : undefined;
      row = {
        key, taskId,
        taskText: info?.text || text.trim(),
        tag: info?.tag ?? tag,
        totalMin: 0, byDay: {}, plan: null, plannedMin: null, completions: [], done: false,
      };
      rows.set(key, row);
    }
    return row;
  };

  const byDay: Record<string, number> = {};
  const breakByDay: Record<string, number> = {};
  const byTag: Record<string, { totalMin: number; byDay: Record<string, number> }> = {};
  let totalMin = 0;
  const effective: FoldedSpan[] = [];

  for (const s of spans.values()) {
    if (s.deleted) continue;
    const startMs = Date.parse(s.startedAt);
    const endMs = Date.parse(s.endedAt);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;
    const parts = startMs < endMs
      ? splitMinutesByLocalDay(startMs, endMs, s.minutes)
      : [{ date: localYMD(new Date(endMs)), min: 0, endMs }];
    if (!parts.some((p) => inRange(p.date))) continue;
    const { deleted: _d, ...span } = s;
    void _d;
    effective.push(span);
    for (const p of parts) {
      if (!inRange(p.date) || p.min <= 0) continue;
      if (s.kind === 'break') {
        breakByDay[p.date] = (breakByDay[p.date] ?? 0) + p.min;
        continue;
      }
      const row = ensureRow(s.taskId, s.taskText, s.tag);
      row.totalMin += p.min;
      row.byDay[p.date] = (row.byDay[p.date] ?? 0) + p.min;
      byDay[p.date] = (byDay[p.date] ?? 0) + p.min;
      totalMin += p.min;
      const tagKey = s.tag ?? (s.taskId ? taskInfo.get(s.taskId)?.tag ?? null : null) ?? UNTAGGED;
      const t = (byTag[tagKey] ??= { totalMin: 0, byDay: {} });
      t.totalMin += p.min;
      t.byDay[p.date] = (t.byDay[p.date] ?? 0) + p.min;
    }
  }

  // Tasks without time in range still show when completed or planned in it.
  for (const c of completions) ensureRow(c.taskId, c.taskText, c.tag);
  for (const [taskId, events] of Object.entries(plans)) {
    const last = events[events.length - 1];
    if (last?.start && inRange(last.start.slice(0, 10))) {
      const info = taskInfo.get(taskId);
      ensureRow(taskId, info?.text ?? '', info?.tag ?? null);
    }
  }

  for (const row of rows.values()) {
    if (!row.taskId) continue;
    const events = plans[row.taskId];
    const last = events?.[events.length - 1];
    row.plan = last && last.start !== null && last.durationMin !== null ? { start: last.start, durationMin: last.durationMin } : null;
    row.plannedMin = row.plan?.durationMin ?? lastPlannedMin.get(row.taskId) ?? null;
    row.completions = completionsByTask.get(row.taskId) ?? [];
    row.done = doneState.get(row.taskId) ?? false;
  }

  effective.sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
  const tasks = [...rows.values()].sort((a, b) => b.totalMin - a.totalMin || a.taskText.localeCompare(b.taskText));

  return { fromYMD, toYMD, days, tasks, byDay, breakByDay, byTag, totalMin, plans, completions, spans: effective };
}
