// sys analytics — CLI reads backed by the pure analytics engine (Decision 29 §6).
// Headless-capable: buildAnalytics operates on board-JSON alone.

import { loadBoardFrom, saveBoardTo } from '../../main/persistence/board';
import type { SysResult } from '../SysFacade';
import { buildAnalytics } from '../../renderer/analytics/engine';
import { registerBuiltinSources } from '../../renderer/analytics/sources';
import { lastNDays, todayLocal } from '../../renderer/analytics/dateRange';
import type { BoardLike } from '../../renderer/analytics/types';
import { computeEstimates, describeAccuracy } from '../../renderer/analytics/estimates';
import { summarizeAnalytics } from '../../renderer/analytics/summary';
import { addDays } from '../../renderer/analytics/dateRange';
import type { Board } from '../../shared/types';

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
  const rangeDays = (typeof opts.range === 'number' && opts.range > 0) ? opts.range : 30;
  const today = todayLocal();
  const range = lastNDays(rangeDays, today);
  if (opts.view === 'estimates') return analyticsEstimates(ctx, rangeDays, range, opts.json === true);

  const board = loadBoard(ctx);
  const engine = buildAnalytics(board);
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

/** Plan vs actual — estimate vs tracked per task, planned vs worked per day. */
function analyticsEstimates(
  ctx: AnalyticsCtx,
  rangeDays: number,
  range: { start: string; end: string },
  json: boolean,
): SysResult {
  const raw = loadBoardFrom(ctx.boardPath) as Record<string, unknown> | null;
  const board = {
    nodes: Array.isArray(raw?.['nodes']) ? raw!['nodes'] : [],
    edges: Array.isArray(raw?.['edges']) ? raw!['edges'] : [],
    completions: Array.isArray(raw?.['completions']) ? raw!['completions'] : [],
  } as unknown as Board;
  const est = computeEstimates(board, range, Date.now());
  if (json) {
    const payload = { range: { days: rangeDays, ...range }, ...est };
    return { ok: true, message: JSON.stringify(payload), data: payload };
  }
  const m = (n: number) => (n >= 60 ? `${Math.floor(n / 60)}h${String(Math.round(n % 60)).padStart(2, '0')}` : `${Math.round(n)}m`);
  const k = est.kpis;
  const lines = [
    `plan vs actual — last ${rangeDays} days (${range.start} → ${range.end})`,
    '',
    `  accuracy      : ${k.medianRatio === null ? '—' : `×${k.medianRatio.toFixed(2)}`} — ${describeAccuracy(k.medianRatio)}`,
    `  planned/tracked: ${m(k.plannedMin)} / ${m(k.trackedMin)}  (${k.overCount} over, ${k.underCount} within plan)`,
    `  tagged focus  : ${k.taggedShare === null ? '—' : `${Math.round(k.taggedShare * 100)}%`} of pomo work linked to a task`,
    `  time went to  : work on tasks ${m(est.mix.taggedWorkMin)} · untagged ${m(est.mix.untaggedWorkMin)} · breaks ${m(est.mix.breakMin)}`,
    '',
    ...est.tasks.slice(0, 15).map((t) =>
      `  ${t.done ? '✓' : ' '} ${t.text.slice(0, 28).padEnd(28)} plan ${m(t.plannedMin).padStart(5)}  tracked ${m(t.trackedMin).padStart(5)}${t.trackedMin > t.plannedMin ? '  OVER' : ''}${t.deleted ? '  (deleted)' : ''}`,
    ),
  ];
  return { ok: true, message: lines.join('\n'), data: est };
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

/**
 * `analytics summary [--range N] [--json]` — the plain-language summary shown
 * on top of the Overview tab (analytics/summary.ts).
 */
export async function analyticsSummary(ctx: AnalyticsCtx, opts: { range?: number; json?: boolean }): Promise<SysResult> {
  const rangeDays = (typeof opts.range === 'number' && opts.range > 0) ? opts.range : 30;
  const range = lastNDays(rangeDays, todayLocal());
  const prevRange = { start: addDays(range.start, -rangeDays), end: addDays(range.start, -1) };
  const summary = summarizeAnalytics(buildAnalytics(loadBoard(ctx)), range, prevRange, rangeDays);
  if (opts.json) return { ok: true, message: JSON.stringify(summary), data: summary };
  const stats = summary.stats.map((s) => `${s.label}: ${s.value}${s.deltaPct === null ? '' : ` (${s.deltaPct >= 0 ? '+' : ''}${s.deltaPct}%)`}`);
  return { ok: true, message: [summary.headline, '', ...summary.sentences.map((t) => `  • ${t}`), '', `  ${stats.join(' · ')}`].join('\n'), data: summary };
}

// ── Decision 32 — analytics window visibility ──────────────────────────────────
// Analytics is a fixed mother ('mother-analytics'). In Station mode it has its
// own panel beside the terminal; visibility is config.stationHidden, default
// shown. Canvas mode always shows it in the mother row.

export interface AnalyticsWindowCtx extends AnalyticsCtx {
  onBoardChanged?: () => void;
}

export function analyticsWindow(
  ctx: AnalyticsWindowCtx,
  action: 'open' | 'close' | 'toggle',
): SysResult {
  const raw = loadBoardFrom(ctx.boardPath);
  if (typeof raw !== 'object' || raw === null) return { ok: false, message: 'No board found' };
  const board = raw as Record<string, unknown> & { nodes?: unknown[] };
  const nodes = Array.isArray(board.nodes) ? (board.nodes as Array<Record<string, unknown>>) : [];
  const mother = nodes.find((n) => n['kind'] === 'analytics' && n['isMother'] === true);
  if (!mother) return { ok: false, message: 'No analytics window on the board' };
  const cfg = (mother['config'] ?? {}) as Record<string, unknown>;
  // Same default as the renderer: no flag means shown.
  const shown = cfg['stationHidden'] !== true;
  const next = action === 'toggle' ? !shown : action === 'open';
  mother['config'] = { ...cfg, stationHidden: !next };
  saveBoardTo(ctx.boardPath, { ...board, savedAt: new Date().toISOString() });
  ctx.onBoardChanged?.();
  const where = board['layoutMode'] === 'station'
    ? (next ? ' (panel shown beside the terminal)' : ' (panel hidden)')
    : ' (canvas mode always shows it in the mother row; this applies in station mode)';
  return { ok: true, message: `analytics ${next ? 'opened' : 'closed'}${where}`, data: { shown: next } };
}
