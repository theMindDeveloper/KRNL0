import type { SysResult } from '../SysFacade';

// TODO (Week 4): implement board persistence with Zod validation
export async function boardShow(): Promise<SysResult> {
  return { ok: true, message: '[stub] board show — not yet implemented' };
}

export async function boardSave(path?: string): Promise<SysResult> {
  return { ok: true, message: `[stub] board save → ${path ?? 'default'}` };
}

export async function boardLoad(path?: string): Promise<SysResult> {
  if (!path) return { ok: false, message: 'board load requires a <path>' };
  return { ok: true, message: `[stub] board load ← ${path}` };
}
