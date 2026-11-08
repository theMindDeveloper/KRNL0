import { todayYMD } from '../../shared/ymd';
import { parseQuickAdd } from '../../shared/quickAdd';
import { describeTaskRepeat, isoDowOfYMD, nextRepeatDay, parseRepeat } from '../../shared/repeatTask';
import { taskSchedule } from './task';
import { parseDue, dueLabel } from '../../shared/due';
// sys todo CLI — real board.json operations for the sys CLI.
// Operates on the first todo mother node in board.json.

import { randomUUID } from 'crypto';
import { loadBoardFrom, saveBoardTo } from '../../main/persistence/board';
import type { SysResult } from '../SysFacade';
import { todoSetRepeat, todoDrop, todoUndrop, todoSetDue,
  todoToggle as fsmTodoToggle,
  visibleItems,
  todoBuckets,
  todoTagLibrary,
  todoSetItemTag,
  todoAddTag,
  todoRemoveTag,
  todoArchiveDone,
  todoClearArchived,
} from '../../renderer/components/nodes/TodoNode/commands';
import type { TodoState } from '../../renderer/components/nodes/TodoNode/types';
import { defaultTodoConfig } from '../../renderer/components/nodes/TodoNode/types';
import { createTodoTaskPair } from '../../shared/dispatch/todo';
import { taskToggleMirror, syncCompletion, deleteTaskCascade } from '../../shared/dispatch/task';
import { findTag, tagDisplay } from '../../shared/tags/classify';
import type { TaskState } from '../../renderer/components/nodes/TaskNode/types';
import { resolveTodoItemRef, resolutionError } from '../../shared/dispatch/resolveRef';
import type { BoardShape } from '../../shared/dispatch/types';

export interface TodoCtx {
  boardPath: string;
  onBoardChanged?: () => void;
}

function loadBoard(ctx: TodoCtx): BoardShape {
  const raw = loadBoardFrom(ctx.boardPath);
  if (typeof raw !== 'object' || raw === null) return { nodes: [], edges: [] };
  const b = raw as Record<string, unknown>;
  if (!Array.isArray(b['nodes'])) b['nodes'] = [];
  if (!Array.isArray(b['edges'])) b['edges'] = [];
  return b as BoardShape;
}

function findTodoMother(board: BoardShape): { id: string; state: TodoState } | null {
  for (const n of board.nodes) {
    if (n.kind === 'todo' && n.isMother === true) {
      return { id: n.id, state: n.state as TodoState };
    }
  }
  return null;
}

function saveBoard(ctx: TodoCtx, board: BoardShape): void {
  saveBoardTo(ctx.boardPath, { ...board, savedAt: new Date().toISOString() });
  ctx.onBoardChanged?.();
}

export async function todoAdd(
  ctx: TodoCtx,
  text?: string,
  tag?: string,
): Promise<SysResult> {
  if (!text) return { ok: false, message: 'todo add requires a task description' };
  const board = loadBoard(ctx);
  // Quick add, as in the app: "Gym tomorrow 18:00 1h" → name, day, time, length.
  const q = parseQuickAdd(text);

  const pair = createTodoTaskPair(
    board,
    { text: q.text, ...(tag !== undefined ? { tag } : {}), ...(q.durationMin ? { plannedMin: q.durationMin } : {}) },
    { uuid: () => randomUUID(), now: () => new Date().toISOString() },
  );
  if (!pair) {
    return { ok: false, message: 'No todo mother node found in board.' };
  }
  // A day without a time: a due day. "every …": a repeating plan.
  if ((q.day && !q.time) || q.repeat) {
    const mother = board.nodes.find((n) => n.kind === 'todo' && n.isMother === true);
    if (mother) {
      let st = mother.state as TodoState;
      if (q.day && !q.time) st = todoSetDue(st, { id: pair.todoItemId, dueOn: q.day });
      if (q.repeat) st = todoSetRepeat(st, { id: pair.todoItemId, repeat: q.repeat });
      mother.state = st;
    }
  }
  saveBoard(ctx, board);
  // A day and a time: on the Calendar (same path as `task schedule`).
  let when = '';
  if (q.day && q.time) {
    const r = await taskSchedule({ boardPath: ctx.boardPath }, pair.taskNodeId, `${q.day}T${q.time}`);
    if (r.ok) when = ` · on the Calendar ${q.day} ${q.time}`;
  } else if (q.day) when = ` · due ${q.day}`;
  return {
    ok: true,
    message: `Added todo: "${q.text}"${tag ? ` [${tag}]` : ''}${when}${q.durationMin ? ` · ${q.durationMin} min` : ''}${q.repeat ? ` · repeats ${describeTaskRepeat(q.repeat)}` : ''}${q.hint ? ` · added as typed: ${q.hint}` : ''} (task: ${pair.taskNodeId.slice(0, 13)}…)`,
    data: { id: pair.todoItemId, todoItemId: pair.todoItemId, taskNodeId: pair.taskNodeId, ...(q.day ? { day: q.day } : {}), ...(q.time ? { time: q.time } : {}), ...(q.durationMin ? { durationMin: q.durationMin } : {}) },
  };
}

