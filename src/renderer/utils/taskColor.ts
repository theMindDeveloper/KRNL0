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

/** Deterministic tone for a task — stable for a given taskId across renders.
 *
 * Uses FNV-1a + a final xorshift avalanche. The old `h*31` hash collapsed:
 * 31 ≡ 1 (mod 6), so `h % 6` reduced to (sum of char codes) mod 6 and lost all
 * positional entropy — task ids sharing the "task-" prefix and similar UUID
 * shape clustered onto the same few tones. The avalanche makes every output bit
 * depend on every input bit, so `% palette.length` spreads evenly. */
export function colorForTask(taskId: string): TaskTone {
  let h = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < taskId.length; i++) {
    h ^= taskId.charCodeAt(i);
    h = Math.imul(h, 0x01000193); // FNV prime
  }
  // xorshift avalanche so low bits aren't a simple function of the input.
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = (h >>> 0);
  return TASK_TONE_PALETTE[h % TASK_TONE_PALETTE.length]!;
}

export function toneVarForTask(taskId: string): string {
  return TASK_TONE_VAR[colorForTask(taskId)];
}
