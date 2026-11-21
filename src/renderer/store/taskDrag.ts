// Decision 60 — what is being dragged onto the Calendar, from anywhere (a Todo
// row, a task card's grip, a Calendar block, a canvas card), so the Calendar
// can show ONE preview for all of them: the plan as a soft block at the slot
// it would land on. A browser drag only reveals its data on drop, so the
// sources note it here when the drag starts; any drop or drag end clears it.

export interface TaskDragInfo {
  taskId?: string;
  itemId?: string;
  durationMin?: number;
}

let current: TaskDragInfo | null = null;
let installed = false;

export function beginTaskDragInfo(info: TaskDragInfo): void {
  current = info;
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const clear = (): void => { current = null; };
  window.addEventListener('dragend', clear, true);
  window.addEventListener('drop', () => window.setTimeout(clear, 0), true);
}

export function taskDragInfo(): TaskDragInfo | null {
  return current;
}

export function endTaskDragInfo(): void {
  current = null;
}