export async function todoCheck(ctx: TodoCtx, id?: string): Promise<SysResult> {
  if (!id) return { ok: false, message: 'todo check requires a task <id>' };
  const board = loadBoard(ctx);
  const mother = findTodoMother(board);
  if (!mother) return { ok: false, message: 'No todo mother node found in board.' };

  const r = resolveTodoItemRef(board, id);
  if (!r.ok) return { ok: false, message: resolutionError('todo item', id, r) };

  const motherIdx = board.nodes.findIndex((n) => n.id === r.id.todoNodeId);
  if (motherIdx === -1) return { ok: false, message: `Todo node missing.` };
  const motherNode = board.nodes[motherIdx]!;
  const motherState = motherNode.state as TodoState;
  const item = motherState.items.find((i) => i.id === r.id.itemId);
  if (!item) return { ok: false, message: `No todo item with id "${id}"` };

  const env = { uuid: () => randomUUID(), now: () => new Date().toISOString() };
  const nextState = fsmTodoToggle(motherState, { id: r.id.itemId }, env);
  const updated = nextState.items.find((i) => i.id === r.id.itemId);

  board.nodes[motherIdx] = { ...motherNode, state: nextState };
  // Mirror to the linked TaskNode like the UI does, so the task's done flag,
  // completedAt and the completion ledger agree with the Todo list.
  if (updated && item.taskNodeId) {
    const task = board.nodes.find((n) => n.id === item.taskNodeId && n.kind === 'todo.task');
    if (task && (task.state as TaskState).done !== updated.done) {
      taskToggleMirror(board, task.id, env);
    }
  }
  saveBoard(ctx, board);
  // Review 5.3 — a repeating plan ticked off brings the next one (as in the app).
  const next = updated?.done && !item.done && item.repeat ? await nextRepeatFromCli(ctx, r.id.itemId) : '';
  return {
    ok: true,
    message: `Todo "${item.text}" marked ${updated?.done ? 'done' : 'undone'}.${next}`,
    data: { id: r.id.itemId, done: updated?.done },
  };
}

/** Which lifecycle buckets `todo list` shows (ADR 0016). */
export type TodoListScope = 'today' | 'done' | 'archived' | 'all';

