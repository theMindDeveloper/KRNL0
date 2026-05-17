// Shared task tone palette. Stable per-taskId color used by Clock, Calendar,
// and Todo so users can visually link the same task across all three surfaces.

export const TASK_TONE_PALETTE = [
  'rust',
  'spine',
  'cyan',
  'plum',
  'rust-deep',
  'amber',
] as const;

export type TaskTone = (typeof TASK_TONE_PALETTE)[number];

export const TASK_TONE_VAR: Record<TaskTone, string> = {
  rust: 'var(--rust)',
  spine: 'var(--spine)',
  cyan: 'var(--cyan)',
  plum: 'var(--plum)',
  'rust-deep': 'var(--rust-deep)',
  amber: 'var(--amber)',
};

/** Deterministic tone for a task — stable for a given taskId across renders. */
export function colorForTask(taskId: string): TaskTone {
  let h = 0;
  for (let i = 0; i < taskId.length; i++) h = (h * 31 + taskId.charCodeAt(i)) >>> 0;
  return TASK_TONE_PALETTE[h % TASK_TONE_PALETTE.length]!;
}

export function toneVarForTask(taskId: string): string {
  return TASK_TONE_VAR[colorForTask(taskId)];
}
