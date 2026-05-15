import { mutateBoard, readBoardFile } from '../../main/boardIo';
import type { SysResult } from '../SysFacade';
import type { PomoState } from '../../renderer/components/nodes/PomoNode/types';

function findPomoNode(board: { nodes: Array<Record<string, unknown>> }) {
  return board.nodes.find(
    (n) => n['kind'] === 'pomo' && n['isMother'] === true,
  ) as (Record<string, unknown> & { state?: Partial<PomoState>; config?: Record<string, unknown> }) | undefined;
}

export function pomoStart(label?: string, minutes?: number): SysResult {
  let found = false;
  mutateBoard((board) => {
    const node = findPomoNode(board);
    if (!node) return;
    const cfg = node['config'] ?? {};
    const sessionMin = minutes ?? (typeof cfg['sessionMin'] === 'number' ? cfg['sessionMin'] : 25);
    const prev = (node['state'] ?? {}) as Partial<PomoState>;
    node['state'] = {
      ...prev,
      status: 'running',
      startedAt: new Date().toISOString(),
      durationMin: sessionMin,
      label: label ?? prev.label ?? '',
      pausedAt: null,
      pausedElapsedMs: 0,
    } satisfies Partial<PomoState>;
    found = true;
  });
  if (!found) return { ok: false, message: 'No Pomodoro node found on the board' };
  return { ok: true, message: 'Pomodoro started' };
}

export function pomoStop(): SysResult {
  let found = false;
  mutateBoard((board) => {
    const node = findPomoNode(board);
    if (!node) return;
    const prev = (node['state'] ?? {}) as Partial<PomoState>;
    node['state'] = {
      ...prev,
      status: 'idle',
      startedAt: null,
      pausedAt: null,
      pausedElapsedMs: 0,
    } satisfies Partial<PomoState>;
    found = true;
  });
  if (!found) return { ok: false, message: 'No Pomodoro node found on the board' };
  return { ok: true, message: 'Pomodoro stopped' };
}

export function pomoStatus(): SysResult {
  const board = readBoardFile();
  if (!board) return { ok: false, message: 'No board found' };
  const node = findPomoNode(board);
  if (!node) return { ok: false, message: 'No Pomodoro node found on the board' };
  const state = (node['state'] ?? {}) as Partial<PomoState>;
  const status = state.status ?? 'idle';
  const label  = state.label ? ` — ${state.label}` : '';
  return { ok: true, message: `pomo ${status}${label}` };
}
