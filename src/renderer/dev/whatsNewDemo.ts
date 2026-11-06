// TEMPORARY — demo data for the "What's new" tour (tours.ts `whats-new`).
// The tour fires `krnl:demo-seed` at its start and `krnl:demo-clear` at its
// end. Everything it adds is named "Demo · …" and goes through the normal
// commands (rule 5), so the clear step removes it the same way. Remove this
// file and the tour once the branch is reviewed.

import { useBoardStore } from '../store/boardStore';
import { saveBoard } from '../store/eventLog';
import { addPastSegment, deleteSegment } from '../store/scheduleActions';
import type { TaskState } from '../components/nodes/TaskNode/types';
import type { TodoState } from '../components/nodes/TodoNode/types';
import type { HabitState } from '../components/nodes/HabitNode/types';
import type { PomoState } from '../components/nodes/PomoNode/types';
import { uiSounds } from '../sfx/uiSounds';

export const DEMO_SEED_EVENT = 'krnl:demo-seed';
export const DEMO_CLEAR_EVENT = 'krnl:demo-clear';
const PREFIX = 'Demo · ';
const pad = (n: number) => String(n).padStart(2, '0');
const toLocalISO = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const H = 3_600_000;

const ymd = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

async function handler(nodeId: string) {
  const { makeCommandHandler } = await import('../components/Canvas/commandDispatch');
  return makeCommandHandler(nodeId);
}

const mother = (kind: string) => useBoardStore.getState().board?.nodes.find((n) => n.kind === kind && n.isMother);
const taskByText = (text: string) => useBoardStore.getState().board?.nodes.find((n) => n.kind === 'todo.task' && (n.state as TaskState).text === text);

/** Make a task done at `atMs` (task + its Todo row), as if it was ticked then. */
function backdateDone(taskId: string, atMs: number): void {
  const st = useBoardStore.getState();
  const task = st.board?.nodes.find((n) => n.id === taskId);
  if (!task) return;
  const ts = task.state as TaskState;
  st.updateNode(taskId, { state: { ...ts, done: true, completedAt: new Date(atMs).toISOString() } });
  const todo = st.board?.nodes.find((n) => n.id === ts.parentTodoId);
  if (todo) {
    const tds = todo.state as TodoState;
    st.updateNode(todo.id, { state: { ...tds, items: tds.items.map((i) => (i.id === ts.todoItemId ? { ...i, done: true, completedAt: new Date(atMs).toISOString() } : i)) } });
  }
}

export async function seedDemo(): Promise<void> {
  const todo = mother('todo');
  const cal = mother('calendar');
  const habitM = mother('habit');
  if (!todo || !cal) return;
  // Start from fresh demo items (a previous run may have left some).
  await clearDemo();
  uiSounds.quiet(1500);
  const now = Date.now();
  const addTodo = await handler(todo.id);
  const schedule = await handler(cal.id);
  const add = (text: string, durationMin: number) => addTodo('todo.add', { text: PREFIX + text, durationMin });

  // A — done today, ran long (88 of 60 min): the pill says "took 1h 28".
  add('write report', 60);
  const a = taskByText(`${PREFIX}write report`);
  if (a) {
    schedule('calendar.schedule', { taskId: a.id, scheduledFor: toLocalISO(new Date(now - 5 * H)) });
    addPastSegment(now - 5 * H, now - 5 * H + 88 * 60_000, a.id);
    (await handler(a.id))('task.toggle');
    // Make sure it reads as done, whatever the toggle path did.
    const after = taskByText(`${PREFIX}write report`);
    if (after && !(after.state as TaskState).done) backdateDone(after.id, now - 3.5 * H);
  }
  // B — done yesterday: gone from the canvas overnight, and from the Todo list (Analytics keeps it).
  add('read notes', 30);
  const b = taskByText(`${PREFIX}read notes`);
  if (b) backdateDone(b.id, now - 24 * H);
  // C — planned 3 h ago, never started: a missed block with REPLAN.
  add('gym', 60);
  const c = taskByText(`${PREFIX}gym`);
  if (c) schedule('calendar.schedule', { taskId: c.id, scheduledFor: toLocalISO(new Date(now - 3 * H)) });
  // D — later today: counts toward the Clock's ring.
  add('call the bank', 30);
  const d = taskByText(`${PREFIX}call the bank`);
  if (d) schedule('calendar.schedule', { taskId: d.id, scheduledFor: toLocalISO(new Date(now + 1 * H)) });
  // E — not planned: shows the PLAN button.
  add('plan me', 30);
  // G — for the tour's "tick it" step (so the other demo states stay put).
  add('tick me', 15);
  // F — planned and done on Monday: a full week mark.
  add('weekly review', 30);
  const f = taskByText(`${PREFIX}weekly review`);
  if (f) {
    const mon = new Date(now);
    mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
    mon.setHours(9, 0, 0, 0);
    if (mon.getTime() < now - 2 * H) {
      schedule('calendar.schedule', { taskId: f.id, scheduledFor: toLocalISO(mon) });
      backdateDone(f.id, mon.getTime() + 30 * 60_000);
    }
  }

  // Habits: "read" missed yesterday (repair), "walk" one day from 7 (seal).
  if (habitM) {
    const addHabit = await handler(habitM.id);
    addHabit('habit.add', { name: `${PREFIX}read` });
    addHabit('habit.add', { name: `${PREFIX}walk` });
    const st = useBoardStore.getState();
    const hm = st.board?.nodes.find((n) => n.id === habitM.id);
    if (hm) {
      const hs = hm.state as HabitState;
      const days = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => ymd(now - (from + i) * 24 * H));
      st.updateNode(hm.id, {
        state: {
          ...hs,
          habits: hs.habits.map((h) =>
            h.name === `${PREFIX}read` ? { ...h, log: days(2, 7) } : h.name === `${PREFIX}walk` ? { ...h, log: days(1, 6) } : h),
        },
      });
    }
  }
  const final = useBoardStore.getState().board;
  if (final) void saveBoard(final);
}

export async function clearDemo(): Promise<void> {
  const board = useBoardStore.getState().board;
  if (!board) return;
  uiSounds.quiet(1500);
  const demoTaskIds = new Set(board.nodes.filter((n) => n.kind === 'todo.task' && (n.state as TaskState).text.startsWith(PREFIX)).map((n) => n.id));
  const pomo = board.nodes.find((n) => n.kind === 'pomo');
  if (pomo) {
    for (const r of (pomo.state as PomoState).history) {
      const rec = r as { id?: string; taskId?: string | null };
      if (rec.id && rec.taskId && demoTaskIds.has(rec.taskId)) deleteSegment(rec.id);
    }
  }
  const todo = mother('todo');
  if (todo) {
    const remove = await handler(todo.id);
    for (const item of (todo.state as TodoState).items.filter((i) => i.text.startsWith(PREFIX))) remove('todo.remove', { id: item.id });
  }
  const habitM = mother('habit');
  if (habitM) {
    const remove = await handler(habitM.id);
    for (const h of (habitM.state as HabitState).habits.filter((x) => x.name.startsWith(PREFIX))) remove('habit.remove', { id: h.id });
  }
  const final = useBoardStore.getState().board;
  if (final) void saveBoard(final);
}

let installed = false;
export function installWhatsNewDemo(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener(DEMO_SEED_EVENT, () => { void seedDemo(); });
  window.addEventListener(DEMO_CLEAR_EVENT, () => { void clearDemo(); });
}