export async function todoList(
  ctx: TodoCtx,
  json = false,
  scope: TodoListScope = 'today',
): Promise<SysResult> {
  const board = loadBoard(ctx);
  const mother = findTodoMother(board);
  if (!mother) {
    if (json) return { ok: true, message: '[]', data: [] };
    return { ok: false, message: 'No todo mother node found in board.' };
  }

  // Default view mirrors the UI: open items + today's Done; the archive is opt-in.
  const buckets = todoBuckets(mother.state);
  const keep = new Set(
    (scope === 'done' ? buckets.done
      : scope === 'archived' ? buckets.archived
        : scope === 'all' ? [...buckets.active, ...buckets.done, ...buckets.archived]
          : [...buckets.active, ...buckets.done]).map((i) => i.id),
  );
  const archivedIds = new Set(buckets.archived.map((i) => i.id));
  const items = visibleItems(mother.state, { ...defaultTodoConfig(), maxVisible: Number.MAX_SAFE_INTEGER })
    .filter((i) => keep.has(i.id));
  const library = todoTagLibrary(mother.state);

  if (json) {
    return {
      ok: true,
      message: JSON.stringify(items),
      data: items,
    };
  }

  // The facts the app shows on a row, so the assistant sees them too.
  const remindOf = (taskId: string | null) => {
    const t = taskId ? board.nodes.find((n) => n.id === taskId) : undefined;
    const r = (t?.state as { remindMin?: unknown } | undefined)?.remindMin;
    return typeof r === 'number' ? r : null;
  };
  const lines = items.map((i) => {
    const status = archivedIds.has(i.id) ? '[a]' : i.done ? '[x]' : '[ ]';
    const label = i.tag ? tagDisplay(library, i.tag).label : '';
    const tag = label ? ` [${label}${i.tagSource === 'auto' ? '?' : ''}]` : '';
    const facts: string[] = [];
    if (i.droppedAt) facts.push('dropped');
    if (i.dueOn && !i.done) facts.push(`due ${i.dueOn}`);
    const rep = parseRepeat(i.repeat);
    if (rep) facts.push(`repeats ${describeTaskRepeat(rep)}`);
    const rem = remindOf(i.taskNodeId);
    if (rem !== null && !i.done) facts.push(`reminder ${rem === 0 ? 'at start' : `${rem} min before`}`);
    return `${status} ${i.id.slice(0, 8)}  ${i.text}${tag}${facts.length ? `  · ${facts.join(' · ')}` : ''}`;
  });

  return {
    ok: true,
    message: lines.length > 0 ? lines.join('\n') : 'No todos.',
    data: items,
  };
}

// ── ADR 0016 — tags + archive ──────────────────────────────────────────────

/** Apply a pure TodoState transform to the todo mother and persist. */
function mutateTodo(
  ctx: TodoCtx,
  fn: (state: TodoState) => TodoState,
): { ok: true; before: TodoState; after: TodoState; board: BoardShape } | { ok: false; message: string } {
  const board = loadBoard(ctx);
  const idx = board.nodes.findIndex((n) => n.kind === 'todo' && n.isMother === true);
  if (idx === -1) return { ok: false, message: 'No todo mother node found in board.' };
  const node = board.nodes[idx]!;
  const before = node.state as TodoState;
  const after = fn(before);
  board.nodes[idx] = { ...node, state: after };
  return { ok: true, before, after, board };
}

/** Re-file ledger entries of done items whose tag changed (analytics reads the ledger). */
function syncDoneTags(board: BoardShape, before: TodoState, after: TodoState): void {
  for (const item of after.items) {
    if (!item.done || !item.taskNodeId) continue;
    const prev = before.items.find((i) => i.id === item.id);
    if (prev?.tag !== item.tag) syncCompletion(board, item.taskNodeId);
  }
}

export async function todoTag(ctx: TodoCtx, ref?: string, tag?: string): Promise<SysResult> {
  if (!ref || !tag) return { ok: false, message: 'todo tag requires <ref> and <tag|auto>' };
  const board = loadBoard(ctx);
  const r = resolveTodoItemRef(board, ref);
  if (!r.ok) return { ok: false, message: resolutionError('todo item', ref, r) };
  const auto = tag.toLowerCase() === 'auto';
  const m = mutateTodo(ctx, (s) => todoSetItemTag(s, { id: r.id.itemId, tag: auto ? null : tag }));
  if (!m.ok) return m;
  syncDoneTags(m.board, m.before, m.after);
  saveBoard(ctx, m.board);
  const item = m.after.items.find((i) => i.id === r.id.itemId);
  const label = item?.tag ? tagDisplay(todoTagLibrary(m.after), item.tag).label : 'Other';
  return {
    ok: true,
    message: `Todo "${item?.text ?? ref}" tagged ${label}${auto ? ' (auto)' : ''}.`,
    data: { id: r.id.itemId, tag: item?.tag ?? null, tagSource: item?.tagSource ?? null },
  };
}

