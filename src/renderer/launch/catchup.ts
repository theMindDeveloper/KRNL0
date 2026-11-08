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
  /** The task's tag, if any. */
  tag?: string;
  /** Tasks chained after this one, in order (they move with it). `time` is
   *  set when the follower itself slipped: it moves to the same day too. */
  followers: Array<{ id: string; text: string; time?: string }>;
}

export interface HabitCatchup {
  id: string;
  name: string;
  current: number;
  best: number;
  /** The streak ended while away (current 0, there was a run before). */
  broken: boolean;
  /** Done days, for the week grid. */
  log: string[];
  /** Colour token name (acid, cyan, …). */
  color: string;
}

export interface Catchup {
  today: string;
  tasks: SlippedTask[];
  habits: HabitCatchup[];
}

const rec = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {});

/** Longest run of logged scheduled days — the Habit node's own rule (engagement.md F16). */
export { bestStreak } from '../components/nodes/HabitNode/commands';
import { bestStreak } from '../components/nodes/HabitNode/commands';

export function computeCatchup(board: CatchupBoard, today: string): Catchup {
  const tasks = new Map<string, NodeLike>();
  for (const n of board.nodes) if (n.kind === 'todo.task') tasks.set(n.id, n);

  const nexts = new Map<string, string[]>();
  const prevs = new Map<string, string[]>();
  for (const e of board.edges) {
    if (e.from.event !== 'task.next') continue;
    if (!tasks.has(e.from.nodeId) || !tasks.has(e.to.nodeId)) continue;
    nexts.set(e.from.nodeId, [...(nexts.get(e.from.nodeId) ?? []), e.to.nodeId]);
    prevs.set(e.to.nodeId, [...(prevs.get(e.to.nodeId) ?? []), e.from.nodeId]);
  }

  // Slipped: planned before today and not done.
  const isSlipped = (id: string): boolean => {
    const s = rec(tasks.get(id)?.state);
    const day = (typeof s['scheduledFor'] === 'string' ? s['scheduledFor'] : '').slice(0, 10);
    return s['done'] !== true && /^\d{4}-\d{2}-\d{2}$/.test(day) && day < today;
  };
  // A slipped task moves with an earlier slipped task in its chain (it is
  // listed under it). Only then: a done or not-yet-due head carries nothing,
  // so the task is a head itself.
  const hasSlippedAncestor = (id: string): boolean => {
    const seen = new Set<string>([id]);
    let frontier = prevs.get(id) ?? [];
    while (frontier.length > 0 && seen.size < 200) {
      const up: string[] = [];
      for (const p of frontier) {
        if (seen.has(p)) continue;
        seen.add(p);
        if (isSlipped(p)) return true;
        up.push(...(prevs.get(p) ?? []));
      }
      frontier = up;
    }
    return false;
  };

  const slipped: SlippedTask[] = [];
  for (const n of tasks.values()) {
    const s = rec(n.state);
    const at = typeof s['scheduledFor'] === 'string' ? s['scheduledFor'] : '';
    const day = at.slice(0, 10);
    if (!isSlipped(n.id)) continue;
    if (hasSlippedAncestor(n.id)) continue; // it moves with that head
    const followers: Array<{ id: string; text: string; time?: string }> = [];
    const seen = new Set<string>([n.id]);
    let frontier = nexts.get(n.id) ?? [];
    while (frontier.length > 0 && followers.length < 20) {
      const next: string[] = [];
      for (const id of frontier) {
        if (seen.has(id)) continue;
        seen.add(id);
        const fs = rec(tasks.get(id)?.state);
        if (fs['done'] !== true) {
          const fAt = typeof fs['scheduledFor'] === 'string' ? fs['scheduledFor'] : '';
          followers.push({ id, text: String(fs['text'] ?? 'Untitled'), ...(isSlipped(id) ? { time: fAt.slice(11, 16) || '09:00' } : {}) });
        }
        next.push(...(nexts.get(id) ?? []));
      }
      frontier = next;
    }
    slipped.push({ id: n.id, text: String(s['text'] ?? 'Untitled'), wasDay: day, time: at.slice(11, 16) || '09:00', followers, ...(typeof s['tag'] === 'string' && s['tag'] ? { tag: s['tag'] } : {}) });
  }
  slipped.sort((a, b) => (a.wasDay === b.wasDay ? a.text.localeCompare(b.text) : a.wasDay.localeCompare(b.wasDay)));

  const habits: HabitCatchup[] = [];
  const mother = board.nodes.find((n) => n.kind === 'habit' && n.isMother === true);
  const list = rec(mother?.state)['habits'];
  if (Array.isArray(list)) {
    for (const raw of list) {
      const h = rec(raw);
      // Routines are never ticked, so never "broken" (Decision 39).
      if (h['archived'] === true || h['kind'] === 'routine' || typeof h['id'] !== 'string') continue;
      // A weekly target ("3 a week") has no missed days to catch up on.
      if (typeof h['perWeek'] === 'number') continue;
      const log = Array.isArray(h['log']) ? h['log'].filter((d): d is string => typeof d === 'string') : [];
      const schedule = h['schedule'] as HabitSchedule | undefined;
      const rest = Array.isArray(h['rest']) ? h['rest'].filter((d): d is string => typeof d === 'string') : [];
      const current = calcStreak(log, today, schedule, rest);
      const best = bestStreak(log, schedule, rest);
      if (current === 0 && best < 2) continue;
      habits.push({ id: h['id'], name: String(h['name'] ?? 'Habit'), current, best, broken: current === 0, log, color: typeof h['color'] === 'string' ? h['color'] : 'acid' });
    }
  }
  habits.sort((a, b) => Number(b.broken) - Number(a.broken) || b.best - a.best);
  return { today, tasks: slipped, habits: habits.slice(0, 4) };
}

