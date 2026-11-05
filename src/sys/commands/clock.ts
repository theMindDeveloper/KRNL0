// ADR 0004 — `krnl clock day` and `krnl clock show` CLI commands.
// Reads/mutates the ClockNode mother state (selectedDate, viewWindow).

import { loadBoardFrom, saveBoardTo } from '../../main/persistence/board';
import type { SysResult } from '../SysFacade';
import {
  clockSetSelectedDate,
  clockAdvanceDay,
  clockGoToday, clockGoNow, clockSetDialOnly, clockSetViewWindow, clockSetWeekView,
} from '../../renderer/components/nodes/ClockNode/commands';
import type { ClockState } from '../../renderer/components/nodes/ClockNode/types';
import { selectSchedule } from '../../renderer/store/scheduleSelector';
import type { ScheduledTaskPlacement } from '../../renderer/store/scheduleSelector';
import type { Board } from '../../shared/types';
import type { TaskState } from '../../renderer/components/nodes/TaskNode/types';
import type { AnyNode as SharedAnyNode, AnyEdge } from '../../shared/dispatch/types';
import { isValidYMD, localYMD } from '../../shared/ymd';

export interface ClockCtx {
  boardPath: string;
  onBoardChanged?: () => void;
}

interface BoardShape {
  nodes: SharedAnyNode[];
  edges: AnyEdge[];
  [k: string]: unknown;
}

function loadBoard(ctx: ClockCtx): BoardShape {
  const raw = loadBoardFrom(ctx.boardPath);
  if (typeof raw !== 'object' || raw === null) return { nodes: [], edges: [] };
  const b = raw as Record<string, unknown>;
  if (!Array.isArray(b['nodes'])) b['nodes'] = [];
  if (!Array.isArray(b['edges'])) b['edges'] = [];
  return b as BoardShape;
}

function saveBoard(ctx: ClockCtx, board: BoardShape): void {
  saveBoardTo(ctx.boardPath, { ...board, savedAt: new Date().toISOString() });
  ctx.onBoardChanged?.();
}

function findClockMother(board: BoardShape): SharedAnyNode | null {
  return (
    (board.nodes.find(
      (n) =>
        typeof n === 'object' &&
        n !== null &&
        (n as SharedAnyNode).kind === 'clock' &&
        (n as SharedAnyNode).isMother === true,
    ) as SharedAnyNode | undefined) ?? null
  );
}

function updateNode(board: BoardShape, id: string, newNode: SharedAnyNode): void {
  board.nodes = board.nodes.map((n) => {
    if (typeof n !== 'object' || n === null) return n;
    if ((n as SharedAnyNode).id === id) return newNode;
    return n;
  });
}

function hhmm(iso: string): string {
  const t = iso.split('T')[1];
  if (!t) return iso;
  return t.slice(0, 5);
}

// ── Commands ──────────────────────────────────────────────────────────────────

/**
 * `krnl clock day <YYYY-MM-DD|today|+1|-1>`
 * Updates the clock mother's selectedDate.
 *   - YYYY-MM-DD: absolute date
 *   - today: reset to today
 *   - +1 / -1: advance/retreat one day
 */
export async function clockDay(
  ctx: ClockCtx,
  arg: string | undefined,
): Promise<SysResult> {
  if (!arg) return { ok: false, message: 'clock day requires <YYYY-MM-DD|today|+1|-1>' };
  const board = loadBoard(ctx);
  const clockNode = findClockMother(board);
  if (!clockNode) return { ok: false, message: 'No clock mother node found in board.' };

  const prevState = clockNode.state as ClockState;
  let nextState: ClockState;

  if (arg === 'today') {
    nextState = clockGoToday(prevState);
  } else if (arg === '+1') {
    nextState = clockAdvanceDay(prevState, { delta: 1 });
  } else if (arg === '-1') {
    nextState = clockAdvanceDay(prevState, { delta: -1 });
  } else {
    nextState = clockSetSelectedDate(prevState, { date: arg });
    if (nextState === prevState) {
      return { ok: false, message: `Invalid date "${arg}". Use YYYY-MM-DD, today, +1, or -1.` };
    }
  }

  updateNode(board, clockNode.id, { ...clockNode, state: nextState });
  saveBoard(ctx, board);
  return {
    ok: true,
    message: `Clock day set to ${nextState.selectedDate}.`,
    data: { selectedDate: nextState.selectedDate },
  };
}

