// sys habit CLI — wired to board.json via the shared persistence module
// (Decision #14). Operates on the mother habit node identified by
// `kind === 'habit' && isMother === true`. Habits are resolved by id (exact)
// or case-insensitive name match.

import { randomUUID } from 'crypto';
import { loadBoardFrom, saveBoardTo } from '../../main/persistence/board';
import type { SysResult } from '../SysFacade';
import {
  habitAdd,
  habitToggleDay,
  habitRemove,
  habitSetColor,
  habitSetView,
  calcStreak,
} from '../../renderer/components/nodes/HabitNode/commands';
import type {
  Habit,
  HabitColor,
  HabitConfig,
  HabitState,
  HabitView,
} from '../../renderer/components/nodes/HabitNode/types';
import {
  HABIT_COLORS,
  HABIT_VIEWS,
  isHabitColor,
  isHabitView,
  todayLocal,
} from '../../renderer/components/nodes/HabitNode/types';

export interface HabitCtx {
  boardPath: string;
  onBoardChanged?: () => void;
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

// Resolve idOrName → habit. Case-insensitive name match. Returns null if
// not found or ambiguous (multiple name matches).
function resolveHabit(
  state: HabitState,
  idOrName: string,
): { habit: Habit } | { error: string } {
  const exact = state.habits.find((h) => h.id === idOrName);
  if (exact) return { habit: exact };
  const lower = idOrName.toLowerCase();
  const matches = state.habits.filter((h) => h.name.toLowerCase() === lower);
  if (matches.length === 1) return { habit: matches[0]! };
  if (matches.length > 1) {
    return {
      error: `Ambiguous habit "${idOrName}" — ${matches.length} habits share that name. Use an id.`,
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

export async function cliDone(
  ctx: HabitCtx,
  idOrName: string | undefined,
  date: string | undefined,
): Promise<SysResult> {
  if (!idOrName) return { ok: false, message: 'habit done requires <id|name>' };
  const board = loadBoard(ctx);
  const mother = findMother(board);
  if (!mother) return notFound();
  const resolved = resolveHabit(mother.state, idOrName);
  if ('error' in resolved) return { ok: false, message: resolved.error };
  const targetDate = date ?? todayLocal();
  const before = resolved.habit.log.includes(targetDate);
  const next = habitToggleDay(mother.state, { id: resolved.habit.id, date: targetDate }, {
    uuid: () => randomUUID(),
    now: () => new Date().toISOString(),
    today: todayLocal,
  });
  // If the toggle was a no-op (date out of range), surface the reason.
  const afterHabit = next.habits.find((h) => h.id === resolved.habit.id)!;
  const after = afterHabit.log.includes(targetDate);
  if (before === after) {
    return {
      ok: false,
      message: `habit done: date ${targetDate} is out of range for "${resolved.habit.name}" (must be ≥ createdAt and ≤ today).`,
    };
  }
  mother.state = next;
  writeBoard(ctx, board, mother);
  return {
    ok: true,
    message: after
      ? `habit done: "${resolved.habit.name}" marked ${targetDate}`
      : `habit done: "${resolved.habit.name}" unmarked ${targetDate}`,
    data: { id: resolved.habit.id, date: targetDate, done: after },
  };
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
  const n = calcStreak(resolved.habit.log, todayLocal());
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
  writeBoard(ctx, board, mother);
  return {
    ok: true,
    message: `habit removed: "${resolved.habit.name}"`,
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

export async function cliList(ctx: HabitCtx): Promise<SysResult> {
  const board = loadBoard(ctx);
  const mother = findMother(board);
  if (!mother) return notFound();
  const today = todayLocal();
  const rows = mother.state.habits.map((h) => ({
    id: h.id,
    name: h.name,
    color: h.color,
    archived: h.archived,
    streak: calcStreak(h.log, today),
    logCount: h.log.length,
  }));
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
