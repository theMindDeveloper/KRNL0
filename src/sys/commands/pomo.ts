import type { SysResult } from '../SysFacade';
import type { PomoConfig, PomoState, TimerFace } from '../../renderer/components/nodes/PomoNode/types';
import { OBSERVE_SPAN_MIN, TIMER_FACES } from '../../renderer/components/nodes/PomoNode/types';
import {
  pomoStart as fsmStart,
  pomoStop as fsmStop,
  pomoStopAt as fsmStopAt,
  pomoBreak as fsmBreak,
  pomoExtend as fsmExtend,
  pomoPause as fsmPause,
  pomoResume as fsmResume,
  pomoDiscard as fsmDiscard,
  pomoDeleteSegment as fsmDeleteSegment,
  pomoRetagSegment as fsmRetag,
  type PomoEnv,
} from '../../renderer/components/nodes/PomoNode/commands';
import { loadBoardFrom, saveBoardTo } from '../../main/persistence/board';
import { resolveNodeRef, resolutionError } from '../../shared/dispatch/resolveRef';
import type { BoardShape } from '../../shared/dispatch/types';
import { selectSchedule } from '../../renderer/store/scheduleSelector';
import type { Board } from '../../shared/types';
import { selectPomoReality } from '../../renderer/store/pomoReality';
import { spanTagFor } from '../../renderer/store/spanTags';
import { isValidYMD } from '../../shared/ymd';

const VALID_FACES: readonly TimerFace[] = TIMER_FACES;
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
  let result: SysResult = { ok: false, message: 'No Pomodoro node found on the board' };
  getBoardIo().mutateBoard((board) => {
    const node = findPomoNode(board);
    if (!node) return;
    const prev = defaultState((node['state'] ?? {}) as Partial<PomoState>);
    if (prev.status === 'running' || prev.status === 'paused') {
      // fsmStart is a no-op here — say so instead of claiming a fresh start.
      result = { ok: false, message: `pomo is already ${prev.status}` };
      return;
    }
    if (prev.status !== 'idle' && prev.status !== 'done') {
      // fsmStart only starts from idle/done; during a break it is a no-op too.
      result = { ok: false, message: `pomo is on a ${prev.status} — run 'krnl pomo resume' to get back to work` };
      return;
    }
    const cfg = node['config'] ?? {};
    const easy = (board as { uiMode?: string }).uiMode === 'easy';
    const sessionMin = cfg['mode'] === 'observe' || easy
      ? OBSERVE_SPAN_MIN
      : minutes ?? (typeof cfg['sessionMin'] === 'number' ? cfg['sessionMin'] : 25);
    const startArgs: { label?: string; durationMin?: number; activeTaskId?: string | null } = { durationMin: sessionMin };
    // Easy mode never links a span (easy-mode D13), same as the UI's START.
    if (easy) { startArgs.activeTaskId = null; startArgs.label = ''; }
    if (label !== undefined) startArgs.label = label;
    // Same as the UI: an untagged start is tagged with the open task whose
    // planned block contains "now" (time-model F5).
    const suggested = label === undefined && prev.activeTaskId === null && !prev.label && !easy ? plannedTaskNow(board) : null;
    if (suggested) {
      startArgs.activeTaskId = suggested.id;
      startArgs.label = suggested.text;
    }
    node['state'] = fsmStart(prev, startArgs, cliEnv());
    result = { ok: true, message: suggested ? `Pomodoro started on "${suggested.text}"` : 'Pomodoro started' };
  });
  return result;
}

/** The open task whose planned calendar block contains now, if any. */
function plannedTaskNow(board: { nodes: Array<Record<string, unknown>>; edges?: unknown }): { id: string; text: string } | null {
  const b = { ...board, edges: Array.isArray(board.edges) ? board.edges : [] } as unknown as Board;
  const now = Date.now();
  for (const p of selectSchedule(b).placements.values()) {
    const s = new Date(p.startISO).getTime();
    const e = new Date(p.endISO).getTime();
    if (!(s <= now && now < e)) continue;
    const node = board.nodes.find((n) => n['id'] === p.taskId);
    const st = (node?.['state'] ?? {}) as { done?: boolean; text?: string };
    if (node && !st.done) return { id: p.taskId, text: st.text ?? '' };
  }
  return null;
}

