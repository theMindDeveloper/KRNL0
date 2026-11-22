/**
 * Decision 63 — a card carried from the canvas to a Calendar (a task, a habit,
 * an event) goes through the one drag engine (calendarDrag.ts). The canvas
 * moves the card; the engine draws the ghost and its time line and lands it.
 */
import { externalDragMove, type DragItem } from '../nodes/CalendarNode/calendarDrag';
import { HABIT_COLORS, isOneTimeEvent, isRoutine, type HabitState } from '../nodes/HabitNode/types';
import type { TaskState } from '../nodes/TaskNode/types';
import type { Node as KrnlNode } from '../../../shared/types/node';
import { useBoardStore } from '../../store/boardStore';
import { toneVarForTask } from '../../utils/taskColor';

/** What a canvas card is, as the engine carries it (null: not a card the Calendar takes). */
export function canvasDragItem(node: KrnlNode | undefined): DragItem | null {
  if (!node) return null;
  if (node.kind === 'todo.task') {
    const st = node.state as TaskState;
    const len = st.plannedMin > 0 ? st.plannedMin : 25;
    return { kind: 'task', id: node.id, name: st.text, tone: toneVarForTask(node.id), lenMin: len, plannedMin: len };
  }
  if (node.kind === 'habit.lane') {
    const habitId = (node.state as { habitId?: string } | null)?.habitId;
    const board = useBoardStore.getState().board;
    const h = board?.nodes.flatMap((n) => (n.kind === 'habit' ? ((n.state as HabitState | null)?.habits ?? []) : [])).find((x) => x.id === habitId);
    if (!h || !h.schedule) return null;
    const tone = `var(--${(HABIT_COLORS as readonly string[]).includes(h.color) ? h.color : 'acid'})`;
    const len = h.schedule.durationMin && h.schedule.durationMin > 0 ? h.schedule.durationMin : 30;
    if (!isRoutine(h)) return { kind: 'habit', id: h.id, name: h.name, tone, lenMin: len };
    const repeat = isOneTimeEvent(h) ? 'once' : h.schedule.kind === 'daily' ? 'daily' : 'weekly';
    return { kind: 'event', id: h.id, name: h.name, tone, lenMin: len, repeat };
  }
  return null;
}
/**
 * Over the Calendar the card goes into the small box at the pointer
 * (data-over-calendar on its wrapper, shrinking around the point it was
 * grabbed by), so it never covers the hours.
 */
export function calendarCarryStart(id: string, x: number, y: number): void {
  // A card left half-carried by a drag that never ended (the pointer let go
  // outside the window) is whole again: no invisible card with live dots.
  for (const stuck of Array.from(document.querySelectorAll<HTMLElement>('.react-flow__node[data-over-calendar], .react-flow__node[data-calendar-carry]'))) {
    if (stuck.dataset['id'] !== id) { stuck.removeAttribute('data-over-calendar'); stuck.removeAttribute('data-calendar-carry'); }
  }
  const el = document.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(id)}"]`);
  // Only this card animates into the package (a transition on every card cost the whole canvas).
  el?.setAttribute('data-calendar-carry', '1');
  if (el && el.offsetWidth > 0) {
    // Each part of the card (the card, its connection dots) shrinks toward
    // the pointer, measured in its own box.
    const zoom = el.getBoundingClientRect().width / el.offsetWidth || 1;
    for (const part of Array.from(el.children) as HTMLElement[]) {
      const r = part.getBoundingClientRect();
      part.style.setProperty('--grab-x', `${Math.round((x - r.left) / zoom)}px`);
      part.style.setProperty('--grab-y', `${Math.round((y - r.top) / zoom)}px`);
    }
  }
}
/** Moves the carried card; true while it is over a Calendar's slots (then it is in the box, unseen). */
export function calendarCarryMove(id: string, item: DragItem, x: number, y: number): boolean {
  const over = externalDragMove(item, x, y);
  const el = document.querySelector(`.react-flow__node[data-id="${CSS.escape(id)}"]`);
  // Only when it changes (no style work on every move).
  if (el && el.hasAttribute('data-over-calendar') !== over) {
    if (over) el.setAttribute('data-over-calendar', '1'); else el.removeAttribute('data-over-calendar');
  }
  return over;
}
export function calendarCarryEnd(id: string): void {
  const node = document.querySelector(`.react-flow__node[data-id="${CSS.escape(id)}"]`);
  node?.removeAttribute('data-over-calendar');
  window.setTimeout(() => node?.removeAttribute('data-calendar-carry'), 220);
}
/**
 * Decision 63 (owner, 2026-11-22) — landed on a Calendar: the card stays
 * unseen while the canvas puts it back in its own place (no growing back over
 * the hours, no flight across the canvas), like a repeating event that is
 * simply where it was let go. Call calendarCarryShowHome once it is drawn there.
 */
export function calendarCarryLanded(id: string): void {
  // No transition while it goes home (it stays in the box, unseen).
  document.querySelector(`.react-flow__node[data-id="${CSS.escape(id)}"]`)?.removeAttribute('data-calendar-carry');
}
/** The card is drawn in its own place again: it fades in there. */
export function calendarCarryShowHome(id: string): void {
  const node = document.querySelector(`.react-flow__node[data-id="${CSS.escape(id)}"]`);
  if (!node) return;
  node.removeAttribute('data-over-calendar');
  node.setAttribute('data-calendar-back', '1');
  window.setTimeout(() => node.removeAttribute('data-calendar-back'), 220);
}
