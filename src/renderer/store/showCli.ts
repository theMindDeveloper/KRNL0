// `krnl show …` in the window: the agent points at something on screen while
// it explains (a plan, a window, a day, any button). It never changes data —
// it moves the camera when needed and draws the shared highlight ring.

import { useBoardStore } from './boardStore';
import { clearHighlights, highlightElement, nodeElement } from './highlight';
import { focusNode, showTask } from './scheduleActions';
import { resolveNodeRef, resolveTodoItemRef } from '../../shared/dispatch/resolveRef';
import type { BoardShape } from '../../shared/dispatch/types';

export type ShowScope = 'auto' | 'plan' | 'node' | 'day' | 'ui';

export interface ShowArgs {
  sub: 'target' | 'clear';
  scope?: ShowScope;
  ref?: string;
  note?: string;
  seconds?: number;
}

export interface ShowResult { ok: boolean; message: string }

/** Window names the agent can say → node kind. */
const WINDOWS: Record<string, string> = {
  todo: 'todo', todos: 'todo', plans: 'todo',
  pomo: 'pomo', timer: 'pomo', pomodoro: 'pomo',
  habit: 'habit', habits: 'habit',
  calendar: 'calendar', cal: 'calendar',
  clock: 'clock',
  analytics: 'analytics', stats: 'analytics',
  terminal: 'term', term: 'term',
};

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayOf(ref: string): string | null {
  const r = ref.trim().toLowerCase();
  if (/^\d{4}-\d{2}-\d{2}$/.test(r)) return r;
  const d = new Date();
  if (r === 'today') return ymd(d);
  if (r === 'tomorrow') { d.setDate(d.getDate() + 1); return ymd(d); }
  if (r === 'yesterday') { d.setDate(d.getDate() - 1); return ymd(d); }
  return null;
}

function visible(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
}

/** Any part of the screen by its test id, label, title or text. */
export function findUi(ref: string): HTMLElement | null {
  const byId = document.querySelector(`[data-testid="${CSS.escape(ref)}"]`);
  if (byId && visible(byId)) return byId;
  const want = ref.trim().toLowerCase();
  const pool = Array.from(document.querySelectorAll('button, [role="button"], [role="tab"], a, input, textarea, [aria-label], [title], h1, h2, h3'))
    .filter(visible)
    .filter((el) => !el.closest('.krnl-highlight, [data-term]'));
  const words = (el: HTMLElement) => [el.getAttribute('aria-label'), el.getAttribute('title'), el.getAttribute('placeholder'), el.innerText]
    .filter((s): s is string => !!s).map((s) => s.trim().toLowerCase());
  return pool.find((el) => words(el).some((w) => w === want))
    ?? pool.find((el) => words(el).some((w) => w.length < 80 && w.includes(want)))
    ?? null;
}

function canvasMode(): boolean {
  return useBoardStore.getState().board?.layoutMode !== 'station';
}

function showNode(id: string, label: string, note: string | undefined, ms: number | undefined): ShowResult {
  const board = useBoardStore.getState().board;
  const node = board?.nodes.find((n) => n.id === id);
  if (!node) return { ok: false, message: `No ${label} on the board` };
  if (canvasMode() || !node.isMother) focusNode(id);
  window.setTimeout(() => {
    const el = nodeElement(id);
    if (el) highlightElement(el, { note, ms });
  }, 450);
  return { ok: true, message: `Highlighted ${label}` };
}

function showDay(day: string, note: string | undefined, ms: number | undefined): ShowResult {
  const board = useBoardStore.getState().board;
  const cal = board?.nodes.find((n) => n.kind === 'calendar' && n.isMother);
  if (!cal) return { ok: false, message: 'No Calendar on the board' };
  void import('../components/Canvas/commandDispatch').then(({ makeCommandHandler }) => {
    const send = makeCommandHandler(cal.id);
    const view = (cal.config as { view?: string }).view;
    if (view !== 'week' && view !== 'day') send('calendar.setView', { view: 'week' });
    send('calendar.setAnchor', { date: day });
    if (canvasMode()) focusNode(cal.id);
    window.setTimeout(() => {
      const cell = document.querySelector<HTMLElement>(`[data-testid="calendar-anytime-${CSS.escape(day)}"]`);
      const el = cell ?? nodeElement(cal.id);
      if (el) highlightElement(el, { note, ms });
    }, 500);
  });
  return { ok: true, message: `Highlighted ${day} on the Calendar` };
}

