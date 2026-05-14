// ADR 0003/0005 — `krnl cal show` CLI command.
// Reads the cascade schedule SSOT (selectSchedule) and prints a human-readable
// or JSON list of all scheduled task placements.

import { loadBoardFrom } from '../../main/persistence/board';
import type { SysResult } from '../SysFacade';
import { selectSchedule } from '../../renderer/store/scheduleSelector';
import type { ScheduledTaskPlacement } from '../../renderer/store/scheduleSelector';
import type { Board } from '../../shared/types';
import type { TaskState } from '../../renderer/components/nodes/TaskNode/types';
import type { AnyNode as SharedAnyNode } from '../../shared/dispatch/types';

export interface CalCtx {
  boardPath: string;
}

function loadBoard(ctx: CalCtx): Board | null {
  const raw = loadBoardFrom(ctx.boardPath);
  if (typeof raw !== 'object' || raw === null) return null;
  const b = raw as Record<string, unknown>;
  if (!Array.isArray(b['nodes'])) b['nodes'] = [];
  if (!Array.isArray(b['edges'])) b['edges'] = [];
  // selectSchedule only reads .nodes and .edges; cast is safe.
  return b as unknown as Board;
}

function hhmm(iso: string): string {
  // Extract HH:MM from "YYYY-MM-DDTHH:MM" or "YYYY-MM-DDTHH:MM:SS".
  const t = iso.split('T')[1];
  if (!t) return iso;
  return t.slice(0, 5);
}

/**
 * `krnl cal show [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--json]`
 * Prints all cascade-scheduled task placements, sorted by startISO.
 * --from / --to filter by date prefix (inclusive/exclusive boundary on the ISO string).
 */
export async function calShow(
  ctx: CalCtx,
  from: string | undefined,
  to: string | undefined,
  json = false,
): Promise<SysResult> {
  const board = loadBoard(ctx);
  if (!board) return { ok: false, message: 'Board not found or empty.' };

  const { placements } = selectSchedule(board);

  // Build taskId → {text, parentTodoId} lookup.
  const taskMeta = new Map<string, { text: string; parentTodoId: string }>();
  for (const n of board.nodes) {
    const node = n as SharedAnyNode;
    if (node.kind !== 'todo.task') continue;
    const ts = node.state as TaskState;
    if (ts.parentTaskId !== null) continue; // subtasks excluded
    taskMeta.set(node.id, { text: ts.text, parentTodoId: ts.parentTodoId });
  }

  // Filter by date range if provided (lexicographic comparison on ISO prefix).
  let filtered: ScheduledTaskPlacement[] = [...placements.values()];
  if (from) filtered = filtered.filter((p) => p.startISO >= from);
  if (to) {
    // Treat --to as exclusive upper bound (day prefix: "YYYY-MM-DD" < startISO date).
    filtered = filtered.filter((p) => p.startISO.slice(0, 10) < to);
  }
  filtered.sort((a, b) => a.startISO.localeCompare(b.startISO));

  if (json) {
    const payload = filtered.map((p) => ({
      ...p,
      text: taskMeta.get(p.taskId)?.text ?? '(unknown)',
    }));
    return { ok: true, message: JSON.stringify(payload), data: payload };
  }

  if (filtered.length === 0) {
    return { ok: true, message: 'No scheduled tasks.', data: [] };
  }

  const lines = filtered.map((p) => {
    const meta = taskMeta.get(p.taskId);
    const text = meta?.text ?? '(unknown)';
    const prefix = p.isAnchor ? '[A]' : ' -> ';
    const dateTag = p.startISO.slice(0, 10);
    const timeRange = `${hhmm(p.startISO)}-${hhmm(p.endISO)}`;
    const parallel = p.parallelGroupId !== null ? ` [p${p.parallelBranchIndex ?? 0}]` : '';
    return `${dateTag}  ${timeRange}${parallel}  ${prefix}  ${p.taskId.slice(0, 8)}  ${text}`;
  });

  return {
    ok: true,
    message: lines.join('\n'),
    data: filtered.map((p) => ({ ...p, text: taskMeta.get(p.taskId)?.text ?? '(unknown)' })),
  };
}
