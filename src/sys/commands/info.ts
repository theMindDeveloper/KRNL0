// `krnl info` — single-page "where am I?" summary for in-terminal Claude.
// Counts, mother-node ids, theme. Designed so one call gives enough context
// to plan the next mutation.
//
// `krnl settings show` — theme + viewport + boardPath + version.
// `krnl viewport show` — viewport coords.

import { loadBoardFrom, saveBoardTo } from '../../main/persistence/board';
import type { SysResult } from '../SysFacade';
import type { BoardShape } from '../../shared/dispatch/types';
import type { StationGeometry } from '../../shared/types/board';
import { CLASSIC_HIDDEN, CLASSIC_SLOTS, LAYOUT_OPTIONS, STATION_PRESETS, freshLayout, isStationPreset, layoutChoiceOf, layoutLabel, parseLayoutChoice, presetOf, resetClassicGeometry, withPreset, type LayoutChoice } from '../../shared/stationLayouts';

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
  // Easy is retired (2026-11-25): KRNL0 has one mode.
  if (mode === 'easy') return { ok: false, message: 'settings mode: Easy mode is gone; KRNL0 has one mode (advanced)' };
  if (mode !== 'advanced') {
    return { ok: false, message: `settings mode: expected advanced, got "${mode}"` };
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
  const current = raw.alignGrid === 'all' ? 'all' : raw.alignGrid === 'cards' || raw.alignGrid === true ? 'cards' : 'off';
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
 * `krnl settings station-layout [classic|grid|planner]` (Decision 54) — which
 * arrangement the Station uses, without leaving Free if you are there. Each
 * preset keeps its own panel sizes. `settings layout` picks the same and also
 * switches to the Station.
 */
export function settingsStationLayout(
  ctx: { boardPath: string; onBoardChanged?: () => void },
  preset: string | undefined,
): SysResult {
  const raw = loadBoardFrom(ctx.boardPath) as (Record<string, unknown> & { layoutGeometry?: { station?: StationGeometry } }) | null;
  if (!raw) return { ok: false, message: 'No board found' };
  const station = raw.layoutGeometry?.station;
  const current = presetOf(station);
  if (preset === undefined) return { ok: true, message: `station layout: ${current}`, data: { preset: current } };
  const want = preset.trim().toLowerCase();
  // Decision 60 — one Station arrangement: My layout (classic).
  if (!isStationPreset(want) || !STATION_PRESETS.includes(want)) {
    return { ok: false, message: `settings station-layout: expected ${STATION_PRESETS.join(', ')}, got "${preset}"` };
  }
  if (want !== current || station?.preset === undefined) {
    saveBoardTo(ctx.boardPath, { ...raw, layoutGeometry: { ...raw.layoutGeometry, station: withPreset(station, want) }, savedAt: new Date().toISOString() });
    ctx.onBoardChanged?.();
  }
  const note = raw['layoutMode'] === 'station' ? '' : ` (shows in the Station: krnl settings layout ${want})`;
  return { ok: true, message: `station layout: ${want}${note}`, data: { preset: want } };
}

/**
 * `krnl settings layout [classic|grid|planner|free]` — show or pick the layout,
 * the same list as the top bar's layout menu (Decision 54): Classic, Grid and
 * Planner are the Station's presets, Free is the canvas. The older words still
 * work: `station` (the Station with its last preset) and `canvas` (Free).
 */
export function settingsLayout(
  ctx: { boardPath: string; onBoardChanged?: () => void },
  layout: string | undefined,
): SysResult {
  const raw = loadBoardFrom(ctx.boardPath) as (Record<string, unknown> & { layoutMode?: string; layoutGeometry?: { station?: StationGeometry } }) | null;
  if (!raw) return { ok: false, message: 'No board found' };
  const station = raw.layoutGeometry?.station;
  const current = layoutChoiceOf(raw.layoutMode, station);
  const describe = (c: LayoutChoice): string => `layout: ${c} — ${layoutLabel(c)}${c === 'free' ? ' (canvas)' : ' (Station)'}`;
  const dataOf = (c: LayoutChoice) => ({ layout: c, mode: c === 'free' ? 'canvas' : 'station', ...(c === 'free' ? {} : { preset: c }) });
  if (layout === undefined) {
    const options = LAYOUT_OPTIONS.map((o) => `  ${o.id.padEnd(8)} ${o.label} — ${o.hint}${o.group === 'ready' ? ' (back as designed each time)' : ''}`).join('\n') + '\n  reset    put the layout in use back as it came';
    return { ok: true, message: `${describe(current)}\n${options}`, data: dataOf(current) };
  }
  // Decision 59 — `reset`: My layout back to how it came (every window in its
  // first place and size), or the ready-made layout in use back as designed.
  if (layout.trim().toLowerCase() === 'reset') {
    const preset = presetOf(station);
    const next: Record<string, unknown> = { ...raw, savedAt: new Date().toISOString(), layoutMode: 'station' };
    if (preset === 'classic') {
      next['layoutGeometry'] = { ...raw.layoutGeometry, station: resetClassicGeometry(station) };
      next['nodes'] = ((raw['nodes'] as Array<Record<string, unknown>> | undefined) ?? []).map((n) => {
        const slot = n['isMother'] === true ? CLASSIC_SLOTS[String(n['kind'])] : undefined;
        if (!slot) return n;
        const cfg = (n['config'] as Record<string, unknown> | undefined) ?? {};
        return { ...n, config: { ...cfg, stationSlot: slot, stationHidden: CLASSIC_HIDDEN.has(String(n['kind'])) } };
      });
    } else {
      next['layoutGeometry'] = { ...raw.layoutGeometry, station: freshLayout(station, preset) };
    }
    saveBoardTo(ctx.boardPath, next);
    ctx.onBoardChanged?.();
    return { ok: true, message: `layout: ${preset} — ${layoutLabel(preset)} reset`, data: dataOf(preset) };
  }
  const want = parseLayoutChoice(layout, presetOf(station));
  if (!want) {
    return { ok: false, message: `settings layout: expected ${LAYOUT_OPTIONS.map((o) => o.id).join(', ')} or reset, got "${layout}"` };
  }
  // A ready-made layout comes back as designed every time it is picked.
  if (want !== current || (want !== 'free' && station?.preset === undefined) || (want === 'grid' || want === 'planner')) {
    const next: Record<string, unknown> = { ...raw, savedAt: new Date().toISOString() };
    if (want === 'free') next['layoutMode'] = 'canvas';
    else {
      next['layoutMode'] = 'station';
      next['layoutGeometry'] = { ...raw.layoutGeometry, station: freshLayout(station, want) };
    }
    saveBoardTo(ctx.boardPath, next);
    ctx.onBoardChanged?.();
  }
  return { ok: true, message: describe(want), data: dataOf(want) };
}