/** `krnl clock now` — today and the 12-hour half that contains now (#201). */
export async function clockNow(ctx: ClockCtx): Promise<SysResult> {
  const board = loadBoard(ctx);
  const clockNode = findClockMother(board);
  if (!clockNode) return { ok: false, message: 'No clock mother node found in board.' };
  const nextState = clockGoNow(clockNode.state as ClockState);
  updateNode(board, clockNode.id, { ...clockNode, state: nextState });
  saveBoard(ctx, board);
  return {
    ok: true,
    message: `Clock set to now (${nextState.selectedDate}, ${nextState.viewWindow === 1 ? 'PM' : 'AM'}).`,
    data: { selectedDate: nextState.selectedDate, viewWindow: nextState.viewWindow },
  };
}

/** `krnl clock week [on|off]` — the last 7 days as small dials (toggles without an argument). */
export async function clockWeek(ctx: ClockCtx, arg: string | undefined): Promise<SysResult> {
  if (arg !== undefined && arg !== 'on' && arg !== 'off') return { ok: false, message: 'clock week takes on|off (or nothing to toggle)' };
  const board = loadBoard(ctx);
  const clockNode = findClockMother(board);
  if (!clockNode) return { ok: false, message: 'No clock mother node found in board.' };
  const nextState = clockSetWeekView(clockNode.state as ClockState, arg === undefined ? {} : { on: arg === 'on' });
  updateNode(board, clockNode.id, { ...clockNode, state: nextState });
  saveBoard(ctx, board);
  return { ok: true, message: `Clock week view ${nextState.weekView ? 'on' : 'off'}.`, data: { weekView: !!nextState.weekView } };
}

/** `krnl clock dial [on|off]` — dial-only view (toggles without an argument). */
export async function clockDial(ctx: ClockCtx, arg: string | undefined): Promise<SysResult> {
  if (arg !== undefined && arg !== 'on' && arg !== 'off') return { ok: false, message: 'clock dial takes on|off (or nothing to toggle)' };
  const board = loadBoard(ctx);
  const clockNode = findClockMother(board);
  if (!clockNode) return { ok: false, message: 'No clock mother node found in board.' };
  const nextState = clockSetDialOnly(clockNode.state as ClockState, arg === undefined ? {} : { on: arg === 'on' });
  updateNode(board, clockNode.id, { ...clockNode, state: nextState });
  saveBoard(ctx, board);
  return { ok: true, message: `Clock dial-only ${nextState.dialOnly ? 'on' : 'off'}.`, data: { dialOnly: !!nextState.dialOnly } };
}

/** `krnl clock half [am|pm]` — the AM / PM switch on the dial. */
export async function clockHalf(ctx: ClockCtx, arg: string | undefined): Promise<SysResult> {
  if (arg !== undefined && arg !== 'am' && arg !== 'pm') return { ok: false, message: 'clock half takes am|pm (or nothing to toggle)' };
  const board = loadBoard(ctx);
  const clockNode = findClockMother(board);
  if (!clockNode) return { ok: false, message: 'No clock mother node found in board.' };
  const cur = (clockNode.state as ClockState).viewWindow === 1 ? 1 : 0;
  const win: 0 | 1 = arg === 'am' ? 0 : arg === 'pm' ? 1 : (cur === 1 ? 0 : 1);
  updateNode(board, clockNode.id, { ...clockNode, state: clockSetViewWindow(clockNode.state as ClockState, { window: win }) });
  saveBoard(ctx, board);
  return { ok: true, message: `Clock shows ${win === 1 ? 'PM (12:00–24:00)' : 'AM (00:00–12:00)'}.`, data: { viewWindow: win } };
}