/** `krnl todo due <ref> <YYYY-MM-DD|today|tomorrow|fri|off>` (review 2.1). */
export async function todoDue(ctx: TodoCtx, ref?: string, when?: string): Promise<SysResult> {
  if (!ref || !when) return { ok: false, message: 'todo due requires <ref> and <YYYY-MM-DD|today|tomorrow|mon..sun|off>' };
  const today = todayYMD();
  const dueOn = parseDue(when, today);
  if (dueOn === undefined) return { ok: false, message: `todo due: "${when}" is not a day (YYYY-MM-DD, today, tomorrow, mon..sun, off)` };
  const board = loadBoard(ctx);
  const r = resolveTodoItemRef(board, ref);
  if (!r.ok) return { ok: false, message: resolutionError('todo item', ref, r) };
  const m = mutateTodo(ctx, (st) => todoSetDue(st, { id: r.id.itemId, dueOn }));
  if (!m.ok) return m;
  saveBoard(ctx, m.board);
  const item = m.after.items.find((i) => i.id === r.id.itemId);
  return {
    ok: true,
    message: dueOn === null ? `Todo "${item?.text ?? ref}": no due date.` : `Todo "${item?.text ?? ref}" due ${dueOn} (${dueLabel(dueOn, today).text}).`,
    data: { id: r.id.itemId, dueOn },
  };
}

/** `krnl todo drop <ref>` / `todo undrop <ref>` — not doing it any more (review 6.1). */
export async function todoDropCmd(ctx: TodoCtx, ref: string | undefined, undo: boolean): Promise<SysResult> {
  if (!ref) return { ok: false, message: `todo ${undo ? 'undrop' : 'drop'} requires <ref>` };
  const board = loadBoard(ctx);
  const r = resolveTodoItemRef(board, ref);
  if (!r.ok) return { ok: false, message: resolutionError('todo item', ref, r) };
  // A repeating plan is skipped, not ended: its next one comes first (it
  // reads this one's time before the drop takes it off the Calendar).
  const was = (findTodoMother(board)?.state as TodoState | undefined)?.items.find((i) => i.id === r.id.itemId);
  const skip = !undo && was && !was.done && was.droppedAt === undefined && parseRepeat(was.repeat) ? await nextRepeatFromCli(ctx, r.id.itemId) : '';
  const m = mutateTodo(ctx, (st) => (undo ? todoUndrop(st, { id: r.id.itemId }) : todoDrop(st, { id: r.id.itemId })));
  if (!m.ok) return m;
  const item = m.after.items.find((i) => i.id === r.id.itemId);
  // A dropped plan comes off the Calendar (it is not "missed").
  if (!undo && item?.taskNodeId) {
    const t = m.board.nodes.find((n) => n.id === item.taskNodeId);
    if (t && t.state && typeof t.state === 'object') {
      const { scheduledFor: _s, ...rest } = t.state as Record<string, unknown>;
      t.state = rest;
    }
  }
  saveBoard(ctx, m.board);
  if (m.after === m.before) return { ok: true, message: `Todo "${item?.text ?? ref}" was ${undo ? 'not dropped' : 'already dropped or done'}.`, data: { id: r.id.itemId } };
  if (skip) return { ok: true, message: `Skipped "${item?.text}" this time.${skip}`, data: { id: r.id.itemId, dropped: true, skipped: true } };
  return { ok: true, message: undo ? `Todo "${item?.text}" is back on the list.` : `Todo "${item?.text}" dropped (in the Archive; todo undrop brings it back).`, data: { id: r.id.itemId, dropped: !undo } };
}

