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
 *
 * Both --from and --to are INCLUSIVE date bounds (compared against the
 * YYYY-MM-DD prefix of startISO). `--from 2026-05-18 --to 2026-05-18`
 * returns every task whose start date is 2026-05-18. The earlier
 * exclusive-upper-bound behaviour was a footgun: same-day --from/--to
 * pairs returned [], which was the exact filter shape the AI assistant
 * reaches for when asked "show me tomorrow's calendar" (user report
 * 2026-05-17 r2).
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

  // Filter by date range if provided. Both bounds are inclusive on the
  // YYYY-MM-DD date prefix of startISO. --from matches `startISO >= from`
  // (already inclusive because "2026-05-18" <= "2026-05-18T07:00"). --to
  // must use `<=` on the date prefix so same-day windows like
  // `--from 2026-05-18 --to 2026-05-18` actually return that day.
  let filtered: ScheduledTaskPlacement[] = [...placements.values()];
  if (from) filtered = filtered.filter((p) => p.startISO >= from);
  if (to) filtered = filtered.filter((p) => p.startISO.slice(0, 10) <= to);
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
