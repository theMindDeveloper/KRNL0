// Audit 2026-11-09 #52 (AGENTS.md rule 8) — the window actions the app had
// with no krnl command: show / hide / swap the main windows, the timer's live
// label, the Analytics window's page and range, a media title, an image's alt
// text. Each one writes the board the way the window does it.

import { loadBoardFrom, saveBoardTo } from '../../main/persistence/board';
import type { SysResult } from '../SysFacade';
import type { Board } from '../../shared/types';
import { pomoSetLiveLabel } from '../../renderer/components/nodes/PomoNode/commands';
import { defaultPomoState, type PomoState } from '../../renderer/components/nodes/PomoNode/types';
import { spanTagFor } from '../../renderer/store/spanTags';
import { ANALYTICS_VIEWS } from '../../renderer/components/nodes/AnalyticsNode/types';

export interface WindowCtx {
  boardPath: string;
  onBoardChanged?: () => void;
}

type AnyNode = Record<string, unknown> & { id: string; kind: string; isMother?: boolean; config?: Record<string, unknown>; state?: Record<string, unknown>; position?: { x: number; y: number } };
type RawBoard = Record<string, unknown> & { nodes: AnyNode[] };

function load(ctx: WindowCtx): RawBoard | null {
  const raw = loadBoardFrom(ctx.boardPath);
  if (typeof raw !== 'object' || raw === null || !Array.isArray((raw as RawBoard).nodes)) return null;
  return raw as RawBoard;
}

function save(ctx: WindowCtx, board: RawBoard): void {
  saveBoardTo(ctx.boardPath, { ...board, savedAt: new Date().toISOString() });
  ctx.onBoardChanged?.();
}

/** The names people use for the main windows → their node kind. */
const WINDOW_KINDS: Record<string, string> = {
  todo: 'todo', todos: 'todo', plans: 'todo',
  pomo: 'pomo', timer: 'pomo', record: 'pomo', observe: 'pomo',
  habit: 'habit', habits: 'habit',
  calendar: 'calendar', cal: 'calendar',
  clock: 'clock',
  terminal: 'term', term: 'term',
  analytics: 'analytics',
};
const WINDOW_NAMES = 'todo, timer, habits, calendar, clock, terminal, analytics';

function motherOf(board: RawBoard, name: string | undefined): AnyNode | string {
  const kind = name ? WINDOW_KINDS[name.toLowerCase()] : undefined;
  if (!kind) return `"${name ?? ''}" is not a window (${WINDOW_NAMES})`;
  const m = board.nodes.find((n) => n.kind === kind && n.isMother === true);
  return m ?? `No ${name} window on the board`;
}

/** Shown in Station unless hidden; the terminal starts hidden; Easy has no terminal. */
function isShown(board: RawBoard, n: AnyNode): boolean {
  if (board['uiMode'] === 'easy' && n.kind === 'term') return false;
  const hidden = n.config?.['stationHidden'];
  if (hidden !== undefined) return hidden !== true;
  return n.kind !== 'term';
}

const label = (kind: string): string => Object.entries(WINDOW_KINDS).find(([, k]) => k === kind)?.[0] ?? kind;

/** `krnl window list [--json]` */
export function windowList(ctx: WindowCtx, json = false): SysResult {
  const board = load(ctx);
  if (!board) return { ok: false, message: 'No board found' };
  const rows = board.nodes.filter((n) => n.isMother === true && Object.values(WINDOW_KINDS).includes(n.kind))
    .map((n) => ({ window: label(n.kind), kind: n.kind, id: n.id, shown: isShown(board, n), slot: (n.config?.['stationSlot'] as number | undefined) ?? null }));
  if (json) return { ok: true, message: JSON.stringify(rows), data: rows };
  return { ok: true, message: rows.map((r) => `${r.window.padEnd(10)} ${r.shown ? 'shown' : 'hidden'}`).join('\n'), data: rows };
}

/** `krnl window show|hide <name>` — the Station toolbar's eye buttons. */
export function windowSetShown(ctx: WindowCtx, name: string | undefined, show: boolean): SysResult {
  const board = load(ctx);
  if (!board) return { ok: false, message: 'No board found' };
  const m = motherOf(board, name);
  if (typeof m === 'string') return { ok: false, message: m };
  if (show && m.kind === 'term' && board['uiMode'] === 'easy') {
    return { ok: false, message: 'Easy mode has no terminal; switch to Advanced first (krnl settings mode advanced)' };
  }
  m.config = { ...(m.config ?? {}), stationHidden: !show };
  save(ctx, board);
  const note = board['layoutMode'] === 'station' ? '' : ' (applies in Station layout; the canvas always shows every window)';
  return { ok: true, message: `${label(m.kind)} ${show ? 'shown' : 'hidden'}${note}`, data: { id: m.id, shown: show } };
}

/** `krnl window swap <a> <b>` — swap two windows' places (dragging one onto another). */
export function windowSwap(ctx: WindowCtx, a: string | undefined, b: string | undefined): SysResult {
  const board = load(ctx);
  if (!board) return { ok: false, message: 'No board found' };
  const ma = motherOf(board, a);
  if (typeof ma === 'string') return { ok: false, message: ma };
  const mb = motherOf(board, b);
  if (typeof mb === 'string') return { ok: false, message: mb };
  if (ma.id === mb.id) return { ok: false, message: 'Pick two different windows' };
  const posA = ma.position ?? { x: 0, y: 0 };
  const posB = mb.position ?? { x: 0, y: 0 };
  const slotA = ma.config?.['stationSlot'];
  const slotB = mb.config?.['stationSlot'];
  ma.position = posB;
  mb.position = posA;
  ma.config = { ...(ma.config ?? {}), stationSlot: slotB };
  mb.config = { ...(mb.config ?? {}), stationSlot: slotA };
  save(ctx, board);
  return { ok: true, message: `${label(ma.kind)} and ${label(mb.kind)} swapped places` };
}

