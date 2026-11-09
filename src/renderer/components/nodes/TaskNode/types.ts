// Decision 28 — task kind discriminator.
export type TaskKind = 'focus' | 'event';

export interface TaskState {
  text: string;
  done: boolean;
  tag?: string;
  durationMin: number;
  eta: string;            // human-readable ETA, e.g. "~20 min"
  sequenceNumber: number; // 1-based ordinal among sibling tasks (F1)
  layer: number;          // nesting depth; 0 = direct child of mother (F1)
  createdAt: string;      // ISO
  parentTodoId: string;   // mother-todo id
  parentTaskId: string | null;   // Decision 20: null = root task, else parent task node id
  todoItemId: string | null;     // Decision 20: back-link to TodoItem.id
  pomoSessionsCompleted: number; // number of completed pomo sessions for this task
  // Decision 22 — per-task pomodoro accounting:
  plannedMin: number;            // total minutes budgeted for this task (default = pomo.sessionMin)
  /** No duration was given: plannedMin is only a placeholder for layout, and
   *  Calendar / Clock draw the block open-ended (fading out at the end).
   *  Cleared as soon as a duration is set. */
  timeOpen?: boolean;
  secondsAccumulated: number;    // total seconds spent across all pomo sessions for this task
  currentSessionElapsedSec: number; // in-flight session checkpoint (cleared on session end)
  // ADR 0001 — Calendar integration (Slice 1). Both fields are optional so
  // existing boards load unchanged (absence = unscheduled).
  scheduledFor?: string;         // ISO 8601 local datetime, e.g. "2026-05-20T14:30"
  scheduledDurationMin?: number; // optional override for calendar block height
  // Issue #134 — set when done flips false→true; cleared when true→false.
  // Legacy `done: true` rows lack this field; analytics buckets exclude them.
  completedAt?: string;          // ISO 8601
  // Decision 28 — kind discriminator. Default 'focus' for back-compat (migration in board.ts).
  kind: TaskKind;
  // Free-form text note shown under the task body. Empty/missing = no note.
  note?: string;
  // Review 4.1 — remind this many minutes before it starts (0 = at the start).
  // Absent = no reminder. Fires only while it is on the Calendar.
  remindMin?: number;
}

export interface TaskConfig {
  showDuration: boolean;
}

export const defaultTaskConfig = (): TaskConfig => ({ showDuration: true });
