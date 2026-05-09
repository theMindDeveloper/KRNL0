import type { SysResult } from '../SysFacade';

// TODO (Week 4): read/write board.json Todo node state
export async function todoAdd(text?: string, tag?: string): Promise<SysResult> {
  if (!text) return { ok: false, message: 'todo add requires a task description' };
  return { ok: true, message: `[stub] todo add "${text}"${tag ? ` --tag ${tag}` : ''}` };
}

export async function todoCheck(id?: string): Promise<SysResult> {
  if (!id) return { ok: false, message: 'todo check requires a task <id>' };
  return { ok: true, message: `[stub] todo check ${id}` };
}

export async function todoList(): Promise<SysResult> {
  return { ok: true, message: '[stub] todo list — no tasks', data: [] };
}
