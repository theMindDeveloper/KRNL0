// sys analytics — CLI reads backed by the pure analytics engine (Decision 29 §6).
// Headless-capable: buildAnalytics operates on board-JSON alone.

import { loadBoardFrom } from '../../main/persistence/board';
import type { SysResult } from '../SysFacade';
import { buildAnalytics } from '../../renderer/analytics/engine';
import { registerBuiltinSources } from '../../renderer/analytics/sources';
import { lastNDays, todayLocal } from '../../renderer/analytics/dateRange';
import type { BoardLike } from '../../renderer/analytics/types';

// Register sources once — idempotent guard inside registerBuiltinSources.
registerBuiltinSources();

export interface AnalyticsCtx {
  boardPath: string;
}

function loadBoard(ctx: AnalyticsCtx): BoardLike {
  const raw = loadBoardFrom(ctx.boardPath);
  if (typeof raw !== 'object' || raw === null) return { nodes: [] };
  const b = raw as Record<string, unknown>;
  const nodes = Array.isArray(b['nodes']) ? (b['nodes'] as BoardLike['nodes']) : [];
  return { nodes };
}

export async function analyticsShow(
  ctx: AnalyticsCtx,
  opts: {
    view?: string;
    range?: number;
    metric?: string;
    json?: boolean;
  },
): Promise<SysResult> {
  const board = loadBoard(ctx);
  const engine = buildAnalytics(board);
  const rangeDays = (typeof opts.range === 'number' && opts.range > 0) ? opts.range : 30;
  const today = todayLocal();
  const range = lastNDays(rangeDays, today);

  const totals = engine.totals(range);
  const open = engine.open();
  const byDay = engine.byDay(range);
  const activeHabitDays = byDay.filter((d) => d.habitCount > 0).length;

  if (opts.json) {
    const payload = { range: { days: rangeDays, start: range.start, end: range.end }, totals, open, byDay };
    return { ok: true, message: JSON.stringify(payload), data: payload };
  }

  const lines = [
    `analytics — last ${rangeDays} days (${range.start} → ${range.end})`,
    '',
    `  tasks done    : ${totals.tasksDone}   (${open.tasksOpen} open / ${open.tasksTotal} total)`,
    `  habit check-ins: ${totals.habitCheckins}   (active on ${activeHabitDays} days)`,
    `  focus minutes : ${totals.focusMin}   (${totals.sessions} sessions)`,
    `  today focus   : ${open.focusMinToday} min in ${open.sessionsToday} sessions`,
  ];

  return { ok: true, message: lines.join('\n'), data: { rangeDays, totals, open } };
}

export async function analyticsTotals(
  ctx: AnalyticsCtx,
  opts: { range?: number; json?: boolean },
): Promise<SysResult> {
  const board = loadBoard(ctx);
  const engine = buildAnalytics(board);
  const rangeDays = (typeof opts.range === 'number' && opts.range > 0) ? opts.range : 30;
  const today = todayLocal();
  const range = lastNDays(rangeDays, today);
  const t = engine.totals(range);

  if (opts.json) {
    const payload = { range: { days: rangeDays, start: range.start, end: range.end }, ...t };
    return { ok: true, message: JSON.stringify(payload), data: payload };
  }
  return {
    ok: true,
    message: [
      `totals — last ${rangeDays} days (${range.start} → ${range.end})`,
      `  tasksDone=${t.tasksDone}  habitCheckins=${t.habitCheckins}  focusMin=${t.focusMin}  sessions=${t.sessions}`,
    ].join('\n'),
    data: t,
  };
}

export async function analyticsStreaks(
  ctx: AnalyticsCtx,
  opts: { json?: boolean },
): Promise<SysResult> {
  const board = loadBoard(ctx);
  const engine = buildAnalytics(board);
  const streaks = engine.streaks();

  if (opts.json) {
    return { ok: true, message: JSON.stringify(streaks), data: streaks };
  }

  const lines: string[] = [
    `habit streaks`,
    `  longest: ${streaks.longestHabitStreak} days`,
    '',
  ];
  if (streaks.perHabit.length === 0) {
    lines.push('  (no habits)');
  } else {
    for (const h of streaks.perHabit) {
      lines.push(`  ${h.label.padEnd(20)}  ${h.streak} days`);
    }
  }
  return { ok: true, message: lines.join('\n'), data: streaks };
}