function showPlan(taskId: string, text: string, note: string | undefined): ShowResult {
  void showTask(taskId, note);
  return { ok: true, message: `Highlighted the plan "${text}" (its card, and its place on the Calendar if it has a day)` };
}

/** A plan by id, exact name, or a unique part of its name. */
function findPlan(board: BoardShape, ref: string): { taskId: string; text: string } | 'ambiguous' | null {
  const todo = board.nodes.find((n) => n.kind === 'todo' && n.isMother);
  const items = ((todo?.state as { items?: Array<{ id: string; text: string; taskNodeId: string | null }> } | undefined)?.items ?? [])
    .filter((i) => i.taskNodeId);
  const hit = resolveTodoItemRef(board, ref);
  if (hit.ok) {
    const it = items.find((i) => i.id === hit.id.itemId);
    if (it?.taskNodeId) return { taskId: it.taskNodeId, text: it.text };
  }
  const task = resolveNodeRef(board, ref, 'todo.task');
  if (task.ok) {
    const n = board.nodes.find((x) => x.id === task.id);
    return { taskId: task.id, text: (n?.state as { text?: string } | undefined)?.text ?? ref };
  }
  const want = ref.trim().toLowerCase();
  const parts = items.filter((i) => i.text.toLowerCase().includes(want));
  if (parts.length === 1) return { taskId: parts[0]!.taskNodeId!, text: parts[0]!.text };
  if (parts.length > 1) return 'ambiguous';
  return null;
}

export function runShow(args: ShowArgs): ShowResult {
  if (args.sub === 'clear') { clearHighlights(); return { ok: true, message: 'Highlights cleared' }; }
  const ref = (args.ref ?? '').trim();
  if (!ref) return { ok: false, message: 'show needs something to show: a plan name, a window (todo, calendar, pomo, habits, clock, analytics, terminal), a day, node <id> or ui "<label>"' };
  const note = args.note?.trim() || undefined;
  const ms = args.seconds ? Math.round(args.seconds * 1000) : undefined;
  const board = useBoardStore.getState().board as BoardShape | null;
  if (!board) return { ok: false, message: 'The board is not loaded yet' };
  const scope = args.scope ?? 'auto';

  if (scope === 'day' || (scope === 'auto' && dayOf(ref))) {
    const day = dayOf(ref);
    return day ? showDay(day, note, ms) : { ok: false, message: `"${ref}" is not a day (use YYYY-MM-DD, today, tomorrow)` };
  }
  if (scope === 'auto' && WINDOWS[ref.toLowerCase()]) {
    const kind = WINDOWS[ref.toLowerCase()]!;
    const mother = board.nodes.find((n) => n.kind === kind && n.isMother) ?? board.nodes.find((n) => n.kind === kind);
    return mother ? showNode(mother.id, `the ${ref.toLowerCase()} window`, note, ms) : { ok: false, message: `No ${ref} window on the board` };
  }
  if (scope === 'plan' || scope === 'auto') {
    const plan = findPlan(board, ref);
    if (plan === 'ambiguous') return { ok: false, message: `More than one plan matches "${ref}" — use more of its name or its id` };
    if (plan) return showPlan(plan.taskId, plan.text, note);
    if (scope === 'plan') return { ok: false, message: `No plan called "${ref}"` };
  }
  if (scope === 'node' || scope === 'auto') {
    const n = resolveNodeRef(board, ref);
    if (n.ok) return showNode(n.id, `node ${n.id.slice(0, 8)}`, note, ms);
    if (scope === 'node') return { ok: false, message: n.reason === 'ambiguous' ? `"${ref}" matches more than one node` : `No node "${ref}"` };
  }
  const el = findUi(ref);
  if (el) {
    highlightElement(el, { note, ms });
    return { ok: true, message: `Highlighted "${ref}" on the screen` };
  }
  return { ok: false, message: `Nothing on the screen matches "${ref}"` };
}
