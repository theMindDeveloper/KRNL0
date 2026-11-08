// sys habit CLI — wired to board.json via the shared persistence module
// (Decision #14). Operates on the mother habit node identified by
// `kind === 'habit' && isMother === true`. Habits are resolved by id (exact)
// or case-insensitive name match.

import { randomUUID } from 'crypto';
import { loadBoardFrom, saveBoardTo } from '../../main/persistence/board';
import type { SysResult } from '../SysFacade';
import type { CliDispatchFn } from '../SysFacade';
import {
  habitAdd,
  habitToggleDay,
  habitRemove,
  habitSetColor,
  habitSetView,
  habitRename,
  habitSetIcon,
  habitSetNote,
  habitArchive,
  habitUnarchive,
  habitSetSchedule,
  habitSetKind,
  routineSkip,
  routineUnskip,
  routineMove,
  routineEnd,
  routineRestart,
  calcStreak,
} from '../../renderer/components/nodes/HabitNode/commands';
import type {
  Habit,
  HabitColor,
  HabitConfig,
  HabitSchedule,
  HabitState,
  HabitView,
  IsoDow,
} from '../../renderer/components/nodes/HabitNode/types';
import {
  HABIT_COLORS,
  HABIT_VIEWS,
  isHabitColor,
  isHabitView,
  isValidTimeOfDay,
  routineOccurrence,
  todayLocal,
} from '../../renderer/components/nodes/HabitNode/types';
import { isValidYMD } from '../../shared/ymd';

export interface HabitCtx {
  boardPath: string;
  onBoardChanged?: () => void;
  /** Phase 2: renderer-coupled dispatch for renderer-required commands. */
  cliDispatch?: CliDispatchFn;
}

interface MotherHabitNode {
  id: string;
  kind: 'habit';
  isMother: true;
  state: HabitState;
  config: HabitConfig;
  [k: string]: unknown;
}

interface BoardShape {
  nodes: unknown[];
  [k: string]: unknown;
}

function loadBoard(ctx: HabitCtx): BoardShape {
  const raw = loadBoardFrom(ctx.boardPath);
  if (typeof raw !== 'object' || raw === null) {
    return { nodes: [], edges: [] };
  }
  const board = raw as Record<string, unknown>;
  if (!Array.isArray(board['nodes'])) board['nodes'] = [];
  return board as BoardShape;
}

function findMother(board: BoardShape): MotherHabitNode | null {
  for (const n of board.nodes) {
    if (typeof n !== 'object' || n === null) continue;
    const node = n as { kind?: unknown; isMother?: unknown };
    if (node.kind === 'habit' && node.isMother === true) {
      return n as MotherHabitNode;
    }
  }
  return null;
}

function writeBoard(ctx: HabitCtx, board: BoardShape, mother: MotherHabitNode): void {
  board.nodes = board.nodes.map((n) => {
    if (typeof n !== 'object' || n === null) return n;
    if ((n as { id?: unknown }).id === mother.id) return mother;
    return n;
  });
  saveBoardTo(ctx.boardPath, { ...board, savedAt: new Date().toISOString() });
  ctx.onBoardChanged?.();
}

/** Drop the canvas lanes pinned for a habit (and their edges), as the UI does. */
function removeLanesFor(board: BoardShape, habitId: string): number {
  const laneIds = new Set(
    board.nodes
      .filter((n) => typeof n === 'object' && n !== null
        && (n as { kind?: unknown }).kind === 'habit.lane'
        && ((n as { state?: { habitId?: unknown } }).state?.habitId === habitId))
      .map((n) => (n as { id: string }).id),
  );
  if (laneIds.size === 0) return 0;
  board.nodes = board.nodes.filter((n) => !laneIds.has((n as { id?: string }).id ?? ''));
  const edges = (board as { edges?: unknown[] }).edges;
  if (Array.isArray(edges)) {
    (board as { edges?: unknown[] }).edges = edges.filter((e) => {
      const ed = e as { from?: { nodeId?: string }; to?: { nodeId?: string } };
      return !laneIds.has(ed.from?.nodeId ?? '') && !laneIds.has(ed.to?.nodeId ?? '');
    });
  }
  return laneIds.size;
}