/** Shared shape for the simple state-transition verbs below. */
function pomoTransition(
  allowed: readonly PomoState['status'][],
  verb: string,
  apply: (prev: PomoState) => PomoState,
  okMsg: string,
): SysResult {
  let result: SysResult = { ok: false, message: 'No Pomodoro node found on the board' };
  getBoardIo().mutateBoard((board) => {
    const node = findPomoNode(board);
    if (!node) return;
    const prev = defaultState((node['state'] ?? {}) as Partial<PomoState>);
    if (!allowed.includes(prev.status)) {
      result = { ok: false, message: `pomo is ${prev.status} — can only ${verb} while ${allowed.join(' or ')}` };
      return;
    }
    node['state'] = apply(prev);
    result = { ok: true, message: okMsg };
  });
  return result;
}

export function pomoPause(): SysResult {
  return pomoTransition(['running'], 'pause', (s) => fsmPause(s, {}, cliEnv()), 'Pomodoro paused');
}

export function pomoResume(): SysResult {
  return pomoTransition(['paused', 'break'], 'resume', (s) => fsmResume(s, {}, cliEnv()), 'Pomodoro resumed');
}

/** Abandon the in-flight span without recording it (the UI's RESET). */
export function pomoDiscard(): SysResult {
  return pomoTransition(['running', 'paused', 'break'], 'discard', (s) => fsmDiscard(s), 'Pomodoro discarded');
}

/** Issue #166 — record the in-flight segment before going idle. */
/**
 * `pomo stop [--at HH:MM|YYYY-MM-DDTHH:MM]` — record the in-flight span and go
 * idle. `--at` ends it at an earlier moment (time the machine slept or the
 * app was closed is then not counted).
 */
export function pomoStop(at?: string): SysResult {
  let atMs: number | undefined;
  if (at !== undefined) {
    atMs = parseStopAt(at, Date.now());
    if (atMs === undefined) return { ok: false, message: `bad --at "${at}" (want HH:MM today or YYYY-MM-DDTHH:MM)` };
    if (atMs > Date.now()) return { ok: false, message: `--at ${at} is in the future` };
  }
  let found = false;
  getBoardIo().mutateBoard((board) => {
    const node = findPomoNode(board);
    if (!node) return;
    const prev = defaultState((node['state'] ?? {}) as Partial<PomoState>);
    node['state'] = atMs !== undefined ? fsmStopAt(prev, { atMs }, cliEnv()) : fsmStop(prev, {}, cliEnv());
    found = true;
  });
  if (!found) return { ok: false, message: 'No Pomodoro node found on the board' };
  return { ok: true, message: at !== undefined ? `Pomodoro stopped as of ${at}` : 'Pomodoro stopped' };
}

/** "HH:MM" (today, local) or "YYYY-MM-DDTHH:MM" (local) → epoch ms. */
export function parseStopAt(at: string, nowMs: number): number | undefined {
  const hm = /^(\d{1,2}):(\d{2})$/.exec(at);
  if (hm) {
    const h = Number(hm[1]);
    const m = Number(hm[2]);
    if (h > 23 || m > 59) return undefined;
    const d = new Date(nowMs);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).getTime();
  }
  const full = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(at);
  if (!full) return undefined;
  const [y, mo, d, h, mi] = full.slice(1).map(Number) as [number, number, number, number, number];
  const t = new Date(y, mo - 1, d, h, mi);
  return t.getMonth() === mo - 1 && t.getDate() === d && h < 24 && mi < 60 ? t.getTime() : undefined;
}