/** `krnl todo repeat <ref> <daily|weekdays|weekly|off>` (review 5.3). Weekly = the plan's own weekday. */
export async function todoRepeat(ctx: TodoCtx, ref?: string, how?: string): Promise<SysResult> {
  if (!ref || !how) return { ok: false, message: 'todo repeat requires <ref> <daily|weekdays|weekly|off>' };
  const board = loadBoard(ctx);
  const r = resolveTodoItemRef(board, ref);
  if (!r.ok) return { ok: false, message: resolutionError('todo item', ref, r) };
  const mother = board.nodes.find((n) => n.id === r.id.todoNodeId);
  const item = (mother?.state as TodoState | undefined)?.items.find((i) => i.id === r.id.itemId);
  const task = item?.taskNodeId ? board.nodes.find((n) => n.id === item.taskNodeId) : undefined;
  const day = (task?.state as { scheduledFor?: string } | undefined)?.scheduledFor?.slice(0, 10) ?? item?.dueOn ?? localToday();
  const repeat = how === 'off' ? null : how === 'daily' ? { kind: 'daily' as const } : how === 'weekdays' ? { kind: 'weekdays' as const } : how === 'weekly' ? { kind: 'weekly' as const, day: isoDowOfYMD(day) } : undefined;
  if (repeat === undefined) return { ok: false, message: `todo repeat: "${how}" is not daily, weekdays, weekly or off` };
  const m = mutateTodo(ctx, (st) => todoSetRepeat(st, { id: r.id.itemId, repeat }));
  if (!m.ok) return m;
  saveBoard(ctx, m.board);
  return { ok: true, message: repeat ? `Todo "${item?.text ?? ref}" repeats ${describeTaskRepeat(repeat)}: tick it off and the next one appears.` : `Todo "${item?.text ?? ref}" no longer repeats.`, data: { id: r.id.itemId, repeat } };
}

const localToday = (): string => todayYMD();

/** After `todo check` ticks a repeating item: add the next one (as the app does). */
async function nextRepeatFromCli(ctx: TodoCtx, itemId: string): Promise<string> {
  const board = loadBoard(ctx);
  const mother = board.nodes.find((n) => n.kind === 'todo' && n.isMother === true);
  const item = (mother?.state as TodoState | undefined)?.items.find((i) => i.id === itemId);
  const repeat = parseRepeat(item?.repeat);
  if (!mother || !item || !repeat) return '';
  const task = item.taskNodeId ? board.nodes.find((n) => n.id === item.taskNodeId) : undefined;
  const ts = task?.state as { scheduledFor?: string; plannedMin?: number; timeOpen?: boolean; remindMin?: number; kind?: string } | undefined;
  const base = ts?.scheduledFor?.slice(0, 10) ?? item.dueOn ?? localToday();
  const next = nextRepeatDay(repeat, base, localToday());
  const pair = createTodoTaskPair(board, { text: item.text, ...(item.tag ? { tag: item.tag } : {}), ...(ts?.plannedMin && !ts.timeOpen ? { plannedMin: ts.plannedMin } : {}) }, { uuid: () => randomUUID(), now: () => new Date().toISOString() });
  if (!pair) return '';
  // The pair replaced the Todo node in the board: edit the one there now.
  const now = board.nodes.find((n) => n.kind === 'todo' && n.isMother === true);
  if (!now) return '';
  let st = now.state as TodoState;
  st = todoSetRepeat(st, { id: pair.todoItemId, repeat });
  st = todoSetRepeat(st, { id: item.id, repeat: null });
  if (!ts?.scheduledFor) st = todoSetDue(st, { id: pair.todoItemId, dueOn: next });
  now.state = st;
  // The next one keeps what the plan was: an event or a focus block, and its reminder.
  const nextTask = board.nodes.find((n) => n.id === pair.taskNodeId);
  if (nextTask && nextTask.state && typeof nextTask.state === 'object') {
    const ns = nextTask.state as Record<string, unknown>;
    if (ts?.kind === 'event') ns['kind'] = 'event';
    if (typeof ts?.remindMin === 'number') ns['remindMin'] = ts.remindMin;
  }
  saveBoard(ctx, board);
  if (ts?.scheduledFor) await taskSchedule({ boardPath: ctx.boardPath }, pair.taskNodeId, `${next}T${ts.scheduledFor.slice(11, 16)}`);
  return ` Next one: ${next}${ts?.scheduledFor ? ` ${ts.scheduledFor.slice(11, 16)}` : ''}.`;
}