// Resolve idOrName → habit. Order: exact id → ≥4-char id prefix → exact name
// (case-insensitive). Mirrors the global resolveRef rule for consistency.
function resolveHabit(
  state: HabitState,
  idOrName: string,
): { habit: Habit } | { error: string } {
  const exact = state.habits.find((h) => h.id === idOrName);
  if (exact) return { habit: exact };

  if (idOrName.length >= 4) {
    const byPrefix = state.habits.filter((h) => h.id.startsWith(idOrName));
    if (byPrefix.length === 1) return { habit: byPrefix[0]! };
    if (byPrefix.length > 1) {
      return {
        error: `Ambiguous habit prefix "${idOrName}" — matches: ${byPrefix.map((h) => h.id).slice(0, 5).join(', ')}`,
      };
    }
  }

  const lower = idOrName.toLowerCase();
  const matches = state.habits.filter((h) => h.name.toLowerCase() === lower);
  if (matches.length === 1) return { habit: matches[0]! };
  if (matches.length > 1) {
    return {
      error: `Ambiguous habit "${idOrName}" — ${matches.length} habits share that name. Use an id or an id-prefix.`,
    };
  }
  return { error: `No habit matching "${idOrName}".` };
}

function notFound(): SysResult {
  return { ok: false, message: 'No habit mother node found in board.' };
}

// ── Commands ────────────────────────────────────────────────────────────

export async function cliAdd(ctx: HabitCtx, name: string | undefined): Promise<SysResult> {
  if (!name) return { ok: false, message: 'habit add requires a <name>' };
  const board = loadBoard(ctx);
  const mother = findMother(board);
  if (!mother) return notFound();
  const next = habitAdd(mother.state, { name }, {
    uuid: () => randomUUID(),
    now: () => new Date().toISOString(),
    today: todayLocal,
  });
  if (next.habits.length === mother.state.habits.length) {
    return { ok: false, message: 'habit add: empty name' };
  }
  mother.state = next;
  writeBoard(ctx, board, mother);
  const added = next.habits[next.habits.length - 1]!;
  return {
    ok: true,
    message: `habit added: ${added.name} (${added.id})`,
    data: { id: added.id, name: added.name, color: added.color },
  };
}


/**
 * `habit done` / `habit undo` — set (not toggle) a day's mark, so retrying a
 * command never flips it back. Both are no-ops when the day is already in the
 * requested state.
 */
async function setHabitDay(
  ctx: HabitCtx,
  idOrName: string | undefined,
  date: string | undefined,
  done: boolean,
): Promise<SysResult> {
  const verb = done ? 'habit done' : 'habit undo';
  if (!idOrName) return { ok: false, message: `${verb} requires <id|name>` };
  const targetDate = date ?? todayLocal();
  if (!isValidYMD(targetDate)) {
    return { ok: false, message: `${verb}: --date must be YYYY-MM-DD, got "${targetDate}"` };
  }
  if (targetDate > todayLocal()) {
    return { ok: false, message: `${verb}: ${targetDate} is in the future` };
  }
  const board = loadBoard(ctx);
  const mother = findMother(board);
  if (!mother) return notFound();
  const resolved = resolveHabit(mother.state, idOrName);
  if ('error' in resolved) return { ok: false, message: resolved.error };
  const data = { id: resolved.habit.id, date: targetDate, done };
  if (resolved.habit.log.includes(targetDate) === done) {
    return {
      ok: true,
      message: `${verb}: "${resolved.habit.name}" already ${done ? 'marked' : 'unmarked'} ${targetDate}`,
      data,
    };
  }
  mother.state = habitToggleDay(mother.state, { id: resolved.habit.id, date: targetDate }, {
    uuid: () => randomUUID(),
    now: () => new Date().toISOString(),
    today: todayLocal,
  });
  writeBoard(ctx, board, mother);
  return {
    ok: true,
    message: `${verb}: "${resolved.habit.name}" ${done ? 'marked' : 'unmarked'} ${targetDate}`,
    data,
  };
}

export function cliDone(ctx: HabitCtx, idOrName: string | undefined, date: string | undefined): Promise<SysResult> {
  return setHabitDay(ctx, idOrName, date, true);
}

export function cliUndo(ctx: HabitCtx, idOrName: string | undefined, date: string | undefined): Promise<SysResult> {
  return setHabitDay(ctx, idOrName, date, false);
}

export async function cliStreak(
  ctx: HabitCtx,
  idOrName: string | undefined,
): Promise<SysResult> {
  if (!idOrName) return { ok: false, message: 'habit streak requires <id|name>' };
  const board = loadBoard(ctx);
  const mother = findMother(board);
  if (!mother) return notFound();
  const resolved = resolveHabit(mother.state, idOrName);
  if ('error' in resolved) return { ok: false, message: resolved.error };
  const n = calcStreak(resolved.habit.log, todayLocal(), resolved.habit.schedule ?? undefined);
  return {
    ok: true,
    message: `streak for "${resolved.habit.name}": ${n} day${n === 1 ? '' : 's'}`,
    data: { id: resolved.habit.id, streak: n },
  };
}

