// `krnl info` — single-page "where am I?" summary for in-terminal Claude.
// Counts, mother-node ids, theme. Designed so one call gives enough context
// to plan the next mutation.
//
// `krnl settings show` — theme + viewport + boardPath + version.
// `krnl viewport show` — viewport coords.

import { loadBoardFrom, saveBoardTo } from '../../main/persistence/board';
import type { SysResult } from '../SysFacade';
import type { BoardShape } from '../../shared/dispatch/types';

export interface InfoCtx {
  boardPath: string;
  version: string;
  /** light / dark, when an open window reported it (the theme is a window
   *  preference, not board data). */
  theme?: string;
}

function loadBoard(ctx: InfoCtx): BoardShape {
  const raw = loadBoardFrom(ctx.boardPath);
  if (typeof raw !== 'object' || raw === null) return { nodes: [], edges: [] };
  const b = raw as Record<string, unknown>;
  if (!Array.isArray(b['nodes'])) b['nodes'] = [];
  if (!Array.isArray(b['edges'])) b['edges'] = [];
  return b as BoardShape;
}

export async function infoShow(ctx: InfoCtx, json = false): Promise<SysResult> {
  const board = loadBoard(ctx);
  const byKind: Record<string, number> = {};
  for (const n of board.nodes) byKind[n.kind] = (byKind[n.kind] ?? 0) + 1;
  const motherIds: Record<string, string> = {};
  for (const n of board.nodes) {
    if (n.isMother === true) motherIds[n.kind] = n.id;
  }
  const rawBoard = board as unknown as { theme?: string; viewport?: { x: number; y: number; zoom: number } };
  const info = {
    version: ctx.version,
    boardPath: ctx.boardPath,
    theme: ctx.theme ?? rawBoard.theme ?? 'unknown',
    viewport: rawBoard.viewport ?? null,
    nodeCount: board.nodes.length,
    edgeCount: board.edges.length,
    byKind,
    motherIds,
  };
  if (json) return { ok: true, message: JSON.stringify(info), data: info };
  const kindLines = Object.entries(byKind)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, n]) => `  ${k.padEnd(14)} ${n}`)
    .join('\n');
  const motherLines = Object.entries(motherIds)
    .map(([k, id]) => `  ${k.padEnd(10)} ${id}`)
    .join('\n');
  return {
    ok: true,
    message: [
      `krnl0 v${ctx.version}`,
      `board: ${ctx.boardPath}`,
      `theme: ${info.theme}  · viewport: ${info.viewport ? `${info.viewport.x},${info.viewport.y} @${info.viewport.zoom}x` : '(unknown)'}`,
      `${info.nodeCount} nodes · ${info.edgeCount} edges`,
      `by kind:`,
      kindLines || '  (empty)',
      `mother ids:`,
      motherLines || '  (none)',
    ].join('\n'),
    data: info,
  };
}

export async function settingsShow(ctx: InfoCtx, json = false): Promise<SysResult> {
  const board = loadBoard(ctx);
  const rawBoard = board as unknown as { theme?: string; viewport?: { x: number; y: number; zoom: number } };
  const settings = {
    version: ctx.version,
    boardPath: ctx.boardPath,
    theme: ctx.theme ?? rawBoard.theme ?? 'unknown',
    viewport: rawBoard.viewport ?? null,
  };
  if (json) return { ok: true, message: JSON.stringify(settings), data: settings };
  return {
    ok: true,
    message: [
      `version : ${settings.version}`,
      `board   : ${settings.boardPath}`,
      `theme   : ${settings.theme}`,
      `viewport: ${settings.viewport ? JSON.stringify(settings.viewport) : '(unknown)'}`,
    ].join('\n'),
    data: settings,
  };
}

export async function viewportShow(ctx: InfoCtx, json = false): Promise<SysResult> {
  const board = loadBoard(ctx);
  const rawBoard = board as unknown as { viewport?: { x: number; y: number; zoom: number } };
  const viewport = rawBoard.viewport ?? null;
  if (json) return { ok: true, message: JSON.stringify(viewport), data: viewport };
  if (!viewport) return { ok: true, message: '(no viewport recorded)', data: null };
  return {
    ok: true,
    message: `x=${viewport.x}  y=${viewport.y}  zoom=${viewport.zoom}`,
    data: viewport,
  };
}