/** Issue #166 — transition running/paused → break, recording the work span. */
export function pomoBreak(): SysResult {
  let found = false;
  let msg = 'No Pomodoro node found on the board';
  getBoardIo().mutateBoard((board) => {
    const node = findPomoNode(board);
    if (!node) return;
    const prev = defaultState((node['state'] ?? {}) as Partial<PomoState>);
    if (prev.status !== 'running' && prev.status !== 'paused') {
      msg = `pomo is ${prev.status} — can only break from running or paused`;
      return;
    }
    node['state'] = fsmBreak(prev, {}, cliEnv());
    msg = 'Switched to break';
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

/** Resolve a task ref for tagging; 'none' clears the tag. */
function resolveTag(board: BoardShape, ref: string): { taskId: string | null; label: string } | { error: string } {
  if (ref === 'none') return { taskId: null, label: '' };
  const r = resolveNodeRef(board, ref);
  if (!r.ok) return { error: resolutionError('task', ref, r) };
  const node = board.nodes.find((n) => n.id === r.id);
  if (!node || node.kind !== 'todo.task') return { error: `"${ref}" is not a task` };
  return { taskId: node.id, label: String((node.state as { text?: string }).text ?? '') };
}

export interface PomoTagCtx {
  boardPath: string;
  onBoardChanged?: () => void;
}

/** Load → mutate → save for the tag verbs (path-based, so it's testable). */
function mutatePomoBoard(ctx: PomoTagCtx, fn: (board: BoardLike) => void): void {
  const raw = loadBoardFrom(ctx.boardPath) as BoardLike | null;
  if (!raw) return;
  const board: BoardLike = {
    ...((raw as unknown) as Record<string, unknown>),
    nodes: Array.isArray(raw.nodes) ? raw.nodes : [],
    edges: Array.isArray(raw.edges) ? raw.edges : [],
  };
  fn(board);
  saveBoardTo(ctx.boardPath, { ...board, savedAt: new Date().toISOString() });
  ctx.onBoardChanged?.();
}

/** `krnl pomo tag <taskRef|none>` — label what the pomo is observing. */
export function pomoTag(ctx: PomoTagCtx, ref: string | undefined): SysResult {
  if (!ref) return { ok: false, message: 'pomo tag requires <taskRef|none>' };
  let result: SysResult = { ok: false, message: 'No Pomodoro node found on the board' };
  mutatePomoBoard(ctx, (board) => {
    const node = findPomoNode(board);
    if (!node) return;
    const tag = resolveTag(board as unknown as BoardShape, ref);
    if ('error' in tag) { result = { ok: false, message: tag.error }; return; }
    const prev = defaultState((node['state'] ?? {}) as Partial<PomoState>);
    node['state'] = { ...prev, activeTaskId: tag.taskId, label: tag.label };
    result = { ok: true, message: tag.taskId ? `pomo tagged "${tag.label}"` : 'pomo untagged' };
  });
  return result;
}

/** `krnl pomo retag <segmentId> <taskRef|none>` — fix what recorded time was spent on. */
export function pomoRetag(
  ctx: PomoTagCtx,
  segmentId: string | undefined,
  ref: string | undefined,
  free: { text?: string | undefined; tag?: string | undefined } = {},
): SysResult {
  const text = free.text?.trim() ?? '';
  if (!segmentId || (!ref && !text)) return { ok: false, message: 'pomo retag requires <segmentId> <taskRef|none> or --text "what" [--tag <tag>]' };
  let result: SysResult = { ok: false, message: 'No Pomodoro node found on the board' };
  mutatePomoBoard(ctx, (board) => {
    const node = findPomoNode(board);
    if (!node) return;
    const tag = text
      ? { taskId: null, label: text }
      : resolveTag(board as unknown as BoardShape, ref as string);
    if ('error' in tag) { result = { ok: false, message: tag.error }; return; }
    // Observe mode — a free-text span gets a tag id (explicit, else classified).
    const spanTag = text ? spanTagFor(board as unknown as Board, text, free.tag ?? null) : null;
    if (text && free.tag && !spanTag) { result = { ok: false, message: `unknown tag "${free.tag}"` }; return; }
    const prev = defaultState((node['state'] ?? {}) as Partial<PomoState>);
    const matches = prev.history.filter((r) => r.id.startsWith(segmentId));
    if (matches.length !== 1) {
      result = { ok: false, message: matches.length === 0 ? `no segment "${segmentId}"` : `segment "${segmentId}" is ambiguous` };
      return;
    }
    const id = matches[0]!.id;
    node['state'] = {
      ...prev,
      history: fsmRetag(prev, { id, taskId: tag.taskId, label: tag.label, tag: spanTag }).history,
    };
    const shown = tag.taskId || text ? `"${tag.label}"${spanTag ? ` [${spanTag}]` : ''}` : 'untagged';
    result = { ok: true, message: `segment ${id.slice(0, 8)} → ${shown}` };
  });
  return result;
}

/** Resolve a unique recorded segment id from a prefix. */
function resolveSegmentId(state: PomoState, segmentId: string): { id: string } | { error: string } {
  const matches = state.history.filter((r) => r.id.startsWith(segmentId));
  if (matches.length === 1) return { id: matches[0]!.id };
  return { error: matches.length === 0 ? `no segment "${segmentId}"` : `segment "${segmentId}" is ambiguous` };
}

/**
 * `krnl pomo delete-segment <segmentId>` — remove a recorded work/break span
 * (CLI twin of the Calendar / Clock right-click "Delete segment"). The live
 * in-flight span isn't in history, so it can't be deleted — use `pomo discard`.
 */
export function pomoDeleteSegmentCmd(ctx: PomoTagCtx, segmentId: string | undefined): SysResult {
  if (!segmentId) return { ok: false, message: 'pomo delete-segment requires <segmentId>' };
  let result: SysResult = { ok: false, message: 'No Pomodoro node found on the board' };
  mutatePomoBoard(ctx, (board) => {
    const node = findPomoNode(board);
    if (!node) return;
    const prev = defaultState((node['state'] ?? {}) as Partial<PomoState>);
    const r = resolveSegmentId(prev, segmentId);
    if ('error' in r) { result = { ok: false, message: r.error }; return; }
    node['state'] = fsmDeleteSegment(prev, { id: r.id });
    result = { ok: true, message: `segment ${r.id.slice(0, 8)} deleted` };
  });
  return result;
}

/**
 * `krnl pomo segments [--date YYYY-MM-DD] [--json]` — list tracked focus and
 * break spans (ids for retag / delete-segment). Defaults to today.
 */
export function pomoSegments(ctx: { boardPath: string }, opts: { date?: string; json?: boolean }): SysResult {
  const raw = loadBoardFrom(ctx.boardPath) as Board | null;
  if (!raw || !Array.isArray(raw.nodes)) return { ok: false, message: 'No board found' };
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const date = opts.date ?? today;
  if (!isValidYMD(date)) return { ok: false, message: `bad --date "${date}" (want YYYY-MM-DD)` };
  const dayStart = new Date(`${date}T00:00:00`).getTime();
  const dayEnd = dayStart + 86_400_000;
  const hm = (ms: number) => { const t = new Date(ms); return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`; };
  const segs = selectPomoReality(raw, Date.now())
    .filter((sg) => sg.endMs > dayStart && sg.startMs < dayEnd)
    .map((sg) => ({
      id: sg.id, kind: sg.kind, taskId: sg.taskId, label: sg.label, live: sg.live,
      start: hm(sg.startMs), end: hm(sg.endMs), minutes: Math.max(1, Math.round((sg.endMs - sg.startMs) / 60_000)),
    }));
  if (opts.json) return { ok: true, message: JSON.stringify(segs), data: segs };
  if (segs.length === 0) return { ok: true, message: `no tracked segments on ${date}`, data: segs };
  const lines = segs.map((sg) =>
    `  ${sg.id.slice(0, 8)}  ${sg.kind === 'work' ? 'focus' : 'break'}  ${sg.start}–${sg.live ? 'now  ' : sg.end}  ${String(sg.minutes).padStart(3)}m  ${sg.label || (sg.kind === 'work' ? '(untagged)' : '')}`);
  return { ok: true, message: [`tracked segments — ${date}`, ...lines].join('\n'), data: segs };
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
  countStopped?: boolean;
  mode?: string;
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
    && opts.every === undefined && opts.face === undefined && opts.countStopped === undefined && opts.mode === undefined) {
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
      countStopped: cfg.countStopped ?? true,
      mode: cfg.mode ?? 'pomodoro',
    };
    return { ok: true, message: JSON.stringify(info), data: info };
  }

  if (opts.mode !== undefined && opts.mode !== 'pomodoro' && opts.mode !== 'observe') {
    return { ok: false, message: `pomo config: invalid --mode "${opts.mode}". Allowed: pomodoro, observe` };
  }
  if (opts.face !== undefined && opts.face !== 'auto' && !isTimerFace(opts.face)) {
    return {
      ok: false,
      message: `pomo config: invalid --face "${opts.face}". Allowed: auto, ${VALID_FACES.join(', ')}`,
    };
  }

  let found = false;
  mb((board) => {
    const node = findPomoNode(board);
    if (!node) return;
    const prev = (node['config'] ?? {}) as Partial<PomoConfig>;
    const next: Partial<PomoConfig> = { ...prev };
    if (opts.session !== undefined && opts.session > 0) next.sessionMin = Math.max(1, Math.round(opts.session));
    if (opts.short !== undefined && opts.short > 0) next.shortBreakMin = Math.max(1, Math.round(opts.short));
    if (opts.long !== undefined && opts.long > 0) next.longBreakMin = Math.max(1, Math.round(opts.long));
    if (opts.every !== undefined && opts.every > 0) next.longBreakEvery = Math.max(1, Math.round(opts.every));
    if (opts.face === 'auto') delete next.face;
    else if (opts.face !== undefined) next.face = opts.face as TimerFace;
  if (opts.countStopped !== undefined) next.countStopped = opts.countStopped;
  if (opts.mode === 'pomodoro' || opts.mode === 'observe') next.mode = opts.mode;
    node['config'] = next;
    found = true;
  });
  if (!found) return { ok: false, message: 'No Pomodoro node found on the board' };
  return { ok: true, message: 'pomo config updated' };
}

function _pomoConfigViaPath(opts: Parameters<typeof pomoConfig>[0], boardPath: string): SysResult {
  if (opts.session === undefined && opts.short === undefined && opts.long === undefined
    && opts.every === undefined && opts.face === undefined && opts.countStopped === undefined && opts.mode === undefined) {
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
      countStopped: cfg.countStopped ?? true,
      mode: cfg.mode ?? 'pomodoro',
    };
    return { ok: true, message: JSON.stringify(info), data: info };
  }

  if (opts.mode !== undefined && opts.mode !== 'pomodoro' && opts.mode !== 'observe') {
    return { ok: false, message: `pomo config: invalid --mode "${opts.mode}". Allowed: pomodoro, observe` };
  }
  if (opts.face !== undefined && opts.face !== 'auto' && !isTimerFace(opts.face)) {
    return {
      ok: false,
      message: `pomo config: invalid --face "${opts.face}". Allowed: auto, ${VALID_FACES.join(', ')}`,
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
  if (opts.session !== undefined && opts.session > 0) next.sessionMin = Math.max(1, Math.round(opts.session));
  if (opts.short !== undefined && opts.short > 0) next.shortBreakMin = Math.max(1, Math.round(opts.short));
  if (opts.long !== undefined && opts.long > 0) next.longBreakMin = Math.max(1, Math.round(opts.long));
  if (opts.every !== undefined && opts.every > 0) next.longBreakEvery = Math.max(1, Math.round(opts.every));
  if (opts.face === 'auto') delete next.face;
  else if (opts.face !== undefined) next.face = opts.face as TimerFace;
  if (opts.countStopped !== undefined) next.countStopped = opts.countStopped;
  if (opts.mode === 'pomodoro' || opts.mode === 'observe') next.mode = opts.mode;
  node['config'] = next;

  saveBoardTo(boardPath, { ...(board as unknown as Record<string, unknown>), savedAt: new Date().toISOString() });
  return { ok: true, message: 'pomo config updated' };
}
