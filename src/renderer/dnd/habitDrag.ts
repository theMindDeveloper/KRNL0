// ADR 0002 — Shared drag-state singleton for habit drag-and-drop.
// HTML5 DragEvent.dataTransfer.getData() returns '' during dragover (browser
// security restriction). This module holds the payload in memory so the
// Calendar WeekView can read it while the chooser is open.
//
// Pattern:
//   HabitNode.WeekRow / MonthRow — calls setHabitDrag(payload) on dragStart,
//     clearHabitDrag() on dragEnd.
//   CalendarNode.WeekView — calls getHabitDrag() inside onPick to retrieve
//     the payload and dispatch calendar.scheduleHabit.

export interface HabitDragPayload {
  habitId: string;
  habitMotherId: string;
  color: string;
  name: string;
}

let _current: HabitDragPayload | null = null;

/** Call from HabitRow.onDragStart. */
export function setHabitDrag(payload: HabitDragPayload): void {
  _current = payload;
}

/** Call from HabitRow.onDragEnd to prevent stale reads. */
export function clearHabitDrag(): void {
  _current = null;
}

/** Call from WeekView.onPick / MonthView.onDrop to read the payload. */
export function getHabitDrag(): HabitDragPayload | null {
  return _current;
}