/** The new plan for a moved task: the same time of day on `day`. */
export function movedSchedule(task: Pick<SlippedTask, 'time'>, day: string): string {
  return `${day}T${task.time}`;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');
const localMinute = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

/**
 * Where moved tasks land on `day` (launch-experience.md F27). Another day keeps
 * each task's time. Today, a time already past would read "Missed" the moment
 * it lands, so those tasks are lined up from the next quarter hour after now,
 * in their old order, each as long as its plan; times still ahead are kept.
 */
export function landingTimes(
  items: ReadonlyArray<{ id: string; time: string; lengthMin: number }>,
  day: string,
  today: string,
  nowMs: number,
  /** Other plans already on that day (epoch-ms spans) that the moved tasks must not land on. */
  others: ReadonlyArray<readonly [number, number]> = [],
): Map<string, string> {
  const out = new Map<string, string>();
  if (day !== today) {
    for (const it of items) out.set(it.id, `${day}T${it.time}`);
    return out;
  }
  const quarter = 15 * 60_000;
  const lenMs = (it: { lengthMin: number }) => Math.max(5, Math.round(it.lengthMin)) * 60_000;
  // Plans still ahead keep their time; the ones that slipped fill free time
  // after now, around them — landing never makes a new clash.
  const busy: Array<[number, number]> = others.map(([a, b]) => [a, b]);
  const slipped: Array<{ id: string; time: string; lengthMin: number }> = [];
  for (const it of [...items].sort((a, b) => a.time.localeCompare(b.time))) {
    const at = new Date(`${day}T${it.time}:00`).getTime();
    if (Number.isFinite(at) && at >= nowMs) { out.set(it.id, `${day}T${it.time}`); busy.push([at, at + lenMs(it)]); }
    else slipped.push(it);
  }
  let cursor = Math.ceil(nowMs / quarter) * quarter;
  for (const it of slipped) {
    const len = lenMs(it);
    for (let hit = busy.find(([a, b]) => cursor < b && a < cursor + len); hit; hit = busy.find(([a, b]) => cursor < b && a < cursor + len)) {
      cursor = Math.ceil(hit[1] / (5 * 60_000)) * 5 * 60_000;
    }
    out.set(it.id, localMinute(cursor));
    busy.push([cursor, cursor + len]);
    cursor += len;
  }
  return out;
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
