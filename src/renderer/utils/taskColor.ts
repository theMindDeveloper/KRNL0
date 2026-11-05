// Task colours. Every task you still have (not archived) gets its own colour,
// the same on the Clock, Calendar, Todo and pickers (#207).
//
//   - 18 colours (`--task-1` … `--task-18` in tokens.css, tuned per theme).
//   - Assignment (assignTaskColors): tasks in creation order; each starts at a
//     slot picked from its id (looks random) and moves on to the next free
//     slot when that one is taken. Earlier tasks keep their colour when a new
//     one is added; an archived task frees its colour for new tasks.
//   - The live assignment is pushed in by store/taskColors.ts (a board-store
//     subscription), so toneVarForTask(id) stays a plain function.

export const TASK_COLOR_COUNT = 18;

/** Legacy named tones (kept for callers that need a named token). */
export const TASK_TONE_PALETTE = ['rust', 'spine', 'cyan', 'plum', 'rust-deep', 'amber'] as const;
export type TaskTone = (typeof TASK_TONE_PALETTE)[number];
export const TASK_TONE_VAR: Record<TaskTone, string> = {
  rust: 'var(--rust)',
  spine: 'var(--spine)',
  cyan: 'var(--cyan)',
  plum: 'var(--plum)',
  'rust-deep': 'var(--rust-deep)',
  amber: 'var(--amber)',
};

/** FNV-1a + xorshift avalanche — an even spread for similar ids. */
export function hashTaskId(taskId: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < taskId.length; i++) {
    h ^= taskId.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return h >>> 0;
}

/** Old 6-tone hash (fallback only). */
export function colorForTask(taskId: string): TaskTone {
  return TASK_TONE_PALETTE[hashTaskId(taskId) % TASK_TONE_PALETTE.length]!;
}

/**
 * Distinct colour slots for the given tasks (pure). With more tasks than
 * colours, the extra ones share — the earliest tasks keep unique colours.
 */
export function assignTaskColors(tasks: ReadonlyArray<{ id: string; createdAt?: string }>, count = TASK_COLOR_COUNT): Map<string, number> {
  const ordered = tasks.slice().sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '') || a.id.localeCompare(b.id));
  const used = new Set<number>();
  const out = new Map<string, number>();
  for (const t of ordered) {
    const start = hashTaskId(t.id) % count;
    let slot = start;
    if (used.size < count) {
      while (used.has(slot)) slot = (slot + 1) % count;
    }
    used.add(slot);
    out.set(t.id, slot);
  }
  return out;
}

let assigned: ReadonlyMap<string, number> = new Map();

/** Set by store/taskColors.ts whenever the set of active tasks changes. */
export function setTaskColorAssignments(map: ReadonlyMap<string, number>): void {
  assigned = map;
}

/** The colour slot (0-based) of a task: its assigned one, else from its id. */
export function taskColorSlot(taskId: string): number {
  return assigned.get(taskId) ?? hashTaskId(taskId) % TASK_COLOR_COUNT;
}

/** CSS colour of a task. */
export function toneVarForTask(taskId: string): string {
  return `var(--task-${taskColorSlot(taskId) + 1})`;
}
