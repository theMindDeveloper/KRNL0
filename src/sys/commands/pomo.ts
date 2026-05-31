import type { SysResult } from '../SysFacade';
import type { PomoConfig, PomoState, TimerFace } from '../../renderer/components/nodes/PomoNode/types';
import {
  pomoStart as fsmStart,
  pomoStop as fsmStop,
  pomoBreak as fsmBreak,
  pomoExtend as fsmExtend,
  type PomoEnv,
} from '../../renderer/components/nodes/PomoNode/commands';
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

const cliEnv = (): PomoEnv => ({
  now: () => Date.now(),
  uuid: () => crypto.randomUUID(),
});

export function pomoStart(label?: string, minutes?: number): SysResult {
  let found = false;
  getBoardIo().mutateBoard((board) => {
    const node = findPomoNode(board);
    if (!node) return;
    const cfg = node['config'] ?? {};
    const sessionMin = minutes ?? (typeof cfg['sessionMin'] === 'number' ? cfg['sessionMin'] : 25);
    const prev = (node['state'] ?? {}) as Partial<PomoState>;
    const startArgs: { label?: string; durationMin?: number } = { durationMin: sessionMin };
    if (label !== undefined) startArgs.label = label;
    const next = fsmStart({ ...defaultState(prev) }, startArgs, cliEnv());
    node['state'] = next;
    found = true;
  });
  if (!found) return { ok: false, message: 'No Pomodoro node found on the board' };
  return { ok: true, message: 'Pomodoro started' };
}

/** Issue #166 — record the in-flight segment before going idle. */
export function pomoStop(): SysResult {
  let found = false;
  getBoardIo().mutateBoard((board) => {
    const node = findPomoNode(board);
    if (!node) return;
    const prev = defaultState((node['state'] ?? {}) as Partial<PomoState>);
    node['state'] = fsmStop(prev, {}, cliEnv());
    found = true;
  });
  if (!found) return { ok: false, message: 'No Pomodoro node found on the board' };
  return { ok: true, message: 'Pomodoro stopped' };
}

/** Issue #166 — transition running/paused → break, recording the work span. */
export function pomoBreak(): SysResult {
  let found = false;
  let msg = 'Switched to break';
  getBoardIo().mutateBoard((board) => {
    const node = findPomoNode(board);
    if (!node) return;
    const prev = defaultState((node['state'] ?? {}) as Partial<PomoState>);
    if (prev.status !== 'running' && prev.status !== 'paused') {
      msg = `pomo is ${prev.status} — can only break from running or paused`;
      return;
    }
    node['state'] = fsmBreak(prev, {}, cliEnv());
    found = true;
  });
  if (!found) return { ok: false, message: msg };
  return { ok: true, message: msg };
}

/** Issue #166 — close current work span as completed and re-arm the threshold. */
export function pomoExtend(): SysResult {
  let found = false;
  let msg = 'Extended session';
  getBoardIo().mutateBoard((board) => {
    const node = findPomoNode(board);
    if (!node) return;
    const prev = defaultState((node['state'] ?? {}) as Partial<PomoState>);
    if (prev.status !== 'running') {
      msg = `pomo is ${prev.status} — can only extend while running`;
      return;
    }
    node['state'] = fsmExtend(prev, {}, cliEnv());
    found = true;
  });
  if (!found) return { ok: false, message: msg };
  return { ok: true, message: msg };
}

/** Issue #166 — segment-aware status: shows what is currently happening. */
export function pomoStatus(): SysResult {
  const board = getBoardIo().readBoardFile();
  if (!board) return { ok: false, message: 'No board found' };
  const node = findPomoNode(board);
  if (!node) return { ok: false, message: 'No Pomodoro node found on the board' };
  const state = defaultState((node['state'] ?? {}) as Partial<PomoState>);
  const status = state.status;
  const label = state.label ? ` — ${state.label}` : '';

  if (status === 'idle' || status === 'done') {
    return { ok: true, message: `pomo idle${label}` };
  }
  if (status === 'running' || status === 'paused') {
    const workedMs = status === 'running' && state.startedAt
      ? state.sessionWorkSec * 1000 + (Date.now() - Date.parse(state.startedAt))
      : state.sessionWorkSec * 1000 + state.pausedElapsedMs;
    const thresholdMs = state.durationMin * 60_000;
    const remainingMs = Math.max(0, thresholdMs - workedMs);
    const workedMin = Math.round(workedMs / 60_000);
    const remainMin = Math.round(remainingMs / 60_000);
    const atThreshold = workedMs >= thresholdMs;
    const prompt = atThreshold ? ' [DONE? extend|break|stop]' : '';
    return {
      ok: true,
      message: `pomo ${status}${label} — ${workedMin}m worked, ${remainMin}m remain${prompt}`,
      data: { status, label: state.label, workedMin, remainMin, sessions: state.sessionsCompleted },
    };
  }
  if (status === 'break') {
    const elapsed = state.startedAt
      ? Math.round((Date.now() - Date.parse(state.startedAt)) / 60_000)
      : 0;
    return {
      ok: true,
      message: `pomo break — ${elapsed}m elapsed (pomo break | pomo stop to end)`,
      data: { status, label: state.label, breakElapsedMin: elapsed, sessions: state.sessionsCompleted },
    };
  }
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

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Fill missing PomoState fields with safe defaults so FSM functions have a full object. */
function defaultState(partial: Partial<PomoState>): PomoState {
  return {
    status: 'idle',
    startedAt: null,
    durationMin: 25,
    breakMin: 5,
    label: '',
    sessionsCompleted: 0,
    activeTaskId: null,
    history: [],
    pausedAt: null,
    pausedElapsedMs: 0,
    sessionWorkSec: 0,
    ...partial,
  };
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