export async function cliColor(
  ctx: HabitCtx,
  idOrName: string | undefined,
  color: string | undefined,
): Promise<SysResult> {
  if (!idOrName || !color) {
    return {
      ok: false,
      message: `habit color requires <id|name> <color>. Colors: ${HABIT_COLORS.join(', ')}`,
    };
  }
  if (!isHabitColor(color)) {
    return {
      ok: false,
      message: `Unknown color "${color}". Allowed: ${HABIT_COLORS.join(', ')}`,
    };
  }
  const board = loadBoard(ctx);
  const mother = findMother(board);
  if (!mother) return notFound();
  const resolved = resolveHabit(mother.state, idOrName);
  if ('error' in resolved) return { ok: false, message: resolved.error };
  mother.state = habitSetColor(mother.state, { id: resolved.habit.id, color: color as HabitColor });
  writeBoard(ctx, board, mother);
  return {
    ok: true,
    message: `habit color: "${resolved.habit.name}" → ${color}`,
    data: { id: resolved.habit.id, color },
  };
}

export async function cliRemove(
  ctx: HabitCtx,
  idOrName: string | undefined,
): Promise<SysResult> {
  if (!idOrName) return { ok: false, message: 'habit remove requires <id|name>' };
  const board = loadBoard(ctx);
  const mother = findMother(board);
  if (!mother) return notFound();
  const resolved = resolveHabit(mother.state, idOrName);
  if ('error' in resolved) return { ok: false, message: resolved.error };
  mother.state = habitRemove(mother.state, { id: resolved.habit.id });
  // Its lanes go with it (left behind they were orphans that only the open
  // window cleaned up, in memory).
  const lanes = removeLanesFor(board, resolved.habit.id);
  writeBoard(ctx, board, mother);
  return {
    ok: true,
    message: `habit removed: "${resolved.habit.name}"${lanes ? ` (and ${lanes} lane${lanes === 1 ? '' : 's'})` : ''}`,
    data: { id: resolved.habit.id },
  };
}

export async function cliView(
  ctx: HabitCtx,
  view: string | undefined,
): Promise<SysResult> {
  if (!view) {
    return {
      ok: false,
      message: `habit view requires a value. Views: ${HABIT_VIEWS.join(', ')}`,
    };
  }
  if (!isHabitView(view)) {
    return {
      ok: false,
      message: `Unknown view "${view}". Allowed: ${HABIT_VIEWS.join(', ')}`,
    };
  }
  const board = loadBoard(ctx);
  const mother = findMother(board);
  if (!mother) return notFound();
  mother.config = habitSetView(mother.config, { view: view as HabitView });
  writeBoard(ctx, board, mother);
  return {
    ok: true,
    message: `habit view → ${view}`,
    data: { view },
  };
}

export async function cliList(ctx: HabitCtx, json = false): Promise<SysResult> {
  const board = loadBoard(ctx);
  const mother = findMother(board);
  if (!mother) {
    if (json) return { ok: true, message: '[]', data: [] };
    return notFound();
  }
  const today = todayLocal();
  const rows = mother.state.habits.map((h) => ({
    id: h.id,
    name: h.name,
    color: h.color,
    archived: h.archived,
    streak: calcStreak(h.log, today, h.schedule ?? undefined),
    logCount: h.log.length,
  }));
  if (json) {
    return { ok: true, message: JSON.stringify(rows), data: rows };
  }
  const lines = rows.length === 0
    ? '(no habits)'
    : rows
        .map((r) => `  ${r.archived ? '[archived] ' : ''}${r.name}  ·  ${r.color}  ·  ▲${r.streak}d  ·  ${r.logCount} logged  ·  ${r.id}`)
        .join('\n');
  return {
    ok: true,
    message: `habits (view: ${mother.config.view ?? 'week'}):\n${lines}`,
    data: { view: mother.config.view ?? 'week', habits: rows },
  };
}

// ── Decision 29 — new habit lifecycle commands ───────────────────────────────