/**
 * `krnl settings mode [easy|advanced]` — show or set the UI mode
 * (docs/06-requirements/easy-mode.md). Display preference only: every other
 * command works the same in both modes.
 */
export function settingsMode(
  ctx: { boardPath: string; onBoardChanged?: () => void },
  mode: string | undefined,
): SysResult {
  const raw = loadBoardFrom(ctx.boardPath) as (Record<string, unknown> & { uiMode?: string }) | null;
  if (!raw) return { ok: false, message: 'No board found' };
  const current = raw.uiMode === 'easy' ? 'easy' : 'advanced';
  if (mode === undefined) return { ok: true, message: `mode: ${current}`, data: { mode: current } };
  if (mode !== 'easy' && mode !== 'advanced') {
    return { ok: false, message: `settings mode: expected easy or advanced, got "${mode}"` };
  }
  saveBoardTo(ctx.boardPath, { ...raw, uiMode: mode, savedAt: new Date().toISOString() });
  ctx.onBoardChanged?.();
  return { ok: true, message: `mode: ${mode}`, data: { mode } };
}

/**
 * `krnl settings grid [off|cards|all]` — show or set Align to grid: things
 * moved on the canvas settle on an invisible grid, never on top of each other
 * (Settings → General → Canvas). `cards` = plan, habit and event cards only;
 * `all` = also notes, shapes, images and frames; `on` means `cards`.
 * Turning it on tidies the canvas once.
 */
export function settingsGrid(
  ctx: { boardPath: string; onBoardChanged?: () => void },
  value: string | undefined,
): SysResult {
  const raw = loadBoardFrom(ctx.boardPath) as (Record<string, unknown> & { alignGrid?: unknown }) | null;
  if (!raw) return { ok: false, message: 'No board found' };
  const current = raw.alignGrid === 'cards' || raw.alignGrid === 'all' ? raw.alignGrid : 'off';
  if (value === undefined) return { ok: true, message: `grid: ${current}`, data: { grid: current } };
  const asked = value.toLowerCase();
  const v = asked === 'on' ? 'cards' : asked;
  if (v !== 'off' && v !== 'cards' && v !== 'all') return { ok: false, message: `settings grid: expected off, cards or all, got "${value}"` };
  const { alignGrid: _old, ...rest } = raw;
  void _old;
  saveBoardTo(ctx.boardPath, { ...rest, ...(v === 'off' ? {} : { alignGrid: v }), savedAt: new Date().toISOString() });
  ctx.onBoardChanged?.();
  return { ok: true, message: `grid: ${v}${v === 'off' ? '' : v === 'cards' ? ' (plan, habit and event cards settle on the grid)' : ' (everything you move settles on the grid)'}`, data: { grid: v } };
}

/**
 * `krnl settings layout [station|canvas]` — show or set the layout (ADR 0008):
 * Station docks the windows beside the terminal, Canvas is the free board.
 * The top-bar pill and ⌘⇧L set the same board field.
 */
export function settingsLayout(
  ctx: { boardPath: string; onBoardChanged?: () => void },
  layout: string | undefined,
): SysResult {
  const raw = loadBoardFrom(ctx.boardPath) as (Record<string, unknown> & { layoutMode?: string }) | null;
  if (!raw) return { ok: false, message: 'No board found' };
  const current = raw.layoutMode === 'station' ? 'station' : 'canvas';
  if (layout === undefined) return { ok: true, message: `layout: ${current}`, data: { layout: current } };
  if (layout !== 'station' && layout !== 'canvas') {
    return { ok: false, message: `settings layout: expected station or canvas, got "${layout}"` };
  }
  if (layout !== current) {
    saveBoardTo(ctx.boardPath, { ...raw, layoutMode: layout, savedAt: new Date().toISOString() });
    ctx.onBoardChanged?.();
  }
  return { ok: true, message: `layout: ${layout}`, data: { layout } };
}
