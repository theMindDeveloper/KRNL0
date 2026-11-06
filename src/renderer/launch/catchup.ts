// "Welcome back" catch-up (launch-experience.md F12–F15).
//
// Pure: what slipped while KRNL0 was closed. Tasks whose planned day is
// before today and are not done, grouped so only the head of a chain gets
// buttons (chained tasks follow the first one), and habits whose streak broke
// or is still going. Shared by the dialog and `krnl catchup`. Nothing here
// changes the board: every fix is a button the user presses.

import { calcStreak } from '../components/nodes/HabitNode/commands';
import { isDayScheduled } from '../components/nodes/HabitNode/types';
import type { HabitSchedule } from '../components/nodes/HabitNode/types';

interface NodeLike { id: string; kind: string; isMother?: boolean; state?: unknown }
interface EdgeLike { from: { nodeId: string; event: string }; to: { nodeId: string } }
export interface CatchupBoard { nodes: readonly NodeLike[]; edges: readonly EdgeLike[] }

export interface SlippedTask {
  id: string;
  text: string;
  /** "YYYY-MM-DD" the task was planned for. */
  wasDay: string;
  /** "HH:mm" part of the plan, kept when the task is moved. */
  time: string;
  /** Tasks chained after this one, in order (they move with it). */
  followers: Array<{ id: string; text: string }>;
}

export interface HabitCatchup {
  id: string;
  name: string;
  current: number;
  best: number;
  /** The streak ended while away (current 0, there was a run before). */
  broken: boolean;
}

export interface Catchup {
  today: string;
  tasks: SlippedTask[];
  habits: HabitCatchup[];
}

const rec = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {});

function nextDay(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Longest run of logged scheduled days (non-scheduled days neither extend nor break it). */
export function bestStreak(log: readonly string[], schedule?: HabitSchedule): number {
  if (log.length === 0) return 0;
  const days = [...new Set(log)].sort();
  const seen = new Set(days);
  let best = 0;
  let run = 0;
  let cursor = days[0]!;
  const last = days[days.length - 1]!;
  let guard = 0;
  while (cursor <= last && guard++ < 4000) {
    if (isDayScheduled(schedule, cursor)) {
      if (seen.has(cursor)) { run++; best = Math.max(best, run); } else run = 0;
    }
    cursor = nextDay(cursor);
  }
  return best;
}

export function computeCatchup(board: CatchupBoard, today: string): Catchup {
  const tasks = new Map<string, NodeLike>();
  for (const n of board.nodes) if (n.kind === 'todo.task') tasks.set(n.id, n);

  const nexts = new Map<string, string[]>();
  const hasPrev = new Set<string>();
  for (const e of board.edges) {
    if (e.from.event !== 'task.next') continue;
    if (!tasks.has(e.from.nodeId) || !tasks.has(e.to.nodeId)) continue;
    nexts.set(e.from.nodeId, [...(nexts.get(e.from.nodeId) ?? []), e.to.nodeId]);
    hasPrev.add(e.to.nodeId);
  }

  const slipped: SlippedTask[] = [];
  for (const n of tasks.values()) {
    const s = rec(n.state);
    const at = typeof s['scheduledFor'] === 'string' ? s['scheduledFor'] : '';
    const day = at.slice(0, 10);
    if (s['done'] === true || !/^\d{4}-\d{2}-\d{2}$/.test(day) || day >= today) continue;
    if (hasPrev.has(n.id)) continue; // a follower moves with its head
    const followers: Array<{ id: string; text: string }> = [];
    const seen = new Set<string>([n.id]);
    let frontier = nexts.get(n.id) ?? [];
    while (frontier.length > 0 && followers.length < 20) {
      const next: string[] = [];
      for (const id of frontier) {
        if (seen.has(id)) continue;
        seen.add(id);
        const fs = rec(tasks.get(id)?.state);
        if (fs['done'] !== true) followers.push({ id, text: String(fs['text'] ?? 'Untitled') });
        next.push(...(nexts.get(id) ?? []));
      }
      frontier = next;
    }
    slipped.push({ id: n.id, text: String(s['text'] ?? 'Untitled'), wasDay: day, time: at.slice(11, 16) || '09:00', followers });
  }
  slipped.sort((a, b) => (a.wasDay === b.wasDay ? a.text.localeCompare(b.text) : a.wasDay.localeCompare(b.wasDay)));

  const habits: HabitCatchup[] = [];
  const mother = board.nodes.find((n) => n.kind === 'habit' && n.isMother === true);
  const list = rec(mother?.state)['habits'];
  if (Array.isArray(list)) {
    for (const raw of list) {
      const h = rec(raw);
      if (h['archived'] === true || typeof h['id'] !== 'string') continue;
      const log = Array.isArray(h['log']) ? h['log'].filter((d): d is string => typeof d === 'string') : [];
      const schedule = h['schedule'] as HabitSchedule | undefined;
      const current = calcStreak(log, today, schedule);
      const best = bestStreak(log, schedule);
      if (current === 0 && best < 2) continue;
      habits.push({ id: h['id'], name: String(h['name'] ?? 'Habit'), current, best, broken: current === 0 });
    }
  }
  habits.sort((a, b) => Number(b.broken) - Number(a.broken) || b.best - a.best);
  return { today, tasks: slipped, habits: habits.slice(0, 4) };
}

/** The new plan for a moved task: the same time of day on `day`. */
export function movedSchedule(task: Pick<SlippedTask, 'time'>, day: string): string {
  return `${day}T${task.time}`;
}

/** Nothing slipped and no habit to mention: the dialog has nothing to say. */
export function isEmptyCatchup(c: Catchup): boolean {
  return c.tasks.length === 0 && c.habits.length === 0;
}

export function describeCatchup(c: Catchup): string {
  if (isEmptyCatchup(c)) return 'Nothing slipped. Your board is as you left it.';
  const lines: string[] = [];
  if (c.tasks.length > 0) {
    lines.push(`${c.tasks.length} task${c.tasks.length === 1 ? '' : 's'} passed their day:`);
    for (const t of c.tasks) {
      lines.push(`  ${t.text}  (was ${t.wasDay}, id ${t.id})`);
      for (const f of t.followers) lines.push(`    ↳ ${f.text}  (follows the task above)`);
    }
  }
  if (c.habits.length > 0) {
    lines.push('Habits:');
    for (const h of c.habits) {
      lines.push(h.broken ? `  ${h.name}: streak ended · best ${h.best}` : `  ${h.name}: ${h.current} in a row · still going`);
    }
  }
  return lines.join('\n');
}