export async function cliRename(
  ctx: HabitCtx,
  ref: string | undefined,
  newName: string | undefined,
): Promise<SysResult> {
  if (!ref) return { ok: false, message: 'habit rename requires <id|name>' };
  if (!newName || !newName.trim()) return { ok: false, message: 'habit rename requires "<new>"' };
  const board = loadBoard(ctx);
  const mother = findMother(board);
  if (!mother) return notFound();
  const resolved = resolveHabit(mother.state, ref);
  if ('error' in resolved) return { ok: false, message: resolved.error };
  mother.state = habitRename(mother.state, { id: resolved.habit.id, name: newName });
  writeBoard(ctx, board, mother);
  return {
    ok: true,
    message: `habit renamed: "${resolved.habit.name}" → "${newName.trim()}"`,
    data: { id: resolved.habit.id, name: newName.trim() },
  };
}

export async function cliIcon(
  ctx: HabitCtx,
  ref: string | undefined,
  icon: string | undefined,
  clear: boolean,
): Promise<SysResult> {
  if (!ref) return { ok: false, message: 'habit icon requires <id|name>' };
  const board = loadBoard(ctx);
  const mother = findMother(board);
  if (!mother) return notFound();
  const resolved = resolveHabit(mother.state, ref);
  if ('error' in resolved) return { ok: false, message: resolved.error };
  const iconValue = clear ? '' : (icon ?? '');
  mother.state = habitSetIcon(mother.state, { id: resolved.habit.id, icon: iconValue });
  writeBoard(ctx, board, mother);
  const action = clear || !iconValue.trim() ? 'cleared' : `set to "${iconValue.trim()}"`;
  return {
    ok: true,
    message: `habit icon for "${resolved.habit.name}" ${action}`,
    data: { id: resolved.habit.id },
  };
}

export async function cliNote(
  ctx: HabitCtx,
  ref: string | undefined,
  text: string | undefined,
  clear: boolean,
): Promise<SysResult> {
  if (!ref) return { ok: false, message: 'habit note requires <id|name>' };
  if (!clear && text === undefined) {
    return { ok: false, message: 'habit note requires "<text>" or --clear' };
  }
  const board = loadBoard(ctx);
  const mother = findMother(board);
  if (!mother) return notFound();
  const resolved = resolveHabit(mother.state, ref);
  if ('error' in resolved) return { ok: false, message: resolved.error };
  const noteValue = clear ? '' : (text ?? '');
  mother.state = habitSetNote(mother.state, { id: resolved.habit.id, note: noteValue });
  writeBoard(ctx, board, mother);
  const trimmed = noteValue.trim();
  const action = trimmed ? `set to "${trimmed}"` : 'cleared';
  return {
    ok: true,
    message: `habit note for "${resolved.habit.name}" ${action}`,
    data: { id: resolved.habit.id },
  };
}

export async function cliSchedule(
  ctx: HabitCtx,
  ref: string | undefined,
  scheduleKind: 'daily' | 'weekly' | 'weekdays',
  days: number[] | undefined,
  at: string | undefined,
  durationMin: number | undefined,
  invalidDays: string | undefined,
): Promise<SysResult> {
  if (!ref) return { ok: false, message: 'habit schedule requires <id|name>' };

  // Check for CSV parse error flagged by the parser
  if (invalidDays !== undefined) {
    return {
      ok: false,
      message: [
        `habit schedule --weekly: invalid --days value "${invalidDays}".`,
        'Usage: habit schedule <ref> --weekly --days <csv> --at HH:MM [--duration N]',
        '--days must be a comma-separated list of ISO 1–7 integers (1=Mon … 7=Sun).',
        'String day names are not accepted. Each token must match /^[1-7]$/.',
      ].join('\n'),
      data: { exitCode: 1 },
    };
  }

  if (at !== undefined && !isValidTimeOfDay(at)) {
    return {
      ok: false,
      message: `habit schedule: invalid --at value "${at}". Expected HH:MM (24-hour, e.g. 09:30).`,
      data: { exitCode: 1 },
    };
  }

  if (scheduleKind === 'weekly') {
    if (!days || days.length === 0) {
      return {
        ok: false,
        message: 'habit schedule --weekly requires --days <csv>. Each token must match /^[1-7]$/.',
      };
    }
  }

  const board = loadBoard(ctx);
  const mother = findMother(board);
  if (!mother) return notFound();
  const resolved = resolveHabit(mother.state, ref);
  if ('error' in resolved) return { ok: false, message: resolved.error };
  // Decision 39 — no --at = "any time" for a habit; a routine always has a time.
  if (at === undefined && resolved.habit.kind === 'routine') {
    return { ok: false, message: `"${resolved.habit.name}" is a routine: it needs --at HH:MM` };
  }
  const tod = at !== undefined ? { timeOfDay: at } : {};
  const dur = at !== undefined && durationMin !== undefined ? { durationMin } : {};

  let schedule: HabitSchedule;
  if (scheduleKind === 'daily') {
    schedule = { kind: 'daily', ...tod, ...dur };
  } else if (scheduleKind === 'weekdays') {
    schedule = { kind: 'weekdays', ...tod, ...dur };
  } else {
    // weekly — days is validated above
    schedule = { kind: 'weekly', ...tod, days: (days as IsoDow[]), ...dur };
  }

  mother.state = habitSetSchedule(mother.state, { habitId: resolved.habit.id, schedule });
  writeBoard(ctx, board, mother);
  return {
    ok: true,
    message: `habit "${resolved.habit.name}" scheduled: ${JSON.stringify(schedule)}`,
    data: { id: resolved.habit.id, schedule },
  };
}

