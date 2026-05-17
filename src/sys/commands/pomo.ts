import type { SysResult } from '../SysFacade';
import type { PomoConfig, PomoState, TimerFace } from '../../renderer/components/nodes/PomoNode/types';
import { loadBoardFrom, saveBoardTo } from '../../main/persistence/board';

const VALID_FACES: readonly TimerFace[] = ['ascii', 'lcd', 'blocks', 'vapor'];
function isTimerFace(v: unknown): v is TimerFace {
  return typeof v === 'string' && (VALID_FACES as readonly string[]).includes(v);
}

interface BoardLike {
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
  [k: string]: unknown;
}

interface BoardWithNodes {
  nodes: Array<Record<string, unknown>>;
}

function findPomoNode(board: BoardWithNodes) {
  return board.nodes.find(
    (n) => n['kind'] === 'pomo' && n['isMother'] === true,
  ) as (Record<string, unknown> & { state?: Partial<PomoState>; config?: Record<string, unknown> }) | undefined;
}

function getBoardIo() {
  // Lazy import of boardIo to avoid Electron `app.getName()` crash in test env.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../../main/boardIo') as typeof import('../../main/boardIo');
}

export function pomoStart(label?: string, minutes?: number): SysResult {
  let found = false;
  getBoardIo().mutateBoard((board) => {
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
  getBoardIo().mutateBoard((board) => {
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
  const board = getBoardIo().readBoardFile();
  if (!board) return { ok: false, message: 'No board found' };
  const node = findPomoNode(board);
  if (!node) return { ok: false, message: 'No Pomodoro node found on the board' };
  const state = (node['state'] ?? {}) as Partial<PomoState>;
  const status = state.status ?? 'idle';
  const label  = state.label ? ` — ${state.label}` : '';
  return { ok: true, message: `pomo ${status}${label}` };
}

/**
 * `krnl pomo config [--session N] [--short N] [--long N] [--every N] [--face <face>]`
 * Updates the board-scoped PomoConfig on the mother PomoNode.
 * Writes to `node.config`, not `node.state`.
 *
 * Uses `persistence/board.ts` (pure file I/O) so it is safe to call in test
 * environments where Electron's `app` module is unavailable.  The board path
 * is taken from `process.env.KRNL0_BOARD_PATH` when set (test shim); otherwise
 * falls back to the default Electron board path via `boardIo.ts`.
 */
export function pomoConfig(opts: {
  session?: number;
  short?: number;
  long?: number;
  every?: number;
  face?: string;
}): SysResult {
  // Resolve path: env override (test) or Electron default.
  const boardPath: string | undefined = process.env['KRNL0_BOARD_PATH'];
  if (!boardPath) {
    // In Electron: delegate entirely to boardIo-based path.
    return _pomoConfigViaElectron(opts);
  }
  return _pomoConfigViaPath(opts, boardPath);
}

function _pomoConfigViaElectron(opts: Parameters<typeof pomoConfig>[0]): SysResult {
  const { readBoardFile: rfb, mutateBoard: mb } = getBoardIo();

  if (opts.session === undefined && opts.short === undefined && opts.long === undefined
    && opts.every === undefined && opts.face === undefined) {
    const board = rfb();
    if (!board) return { ok: false, message: 'No board found' };
    const node = findPomoNode(board);
    if (!node) return { ok: false, message: 'No Pomodoro node found on the board' };
    const cfg = (node['config'] ?? {}) as Partial<PomoConfig>;
    const info = {
      sessionMin: cfg.sessionMin ?? 25,
      shortBreakMin: cfg.shortBreakMin ?? 5,
      longBreakMin: cfg.longBreakMin ?? 15,
      longBreakEvery: cfg.longBreakEvery ?? 4,
      face: cfg.face ?? 'vapor',
    };
    return { ok: true, message: JSON.stringify(info), data: info };
  }

  if (opts.face !== undefined && !isTimerFace(opts.face)) {
    return {
      ok: false,
      message: `pomo config: invalid --face "${opts.face}". Allowed: ${VALID_FACES.join(', ')}`,
    };
  }

  let found = false;
  mb((board) => {
    const node = findPomoNode(board);
    if (!node) return;
    const prev = (node['config'] ?? {}) as Partial<PomoConfig>;
    const next: Partial<PomoConfig> = { ...prev };
    if (opts.session !== undefined && opts.session > 0) next.sessionMin = Math.round(opts.session);
    if (opts.short !== undefined && opts.short > 0) next.shortBreakMin = Math.round(opts.short);
    if (opts.long !== undefined && opts.long > 0) next.longBreakMin = Math.round(opts.long);
    if (opts.every !== undefined && opts.every > 0) next.longBreakEvery = Math.round(opts.every);
    if (opts.face !== undefined) next.face = opts.face as TimerFace;
    node['config'] = next;
    found = true;
  });
  if (!found) return { ok: false, message: 'No Pomodoro node found on the board' };
  return { ok: true, message: 'pomo config updated' };
}

function _pomoConfigViaPath(opts: Parameters<typeof pomoConfig>[0], boardPath: string): SysResult {
  if (opts.session === undefined && opts.short === undefined && opts.long === undefined
    && opts.every === undefined && opts.face === undefined) {
    const raw = loadBoardFrom(boardPath) as BoardLike | null;
    if (!raw) return { ok: false, message: 'No board found' };
    const board: BoardLike = {
      nodes: Array.isArray(raw.nodes) ? (raw.nodes as Array<Record<string, unknown>>) : [],
      edges: Array.isArray(raw.edges) ? (raw.edges as Array<Record<string, unknown>>) : [],
    };
    const node = findPomoNode(board);
    if (!node) return { ok: false, message: 'No Pomodoro node found on the board' };
    const cfg = (node['config'] ?? {}) as Partial<PomoConfig>;
    const info = {
      sessionMin: cfg.sessionMin ?? 25,
      shortBreakMin: cfg.shortBreakMin ?? 5,
      longBreakMin: cfg.longBreakMin ?? 15,
      longBreakEvery: cfg.longBreakEvery ?? 4,
      face: cfg.face ?? 'vapor',
    };
    return { ok: true, message: JSON.stringify(info), data: info };
  }

  if (opts.face !== undefined && !isTimerFace(opts.face)) {
    return {
      ok: false,
      message: `pomo config: invalid --face "${opts.face}". Allowed: ${VALID_FACES.join(', ')}`,
    };
  }

  const raw = loadBoardFrom(boardPath) as BoardLike | null;
  if (!raw) return { ok: false, message: 'No board found' };
  const board: BoardLike = {
    ...((raw as unknown) as Record<string, unknown>),
    nodes: Array.isArray(raw.nodes) ? (raw.nodes as Array<Record<string, unknown>>) : [],
    edges: Array.isArray(raw.edges) ? (raw.edges as Array<Record<string, unknown>>) : [],
  };
  const node = findPomoNode(board);
  if (!node) return { ok: false, message: 'No Pomodoro node found on the board' };

  const prev = (node['config'] ?? {}) as Partial<PomoConfig>;
  const next: Partial<PomoConfig> = { ...prev };
  if (opts.session !== undefined && opts.session > 0) next.sessionMin = Math.round(opts.session);
  if (opts.short !== undefined && opts.short > 0) next.shortBreakMin = Math.round(opts.short);
  if (opts.long !== undefined && opts.long > 0) next.longBreakMin = Math.round(opts.long);
  if (opts.every !== undefined && opts.every > 0) next.longBreakEvery = Math.round(opts.every);
  if (opts.face !== undefined) next.face = opts.face as TimerFace;
  node['config'] = next;

  saveBoardTo(boardPath, { ...(board as unknown as Record<string, unknown>), savedAt: new Date().toISOString() });
  return { ok: true, message: 'pomo config updated' };
}