export async function todoTags(
  ctx: TodoCtx,
  opts: { action?: string; label?: string; keywords?: string; color?: string; json?: boolean },
): Promise<SysResult> {
  const action = opts.action ?? 'list';
  if (action === 'add') {
    if (!opts.label) return { ok: false, message: 'todo tags add requires a "<label>"' };
    const keywords = opts.keywords ? opts.keywords.split(',') : undefined;
    const m = mutateTodo(ctx, (s) => todoAddTag(s, {
      label: opts.label!,
      ...(keywords ? { keywords } : {}),
      ...(opts.color ? { color: opts.color } : {}),
    }));
    if (!m.ok) return m;
    if (m.after === m.before) return { ok: false, message: `Tag "${opts.label}" already exists.` };
    saveBoard(ctx, m.board);
    const added = m.after.tagLibrary?.[m.after.tagLibrary.length - 1];
    return { ok: true, message: `Added tag "${added?.label}" (id: ${added?.id}).`, data: added };
  }
  if (action === 'remove') {
    if (!opts.label) return { ok: false, message: 'todo tags remove requires a <tag id>' };
    const m = mutateTodo(ctx, (s) => {
      const t = findTag(todoTagLibrary(s), opts.label!);
      return t ? todoRemoveTag(s, { id: t.id }) : s;
    });
    if (!m.ok) return m;
    if (m.after === m.before) return { ok: false, message: `No custom tag "${opts.label}" (built-in tags can't be removed).` };
    saveBoard(ctx, m.board);
    return { ok: true, message: `Removed tag "${opts.label}".` };
  }
  if (action !== 'list') return { ok: false, message: `Unknown todo tags action "${action}" (list|add|remove)` };

  const board = loadBoard(ctx);
  const mother = findTodoMother(board);
  const state = mother?.state ?? { items: [] };
  const library = todoTagLibrary(state);
  const counts = new Map<string, number>();
  for (const i of state.items) if (i.tag) counts.set(i.tag, (counts.get(i.tag) ?? 0) + 1);
  const rows = library.map((t) => ({
    id: t.id,
    label: t.label,
    builtin: t.builtin === true,
    items: counts.get(t.id) ?? 0,
    keywords: [...(t.strong ?? []), ...(t.keywords ?? [])],
  }));
  if (opts.json) return { ok: true, message: JSON.stringify(rows), data: rows };
  const lines = rows.map((r) =>
    `${r.id.padEnd(14)} ${r.label.padEnd(14)} ${String(r.items).padStart(3)} items${r.builtin ? '' : '  (custom)'}`,
  );
  return { ok: true, message: lines.join('\n'), data: rows };
}

export async function todoArchive(ctx: TodoCtx): Promise<SysResult> {
  const m = mutateTodo(ctx, (s) => todoArchiveDone(s));
  if (!m.ok) return m;
  const moved = m.after.items.filter((i, k) => i.archivedAt !== undefined && m.before.items[k]?.archivedAt === undefined).length;
  if (moved > 0) saveBoard(ctx, m.board);
  return { ok: true, message: moved > 0 ? `Archived ${moved} done item(s).` : 'Nothing to archive.', data: { archived: moved } };
}

export async function todoClearArchive(ctx: TodoCtx): Promise<SysResult> {
  const board = loadBoard(ctx);
  const mother = findTodoMother(board);
  if (!mother) return { ok: false, message: 'No todo mother node found in board.' };
  const archived = todoBuckets(mother.state).archived;
  if (archived.length === 0) return { ok: true, message: 'Archive is already empty.', data: { removed: 0 } };
  // Delete the archived rows' task nodes (the cascade also drops the rows).
  // The completion ledger is left alone, so analytics keeps the history.
  for (const item of archived) {
    if (item.taskNodeId) deleteTaskCascade(board, item.taskNodeId);
  }
  const idx = board.nodes.findIndex((n) => n.id === mother.id);
  if (idx !== -1) {
    const node = board.nodes[idx]!;
    board.nodes[idx] = { ...node, state: todoClearArchived(node.state as TodoState) };
  }
  saveBoard(ctx, board);
  return { ok: true, message: `Cleared ${archived.length} archived item(s).`, data: { removed: archived.length } };
}