export async function cliUnschedule(
  ctx: HabitCtx,
  ref: string | undefined,
): Promise<SysResult> {
  if (!ref) return { ok: false, message: 'habit unschedule requires <id|name>' };
  const board = loadBoard(ctx);
  const mother = findMother(board);
  if (!mother) return notFound();
  const resolved = resolveHabit(mother.state, ref);
  if ('error' in resolved) return { ok: false, message: resolved.error };
  mother.state = habitSetSchedule(mother.state, { habitId: resolved.habit.id, schedule: null });
  writeBoard(ctx, board, mother);
  return {
    ok: true,
    message: `habit "${resolved.habit.name}" unscheduled`,
    data: { id: resolved.habit.id },
  };
}

export async function cliArchive(
  ctx: HabitCtx,
  ref: string | undefined,
): Promise<SysResult> {
  if (!ref) return { ok: false, message: 'habit archive requires <id|name>' };
  const board = loadBoard(ctx);
  const mother = findMother(board);
  if (!mother) return notFound();
  const resolved = resolveHabit(mother.state, ref);
  if ('error' in resolved) return { ok: false, message: resolved.error };
  if (resolved.habit.archived) {
    return { ok: true, message: `habit "${resolved.habit.name}" is already archived`, data: { id: resolved.habit.id } };
  }
  mother.state = habitArchive(mother.state, { id: resolved.habit.id });
  // An archived habit isn't tracked: no lane to tick on the canvas.
  const lanes = removeLanesFor(board, resolved.habit.id);
  writeBoard(ctx, board, mother);
  return {
    ok: true,
    message: `habit archived: "${resolved.habit.name}"${lanes ? ` (lane removed)` : ''}`,
    data: { id: resolved.habit.id },
  };
}

/** `krnl habit unarchive <id|name>`: bring an archived habit back, history kept. */
export async function cliUnarchive(
  ctx: HabitCtx,
  ref: string | undefined,
): Promise<SysResult> {
  if (!ref) return { ok: false, message: 'habit unarchive requires <id|name>' };
  const board = loadBoard(ctx);
  const mother = findMother(board);
  if (!mother) return notFound();
  const resolved = resolveHabit(mother.state, ref);
  if ('error' in resolved) return { ok: false, message: resolved.error };
  if (!resolved.habit.archived) {
    return { ok: true, message: `habit "${resolved.habit.name}" is not archived`, data: { id: resolved.habit.id } };
  }
  mother.state = habitUnarchive(mother.state, { id: resolved.habit.id });
  writeBoard(ctx, board, mother);
  return { ok: true, message: `habit restored: "${resolved.habit.name}"`, data: { id: resolved.habit.id } };
}

