/**
 * useEventLog — central event log store (zustand, in-memory ring buffer).
 *
 * Issue #133.
 *
 * Usage (read):
 *   import { useEventLog } from '@/renderer/store/eventLog';
 *   const tail = useEventLog(s => s.entries.slice(-20));
 *
 * Usage (write):
 *   import { emit } from '@/renderer/store/eventLog';
 *   emit('task.completed', 'task #A42 completed', { refId: 'task-...' });
 *
 * The store is renderer-only, in-memory only, capped at EVENT_LOG_MAX (200).
 * Oldest entries are dropped on overflow. No persistence — entries reset on
 * app reload.
 */

import { create } from 'zustand';
import type { EventEntry, EventKind, EventSeverity } from './types';
import { EVENT_LOG_MAX } from './types';

let _idCounter = 0;
function nextId(): string {
  _idCounter += 1;
  return `e${_idCounter.toString(36)}`;
}

export interface EventLogState {
  entries: EventEntry[];
  push(e: { kind: EventKind; severity?: EventSeverity; text: string; refId?: string }): void;
  clear(): void;
}

export const useEventLog = create<EventLogState>((set) => ({
  entries: [],
  push: (e) => {
    const entry: EventEntry = {
      id: nextId(),
      ts: Date.now(),
      kind: e.kind,
      severity: e.severity ?? 'ok',
      text: e.text,
      ...(e.refId !== undefined ? { refId: e.refId } : {}),
    };
    set((s) => {
      const next = s.entries.length >= EVENT_LOG_MAX
        ? [...s.entries.slice(s.entries.length - EVENT_LOG_MAX + 1), entry]
        : [...s.entries, entry];
      return { entries: next };
    });
  },
  clear: () => {
    _idCounter = 0;
    set({ entries: [] });
  },
}));

/** Test-only — reset module state between cases. */
export function __resetEventLogForTests(): void {
  _idCounter = 0;
  useEventLog.setState({ entries: [] });
}
