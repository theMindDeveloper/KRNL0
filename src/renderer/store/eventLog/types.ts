/**
 * EventLog — central in-memory event stream for KRNL.
 *
 * Issue #133 — locked v1 contract. Bounded ring buffer, renderer-only.
 * Foundation for the KRNL Dock terminal feed + downstream analytics/audit.
 */

export type EventKind =
  | 'task.created' | 'task.completed' | 'task.deleted' | 'task.reordered'
  | 'habit.checkin' | 'habit.uncheck' | 'habit.created' | 'habit.deleted'
  | 'pomo.start' | 'pomo.complete' | 'pomo.stop'
  | 'node.added' | 'node.removed' | 'node.moved'
  | 'mother.shown' | 'mother.hidden' | 'mother.swapped'
  | 'frame.created' | 'frame.resized'
  | 'board.saved' | 'board.loaded'
  | 'sys.cmd'
  | 'sys.error';

export type EventSeverity = 'ok' | 'info' | 'warn' | 'err';

export interface EventEntry {
  id: string;
  ts: number;
  kind: EventKind;
  severity: EventSeverity;
  text: string;
  refId?: string;
}

export const EVENT_LOG_MAX = 200;
