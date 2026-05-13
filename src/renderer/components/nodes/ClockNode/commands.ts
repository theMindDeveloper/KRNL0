import type { ClockState } from './types';

export const clockLinkTodo = (
  s: ClockState,
  args: { todoNodeId: string | null },
): ClockState => ({ ...s, linkedTodoId: args.todoNodeId });

export const clockSetWindowStart = (
  s: ClockState,
  args: { hour: number },
): ClockState => ({
  ...s,
  windowStartHour: Math.max(0, Math.min(23, Math.round(args.hour))),
});