export async function cliShow(
  ctx: HabitCtx,
  ref: string | undefined,
  json = false,
): Promise<SysResult> {
  if (!ref) return { ok: false, message: 'habit show requires <id|name>' };
  const board = loadBoard(ctx);
  const mother = findMother(board);
  if (!mother) return notFound();
  const resolved = resolveHabit(mother.state, ref);
  if ('error' in resolved) return { ok: false, message: resolved.error };
  const h = resolved.habit;
  const today = todayLocal();
  const streak = calcStreak(h.log, today, h.schedule ?? undefined);

  const data: {
    id: string;
    name: string;
    color: string;
    icon?: string;
    archived: boolean;
    createdAt: string;
    streak: number;
    logCount: number;
    recentLog: string[];
    schedule?: HabitSchedule;
    note?: string;
  } = {
    id: h.id,
    name: h.name,
    color: h.color,
    ...(h.icon !== undefined ? { icon: h.icon } : {}),
    archived: h.archived,
    createdAt: h.createdAt,
    streak,
    logCount: h.log.length,
    recentLog: h.log.slice(0, 5),
    ...(h.schedule !== undefined ? { schedule: h.schedule } : {}),
    ...(h.note !== undefined ? { note: h.note } : {}),
  };

  if (json) {
    return { ok: true, message: JSON.stringify(data), data };
  }

  const lines = [
    `habit: ${h.name}  (${h.id})`,
    `  color    : ${h.color}${h.icon ? `  icon: ${h.icon}` : ''}`,
    `  archived : ${h.archived}`,
    `  created  : ${h.createdAt}`,
    `  streak   : ${streak} day${streak === 1 ? '' : 's'}`,
    `  log count: ${h.log.length}`,
    `  recent   : ${data.recentLog.join(', ') || '(none)'}`,
  ];
  if (h.schedule) lines.push(`  schedule : ${JSON.stringify(h.schedule)}`);
  if (h.note) lines.push(`  note     : ${h.note}`);

  return { ok: true, message: lines.join('\n'), data };
}

/**
 * `krnl habit pin <ref>` — renderer-required (exit 2 if detached).
 * Dispatches `habit.spawnLane` through the renderer's cli:dispatch channel.
 */
export async function cliPin(
  ctx: HabitCtx,
  ref: string | undefined,
): Promise<SysResult> {
  if (!ref) return { ok: false, message: 'habit pin requires <id|name>' };
  if (!ctx.cliDispatch) {
    return {
      ok: false,
      message: 'habit pin requires an open renderer window (exit 2 = no renderer)',
      data: { exitCode: 2 },
    };
  }
  // We need to resolve the habit to get its id. Load the board file-side to resolve.
  const board = loadBoard(ctx);
  const mother = findMother(board);
  if (!mother) return notFound();
  const resolved = resolveHabit(mother.state, ref);
  if ('error' in resolved) return { ok: false, message: resolved.error };
  return ctx.cliDispatch('habit.spawnLane', { habitId: resolved.habit.id });
}

/**
 * `krnl habit unpin <ref>` — renderer-required (exit 2 if detached).
 * Dispatches `habit.unpinLane` to remove the habit.lane node for this habit.
 */
export async function cliUnpin(
  ctx: HabitCtx,
  ref: string | undefined,
): Promise<SysResult> {
  if (!ref) return { ok: false, message: 'habit unpin requires <id|name>' };
  if (!ctx.cliDispatch) {
    return {
      ok: false,
      message: 'habit unpin requires an open renderer window (exit 2 = no renderer)',
      data: { exitCode: 2 },
    };
  }
  const board = loadBoard(ctx);
  const mother = findMother(board);
  if (!mother) return notFound();
  const resolved = resolveHabit(mother.state, ref);
  if ('error' in resolved) return { ok: false, message: resolved.error };
  return ctx.cliDispatch('habit.unpinLane', { habitId: resolved.habit.id });
}

// ── Legacy stubs (kept for back-compat with any caller importing them
// before SysFacade rewiring landed). Internally route to the wired commands
// using process.env-derived defaults. Prefer the cli* exports above.

function envCtx(): HabitCtx {
  const path = process.env['KRNL0_BOARD_PATH']
    ?? `${process.env['KRNL0_BOARD_DIR'] ?? `${process.env['USERPROFILE'] ?? process.env['HOME'] ?? '.'}/Documents/krnl0`}/board.json`;
  return { boardPath: path };
}

export async function habitAddLegacy(name?: string): Promise<SysResult> {
  return cliAdd(envCtx(), name);
}

export async function habitDoneLegacy(name?: string, date?: string): Promise<SysResult> {
  return cliDone(envCtx(), name, date);
}

export async function habitStreakLegacy(name?: string): Promise<SysResult> {
  return cliStreak(envCtx(), name);
}

// Re-export legacy names matching the previous module signature so any
// outside import does not break.
export {
  habitAddLegacy as habitAdd,
  habitDoneLegacy as habitDone,
  habitStreakLegacy as habitStreak,
};

// ── Decision 39 — routines and `habit kind` ──────────────────────────────────

const DAY_NAMES = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

function localYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "mon,wed" / "1,3" / "daily" / "weekdays" → a schedule shape, or an error. */
export function parseRoutineDays(raw: string | undefined): { kind: 'daily' } | { kind: 'weekdays' } | { kind: 'weekly'; days: IsoDow[] } | { error: string } {
  if (!raw) return { error: 'needs --days (e.g. mon,wed · 1,3 · daily · weekdays)' };
  const v = raw.trim().toLowerCase();
  if (v === 'daily' || v === 'every day') return { kind: 'daily' };
  if (v === 'weekdays') return { kind: 'weekdays' };
  const days: IsoDow[] = [];
  for (const tok of v.split(',').map((t) => t.trim()).filter(Boolean)) {
    const byName = DAY_NAMES.findIndex((n) => tok.startsWith(n));
    const n = /^[1-7]$/.test(tok) ? Number(tok) : byName >= 0 ? byName + 1 : NaN;
    if (!Number.isInteger(n)) return { error: `unknown day "${tok}" — use mon..sun or 1..7` };
    if (!days.includes(n as IsoDow)) days.push(n as IsoDow);
  }
  if (days.length === 0) return { error: 'needs at least one day' };
  return { kind: 'weekly', days: days.sort((a, b) => a - b) };
}

function routineLine(h: Habit): string {
  const sch = h.schedule;
  const when = !sch ? '' : sch.kind === 'daily' ? 'every day' : sch.kind === 'weekdays' ? 'weekdays' : sch.days.map((d) => DAY_NAMES[d - 1]).join(',');
  const len = sch?.durationMin ? ` for ${sch.durationMin} min` : '';
  const end = h.endsOn ? ` · ends ${h.endsOn}` : '';
  const ex = h.exceptions?.length ? ` · ${h.exceptions.map((e) => `${e.date} ${e.skip ? 'skipped' : `moved to ${e.at}`}`).join(', ')}` : '';
  return `${h.name} · ${when} ${sch?.timeOfDay ?? ''}${len}${end}${ex} · ${h.id}`;
}

/** The next date (today on) the routine happens, unskipped; null within 8 weeks. */
function nextOccurrence(h: Habit, from: Date = new Date()): string | null {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  for (let i = 0; i < 56; i++) {
    const ymd = localYMD(d);
    const occ = routineOccurrence(h, ymd);
    if (occ && !occ.skipped) return ymd;
    d.setDate(d.getDate() + 1);
  }
  return null;
}

async function withRoutine(
  ctx: HabitCtx,
  ref: string | undefined,
  usage: string,
  fn: (h: Habit, state: HabitState) => { state: HabitState; message: string } | { error: string },
): Promise<SysResult> {
  if (!ref) return { ok: false, message: usage };
  const board = loadBoard(ctx);
  const mother = findMother(board);
  if (!mother) return notFound();
  const resolved = resolveHabit(mother.state, ref);
  if ('error' in resolved) return { ok: false, message: resolved.error };
  if (resolved.habit.kind !== 'routine') return { ok: false, message: `"${resolved.habit.name}" is a habit, not a routine (habit kind <ref> routine)` };
  const r = fn(resolved.habit, mother.state);
  if ('error' in r) return { ok: false, message: r.error };
  mother.state = r.state;
  writeBoard(ctx, board, mother);
  return { ok: true, message: r.message, data: { id: resolved.habit.id } };
}

export async function cliRoutineAdd(
  ctx: HabitCtx, name: string | undefined, daysRaw: string | undefined, at: string | undefined, forMin: number | undefined,
): Promise<SysResult> {
  const usage = 'routine add "<name>" --days mon,wed --at HH:MM --for <minutes>';
  if (!name?.trim()) return { ok: false, message: usage };
  const days = parseRoutineDays(daysRaw);
  if ('error' in days) return { ok: false, message: `routine add: ${days.error}` };
  if (!at || !isValidTimeOfDay(at)) return { ok: false, message: `routine add: needs --at HH:MM (24-hour)` };
  const len = forMin ?? 60;
  if (!(len >= 5 && len <= 720)) return { ok: false, message: 'routine add: --for must be 5–720 minutes' };
  const board = loadBoard(ctx);
  const mother = findMother(board);
  if (!mother) return notFound();
  const before = new Set(mother.state.habits.map((h) => h.id));
  mother.state = habitAdd(mother.state, { name: name.trim(), kind: 'routine', schedule: { ...days, timeOfDay: at, durationMin: len } });
  const added = mother.state.habits.find((h) => !before.has(h.id));
  if (!added) return { ok: false, message: 'routine add: nothing added' };
  writeBoard(ctx, board, mother);
  return { ok: true, message: `routine added: ${routineLine(added)}`, data: { id: added.id } };
}

