import type { SysResult } from '../SysFacade';

// TODO (Week 3): read/write board.json edge list
export async function edgeAdd(from?: string, to?: string): Promise<SysResult> {
  if (!from || !to) return { ok: false, message: 'edge add requires --from and --to' };
  return { ok: true, message: `[stub] edge add from=${from} to=${to}` };
}

export async function edgeRemove(id?: string): Promise<SysResult> {
  if (!id) return { ok: false, message: 'edge remove requires an <id>' };
  return { ok: true, message: `[stub] edge remove ${id}` };
}

export async function edgeList(): Promise<SysResult> {
  return { ok: true, message: '[stub] edge list — no edges', data: [] };
}
