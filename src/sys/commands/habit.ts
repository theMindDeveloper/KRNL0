import type { SysResult } from '../SysFacade';

// TODO (Week 4): read/write board.json Habit node state
// Persist completions as a Record<dateString, boolean>. Derive streak on read.
export async function habitAdd(name?: string): Promise<SysResult> {
  if (!name) return { ok: false, message: 'habit add requires a <name>' };
  return { ok: true, message: `[stub] habit add "${name}"` };
}

export async function habitDone(name?: string, date?: string): Promise<SysResult> {
  if (!name) return { ok: false, message: 'habit done requires a <name>' };
  const d = date ?? new Date().toISOString().split('T')[0];
  return { ok: true, message: `[stub] habit done "${name}" on ${d}` };
}

export async function habitStreak(name?: string): Promise<SysResult> {
  if (!name) return { ok: false, message: 'habit streak requires a <name>' };
  return { ok: true, message: `[stub] streak for "${name}": 0 days`, data: { streak: 0 } };
}
