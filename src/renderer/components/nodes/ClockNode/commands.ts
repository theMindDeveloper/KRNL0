import type { ClockState } from './types';

export const clockLinkTodo = (
  s: ClockState,
  args: { todoNodeId: string | null },
): ClockState => ({ ...s, linkedTodoId: args.todoNodeId });

// Decision 24.2 — replaces clockSetWindowStart (Decision 23.1).
// Pure FSM: any non-1 input collapses to 0 (defensive).
export const clockSetViewWindow = (
  s: ClockState,
  args: { window: 0 | 1 },
): ClockState => ({
  ...s,
  viewWindow: args.window === 1 ? 1 : 0,
});