/**
 * `krnl clock show [--json]`
 * Shows scheduled tasks for the clock's selectedDate, filtered by viewWindow
 * (window 0 = 00:00-12:00, window 1 = 12:00-24:00).
 */
export async function clockShow(
  ctx: ClockCtx,
  json = false,
): Promise<SysResult> {
  const board = loadBoard(ctx);
  const clockNode = findClockMother(board);
  if (!clockNode) return { ok: false, message: 'No clock mother node found in board.' };

  const clockState = clockNode.state as ClockState;
  const { viewWindow } = clockState;
  // A bad stored day (written before dates were validated) must not make
  // every later `clock show` throw — show today instead.
  const selectedDate = isValidYMD(clockState.selectedDate) ? clockState.selectedDate : localYMD(new Date());

  // Window boundaries (minutes-of-day).
  const windowStartMin = viewWindow === 1 ? 720 : 0;
  const windowEndMin = viewWindow === 1 ? 1440 : 720;
  const windowStartISO = `${selectedDate}T${viewWindow === 1 ? '12:00' : '00:00'}`;
  const windowEndISO = `${selectedDate}T${viewWindow === 1 ? '23:59' : '12:00'}`;
  void windowStartMin; void windowEndMin;

  const boardAsBoard = board as unknown as Board;
  const { placements } = selectSchedule(boardAsBoard);

  // Filter to selectedDate + viewWindow.
  // Include cross-midnight tasks: tasks that started the previous day but extend into selectedDate,
  // or tasks that start on selectedDate but extend past midnight into the next day.
  const dayStart = `${selectedDate}T00:00`;
  const nextDate = new Date(new Date(selectedDate).getTime() + 86400000).toISOString().slice(0, 10);
  const dayEnd = `${nextDate}T00:00`;
  const filtered: ScheduledTaskPlacement[] = [];
  for (const p of placements.values()) {
    // Skip if task doesn't overlap this day at all.
    if (p.endISO <= dayStart) continue;
    if (p.startISO >= dayEnd) continue;
    // Check overlap with the viewWindow inside the day.
    if (p.endISO <= windowStartISO) continue;
    if (p.startISO >= windowEndISO) continue;
    filtered.push(p);
  }
  filtered.sort((a, b) => a.startISO.localeCompare(b.startISO));

  // Build taskId → text lookup.
  const taskMeta = new Map<string, { text: string }>();
  for (const n of board.nodes) {
    const node = n as SharedAnyNode;
    if (node.kind !== 'todo.task') continue;
    const ts = node.state as TaskState;
    taskMeta.set(node.id, { text: ts.text });
  }

  if (json) {
    const payload = {
      selectedDate,
      viewWindow,
      placements: filtered.map((p) => ({
        ...p,
        text: taskMeta.get(p.taskId)?.text ?? '(unknown)',
      })),
    };
    return { ok: true, message: JSON.stringify(payload), data: payload };
  }

  const header = `Clock: ${selectedDate}  window=${viewWindow === 1 ? '12:00-24:00' : '00:00-12:00'}`;
  if (filtered.length === 0) {
    return { ok: true, message: `${header}\n(no scheduled tasks in window)`, data: { selectedDate, viewWindow, placements: [] } };
  }

  const lines = [header, ''];
  for (const p of filtered) {
    const text = taskMeta.get(p.taskId)?.text ?? '(unknown)';
    const prefix = p.isAnchor ? '[A]' : ' -> ';
    const parallel = p.parallelGroupId !== null ? ` [p${p.parallelBranchIndex ?? 0}]` : '';
    lines.push(`  ${hhmm(p.startISO)}-${hhmm(p.endISO)}${parallel}  ${prefix}  ${p.taskId.slice(0, 8)}  ${text}`);
  }

  return {
    ok: true,
    message: lines.join('\n'),
    data: {
      selectedDate,
      viewWindow,
      placements: filtered.map((p) => ({ ...p, text: taskMeta.get(p.taskId)?.text ?? '(unknown)' })),
    },
  };
}