export async function cliRoutineList(ctx: HabitCtx, json = false): Promise<SysResult> {
  const board = loadBoard(ctx);
  const mother = findMother(board);
  if (!mother) return notFound();
  const list = mother.state.habits.filter((h) => h.kind === 'routine' && !h.archived);
  if (json) return { ok: true, message: JSON.stringify(list), data: list };
  if (!list.length) return { ok: true, message: 'No routines. Add one: routine add "Class" --days mon --at 10:00 --for 120', data: [] };
  const lines = list.map((h) => `${h.endsOn && h.endsOn < localYMD(new Date()) ? '[ended] ' : ''}${routineLine(h)}${nextOccurrence(h) ? ` · next ${nextOccurrence(h)}` : ''}`);
  return { ok: true, message: `routines:\n  ${lines.join('\n  ')}`, data: list };
}

export function cliRoutineSkip(ctx: HabitCtx, ref: string | undefined, on: string | undefined): Promise<SysResult> {
  return withRoutine(ctx, ref, 'routine skip <ref> [--on YYYY-MM-DD]', (h, st) => {
    const date = on ?? nextOccurrence(h);
    if (!date || !YMD.test(date)) return { error: 'routine skip: --on must be YYYY-MM-DD' };
    if (!routineOccurrence(h, date)) return { error: `"${h.name}" does not happen on ${date}` };
    return { state: routineSkip(st, { id: h.id, date }), message: `"${h.name}" skipped on ${date}` };
  });
}

export function cliRoutineUnskip(ctx: HabitCtx, ref: string | undefined, on: string | undefined): Promise<SysResult> {
  return withRoutine(ctx, ref, 'routine unskip <ref> --on YYYY-MM-DD', (h, st) => {
    if (!on || !YMD.test(on)) return { error: 'routine unskip: needs --on YYYY-MM-DD' };
    return { state: routineUnskip(st, { id: h.id, date: on }), message: `"${h.name}" back on ${on}` };
  });
}

export function cliRoutineMove(ctx: HabitCtx, ref: string | undefined, on: string | undefined, at: string | undefined): Promise<SysResult> {
  return withRoutine(ctx, ref, 'routine move <ref> --on YYYY-MM-DD --at HH:MM', (h, st) => {
    if (!on || !YMD.test(on)) return { error: 'routine move: needs --on YYYY-MM-DD' };
    if (!at || !isValidTimeOfDay(at)) return { error: 'routine move: needs --at HH:MM' };
    if (!routineOccurrence(h, on)) return { error: `"${h.name}" does not happen on ${on}` };
    return { state: routineMove(st, { id: h.id, date: on, at }), message: `"${h.name}" on ${on} moved to ${at}` };
  });
}

export function cliRoutineEnd(ctx: HabitCtx, ref: string | undefined, on: string | undefined): Promise<SysResult> {
  return withRoutine(ctx, ref, 'routine end <ref> [--on YYYY-MM-DD]', (h, st) => {
    const date = on ?? localYMD(new Date());
    if (!YMD.test(date)) return { error: 'routine end: --on must be YYYY-MM-DD' };
    return { state: routineEnd(st, { id: h.id, date }), message: `"${h.name}" ends after ${date} (its history stays; routine restart to bring it back)` };
  });
}

export function cliRoutineRestart(ctx: HabitCtx, ref: string | undefined): Promise<SysResult> {
  return withRoutine(ctx, ref, 'routine restart <ref>', (h, st) => ({ state: routineRestart(st, { id: h.id }), message: `"${h.name}" restarted` }));
}

export async function cliKind(ctx: HabitCtx, ref: string | undefined, kind: string | undefined): Promise<SysResult> {
  if (!ref || (kind !== 'routine' && kind !== 'habit')) return { ok: false, message: 'habit kind <id|name> routine|habit' };
  const board = loadBoard(ctx);
  const mother = findMother(board);
  if (!mother) return notFound();
  const resolved = resolveHabit(mother.state, ref);
  if ('error' in resolved) return { ok: false, message: resolved.error };
  if (kind === 'routine' && !resolved.habit.schedule?.timeOfDay) {
    return { ok: false, message: `"${resolved.habit.name}" needs days and a time first: habit schedule <ref> --weekly --days 1,3 --at HH:MM --duration N` };
  }
  mother.state = habitSetKind(mother.state, { id: resolved.habit.id, kind });
  if (kind === 'routine') removeLanesFor(board, resolved.habit.id); // a routine is never ticked: no lane
  writeBoard(ctx, board, mother);
  return { ok: true, message: `"${resolved.habit.name}" is now a ${kind}`, data: { id: resolved.habit.id, kind } };
}
