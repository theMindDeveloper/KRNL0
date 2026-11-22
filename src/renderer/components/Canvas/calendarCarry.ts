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
export function calendarCarryMove(id: string, item: DragItem, x: number, y: number): void {
  const over = externalDragMove(item, x, y);
  const el = document.querySelector(`.react-flow__node[data-id="${CSS.escape(id)}"]`);
  if (el) { if (over) el.setAttribute('data-over-calendar', '1'); else el.removeAttribute('data-over-calendar'); }
}
export function calendarCarryEnd(id: string): void {
  const node = document.querySelector(`.react-flow__node[data-id="${CSS.escape(id)}"]`);
  node?.removeAttribute('data-over-calendar');
  window.setTimeout(() => node?.removeAttribute('data-calendar-carry'), 220);
}
