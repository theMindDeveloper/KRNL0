// ADR 0002 — what the swap card needs about a habit let go on the Calendar.
// Decision 63: the Habit window's rows are carried by the one drag engine
// (CalendarNode/calendarDrag.ts, `choose: true`); the browser drag and its
// shared payload are gone. Only the payload's shape is left.

export interface HabitDragPayload {
  habitId: string;
  habitMotherId: string;
  color: string;
  name: string;
}