/** `krnl pomo label "<what you are doing>" [--tag <id>]` — the timer's free-text label (Observe). */
export function pomoLabel(ctx: WindowCtx, text: string | undefined, tag: string | undefined): SysResult {
  if (text === undefined) return { ok: false, message: 'pomo label requires "<text>" (use "" to clear)' };
  const board = load(ctx);
  if (!board) return { ok: false, message: 'No board found' };
  const node = board.nodes.find((n) => n.kind === 'pomo');
  if (!node) return { ok: false, message: 'No timer on the board' };
  const prev = { ...defaultPomoState(), ...((node.state ?? {}) as Partial<PomoState>) } as PomoState;
  const spanTag = text.trim() ? spanTagFor(board as unknown as Board, text, tag ?? null) : null;
  node.state = pomoSetLiveLabel(prev, { label: text, tag: spanTag }) as unknown as Record<string, unknown>;
  save(ctx, board);
  return { ok: true, message: text.trim() ? `Timer label: "${text.trim()}"${spanTag ? ` (${spanTag})` : ''}` : 'Timer label cleared' };
}

/** `krnl analytics set [--view v] [--range 7|30|90|365] [--metric m] [--year YYYY]` — the Analytics window's page and range. */
export function analyticsSet(ctx: WindowCtx, opts: { view?: string; range?: number; metric?: string; year?: number }): SysResult {
  const METRICS = ['taskCount', 'habitCount', 'focusMin', 'sessions'];
  if (opts.view !== undefined && !(ANALYTICS_VIEWS as readonly string[]).includes(opts.view)) return { ok: false, message: `--view must be one of ${ANALYTICS_VIEWS.join(', ')}` };
  if (opts.range !== undefined && ![7, 30, 90, 365].includes(opts.range)) return { ok: false, message: '--range must be 7, 30, 90 or 365' };
  if (opts.metric !== undefined && !METRICS.includes(opts.metric)) return { ok: false, message: `--metric must be one of ${METRICS.join(', ')}` };
  if (opts.year !== undefined && !(Number.isInteger(opts.year) && opts.year >= 2000 && opts.year <= 2100)) return { ok: false, message: '--year must be a year like 2026' };
  if (opts.view === undefined && opts.range === undefined && opts.metric === undefined && opts.year === undefined) {
    return { ok: false, message: 'analytics set needs --view, --range, --metric or --year' };
  }
  const board = load(ctx);
  if (!board) return { ok: false, message: 'No board found' };
  const node = board.nodes.find((n) => n.kind === 'analytics' && n.isMother === true) ?? board.nodes.find((n) => n.kind === 'analytics');
  if (!node) return { ok: false, message: 'No Analytics window on the board' };
  node.state = {
    ...(node.state ?? {}),
    ...(opts.view !== undefined ? { view: opts.view } : {}),
    ...(opts.range !== undefined ? { rangeDays: opts.range } : {}),
    ...(opts.metric !== undefined ? { metric: opts.metric } : {}),
    ...(opts.year !== undefined ? { year: opts.year } : {}),
  };
  save(ctx, board);
  const s = node.state;
  return { ok: true, message: `Analytics: ${String(s['view'] ?? 'overview')} · ${String(s['rangeDays'] ?? 30)} days · ${String(s['metric'] ?? 'taskCount')}` };
}

function findByRef(board: RawBoard, kind: string, ref: string | undefined): AnyNode | string {
  if (!ref) return `needs a ${kind} id`;
  const exact = board.nodes.find((n) => n.kind === kind && n.id === ref);
  if (exact) return exact;
  const hits = ref.length >= 4 ? board.nodes.filter((n) => n.kind === kind && n.id.startsWith(ref)) : [];
  if (hits.length === 1) return hits[0]!;
  return hits.length > 1 ? `"${ref}" matches ${hits.length} ${kind} nodes; use more of the id` : `No ${kind} node "${ref}" (krnl ${kind} list)`;
}

/** `krnl media title <id> "<title>"` */
export function mediaTitle(ctx: WindowCtx, ref: string | undefined, title: string | undefined): SysResult {
  if (title === undefined) return { ok: false, message: 'media title <id> "<title>"' };
  const board = load(ctx);
  if (!board) return { ok: false, message: 'No board found' };
  const n = findByRef(board, 'media', ref);
  if (typeof n === 'string') return { ok: false, message: n };
  n.state = { ...(n.state ?? {}), title: title.trim() };
  save(ctx, board);
  return { ok: true, message: `Media ${n.id.slice(0, 8)} titled "${title.trim()}"` };
}

/** `krnl image alt <id> "<text>"` — what the picture shows, for screen readers. */
export function imageAlt(ctx: WindowCtx, ref: string | undefined, alt: string | undefined): SysResult {
  if (alt === undefined) return { ok: false, message: 'image alt <id> "<text>"' };
  const board = load(ctx);
  if (!board) return { ok: false, message: 'No board found' };
  const n = findByRef(board, 'image', ref);
  if (typeof n === 'string') return { ok: false, message: n };
  n.state = { ...(n.state ?? {}), alt: alt.trim() };
  save(ctx, board);
  return { ok: true, message: `Image ${n.id.slice(0, 8)} alt text set` };
}
