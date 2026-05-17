// sys frame — CLI CRUD for FrameNodes (Decision 29 §5).
// Headless-capable: all operations read/write board.json directly.

import { randomUUID } from 'crypto';
import { loadBoardFrom, saveBoardTo } from '../../main/persistence/board';
import type { SysResult } from '../SysFacade';
import {
  frameSetLabel,
  frameSetSize,
  frameSetTint,
} from '../../renderer/components/nodes/FrameNode/commands';
import {
  defaultFrameState,
  defaultFrameConfig,
} from '../../renderer/components/nodes/FrameNode/types';
import type { FrameState, FrameConfig, FrameTint } from '../../renderer/components/nodes/FrameNode/types';
import { FRAME_PADDING, FRAME_MIN_W, FRAME_MIN_H } from '../layout';

export interface FrameCtx {
  boardPath: string;
  onBoardChanged?: () => void;
}

const VALID_TINTS: readonly FrameTint[] = ['cyan', 'spine', 'rust', 'plum', 'neutral'];

function isFrameTint(v: unknown): v is FrameTint {
  return typeof v === 'string' && (VALID_TINTS as readonly string[]).includes(v);
}

interface AnyNode {
  id: string;
  kind: string;
  isMother?: boolean;
  position?: { x: number; y: number };
  state: unknown;
  config?: unknown;
  [k: string]: unknown;
}

interface BoardShape {
  nodes: AnyNode[];
  edges: unknown[];
  [k: string]: unknown;
}

function loadBoard(ctx: FrameCtx): BoardShape {
  const raw = loadBoardFrom(ctx.boardPath);
  if (typeof raw !== 'object' || raw === null) return { nodes: [], edges: [] };
  const b = raw as Record<string, unknown>;
  if (!Array.isArray(b['nodes'])) b['nodes'] = [];
  if (!Array.isArray(b['edges'])) b['edges'] = [];
  return b as unknown as BoardShape;
}

function saveBoard(ctx: FrameCtx, board: BoardShape): void {
  saveBoardTo(ctx.boardPath, { ...(board as unknown as Record<string, unknown>), savedAt: new Date().toISOString() });
  ctx.onBoardChanged?.();
}

/** Resolve a frame node ref: exact id → ≥4-char id prefix. */
function resolveFrame(
  nodes: AnyNode[],
  ref: string,
): { node: AnyNode } | { error: string } {
  const byId = nodes.find((n) => n.kind === 'frame' && n.id === ref);
  if (byId) return { node: byId };
  if (ref.length >= 4) {
    const byPrefix = nodes.filter((n) => n.kind === 'frame' && n.id.startsWith(ref));
    if (byPrefix.length === 1) return { node: byPrefix[0]! };
    if (byPrefix.length > 1) {
      return { error: `Ambiguous frame ref "${ref}" — matches: ${byPrefix.map((n) => n.id.slice(0, 13)).join(', ')}` };
    }
  }
  return { error: `No frame matching "${ref}"` };
}

/** Read source node geometry for --near positioning. */
function resolveSourceGeometry(
  nodes: AnyNode[],
  ref: string,
): { x: number; y: number; w: number; h: number } | null {
  // Accept any node by id or ≥4-char prefix
  let src: AnyNode | undefined;
  src = nodes.find((n) => n.id === ref);
  if (!src && ref.length >= 4) {
    const matches = nodes.filter((n) => n.id.startsWith(ref));
    if (matches.length === 1) src = matches[0];
  }
  if (!src) return null;

  const pos = src.position ?? { x: 0, y: 0 };
  const state = src.state as Record<string, unknown> | null | undefined;

  // Read width/height from state (TextNode, ImageNode) or use kind-based defaults
  let w = 0;
  let h = 0;
  if (state) {
    w = typeof state['width'] === 'number' ? state['width'] : 0;
    h = typeof state['height'] === 'number' ? state['height'] : 0;
  }
  if (w === 0 || h === 0) {
    // Kind-based dimension defaults (visual approximations)
    switch (src.kind) {
      case 'text':     w = w || 200; h = h || 80; break;
      case 'image':    w = w || 240; h = h || 180; break;
      case 'frame':    {
        const fs = state as Partial<FrameState> | null;
        w = w || (fs?.width ?? 360);
        h = h || (fs?.height ?? 240);
        break;
      }
      case 'todo.task': w = 220; h = 140; break;
      default:         w = w || 280; h = h || 200; break;
    }
  }
  return { x: pos.x, y: pos.y, w, h };
}

// ── Commands ────────────────────────────────────────────────────────────────

export async function frameAdd(
  ctx: FrameCtx,
  opts: {
    label?: string;
    at?: { x: number; y: number };
    w?: number;
    h?: number;
    tint?: string;
    near?: string;
  },
): Promise<SysResult> {
  const board = loadBoard(ctx);

  // Validate tint
  const tintVal: FrameTint = isFrameTint(opts.tint) ? opts.tint : 'neutral';
  const explicitW = typeof opts.w === 'number' && opts.w > 0;
  const explicitH = typeof opts.h === 'number' && opts.h > 0;
  let width = explicitW ? Math.round(opts.w as number) : 360;
  let height = explicitH ? Math.round(opts.h as number) : 240;
  const label = opts.label ?? '';

  let position: { x: number; y: number };
  let childIds: string[] = [];

  if (opts.near) {
    // --near: position frame so the source node's center sits inside it,
    // seed childIds with [sourceId]. When --w / --h aren't given, size
    // the frame so it actually CONTAINS the source plus comfortable
    // padding — the old fixed 360×240 default was often smaller than the
    // source it was anchoring, which read as a layout bug in
    // AI-generated pipelines.
    const srcGeo = resolveSourceGeometry(board.nodes, opts.near);
    if (!srcGeo) {
      return { ok: false, message: `--near: no node matching "${opts.near}"` };
    }
    // Resolve the actual source node id (for childIds seeding)
    let srcId: string | undefined;
    const exactSrc = board.nodes.find((n) => n.id === opts.near);
    if (exactSrc) {
      srcId = exactSrc.id;
    } else if (opts.near.length >= 4) {
      const prefixed = board.nodes.filter((n) => n.id.startsWith(opts.near!));
      if (prefixed.length === 1) srcId = prefixed[0]!.id;
    }

    if (!explicitW) {
      width = Math.max(FRAME_MIN_W, srcGeo.w + 2 * FRAME_PADDING);
    }
    if (!explicitH) {
      height = Math.max(FRAME_MIN_H, srcGeo.h + 2 * FRAME_PADDING);
    }

    const srcCenterX = srcGeo.x + srcGeo.w / 2;
    const srcCenterY = srcGeo.y + srcGeo.h / 2;
    // Frame top-left = srcCenter - (frameW/2, frameH/2)
    position = {
      x: Math.round(srcCenterX - width / 2),
      y: Math.round(srcCenterY - height / 2),
    };
    if (srcId) childIds = [srcId];
  } else if (opts.at) {
    position = opts.at;
  } else {
    // Default: viewport center if known, else (0, 0).
    // Canvas center = (-vp.x / vp.zoom, -vp.y / vp.zoom).
    // Frame top-left = canvas center - (width/2, height/2).
    const rawBoard = board as unknown as { viewport?: { x: number; y: number; zoom: number } };
    const vp = rawBoard.viewport;
    if (vp) {
      const centerX = Math.round(-vp.x / vp.zoom);
      const centerY = Math.round(-vp.y / vp.zoom);
      position = { x: centerX - Math.round(width / 2), y: centerY - Math.round(height / 2) };
    } else {
      position = { x: 0, y: 0 };
    }
  }

  const state: FrameState = {
    ...defaultFrameState(),
    label,
    width,
    height,
    childIds,
  };
  const config: FrameConfig = { tint: tintVal };

  const id = `frame-${randomUUID()}`;
  const node: AnyNode = {
    id,
    kind: 'frame',
    isMother: false,
    position,
    state,
    config,
  };

  board.nodes = [...board.nodes, node];
  saveBoard(ctx, board);

  return {
    ok: true,
    message: `frame added: ${id.slice(0, 13)}… at (${position.x}, ${position.y}) size ${width}×${height} tint=${tintVal}${childIds.length > 0 ? ` childIds=[${childIds[0]!.slice(0, 8)}…]` : ''}`,
    data: { id, position, width, height, tint: tintVal, childIds },
  };
}

export async function frameLabel(
  ctx: FrameCtx,
  ref: string | undefined,
  label: string | undefined,
): Promise<SysResult> {
  if (!ref) return { ok: false, message: 'frame label requires <ref>' };
  if (label === undefined) return { ok: false, message: 'frame label requires "<text>"' };
  const board = loadBoard(ctx);
  const resolved = resolveFrame(board.nodes, ref);
  if ('error' in resolved) return { ok: false, message: resolved.error };
  const node = resolved.node;
  const nextState = frameSetLabel(node.state as FrameState, { label });
  board.nodes = board.nodes.map((n) => n.id === node.id ? { ...n, state: nextState } : n);
  saveBoard(ctx, board);
  return { ok: true, message: `frame ${node.id.slice(0, 8)}: label → "${label}"`, data: { id: node.id } };
}

export async function frameResize(
  ctx: FrameCtx,
  ref: string | undefined,
  w: number | undefined,
  h: number | undefined,
): Promise<SysResult> {
  if (!ref) return { ok: false, message: 'frame resize requires <ref>' };
  if (w === undefined || isNaN(w) || w <= 0) return { ok: false, message: 'frame resize requires --w N (positive number)' };
  if (h === undefined || isNaN(h) || h <= 0) return { ok: false, message: 'frame resize requires --h N (positive number)' };
  const board = loadBoard(ctx);
  const resolved = resolveFrame(board.nodes, ref);
  if ('error' in resolved) return { ok: false, message: resolved.error };
  const node = resolved.node;
  const nextState = frameSetSize(node.state as FrameState, { width: w, height: h });
  board.nodes = board.nodes.map((n) => n.id === node.id ? { ...n, state: nextState } : n);
  saveBoard(ctx, board);
  return { ok: true, message: `frame ${node.id.slice(0, 8)}: resized to ${Math.round(w)}×${Math.round(h)}`, data: { id: node.id, width: Math.round(w), height: Math.round(h) } };
}

export async function frameTint(
  ctx: FrameCtx,
  ref: string | undefined,
  tint: string | undefined,
): Promise<SysResult> {
  if (!ref) return { ok: false, message: 'frame tint requires <ref>' };
  if (!tint || !isFrameTint(tint)) {
    return { ok: false, message: `frame tint requires a valid tint: ${VALID_TINTS.join(', ')}` };
  }
  const board = loadBoard(ctx);
  const resolved = resolveFrame(board.nodes, ref);
  if ('error' in resolved) return { ok: false, message: resolved.error };
  const node = resolved.node;
  const nextConfig = frameSetTint((node.config ?? {}) as FrameConfig, { tint });
  board.nodes = board.nodes.map((n) => n.id === node.id ? { ...n, config: nextConfig } : n);
  saveBoard(ctx, board);
  return { ok: true, message: `frame ${node.id.slice(0, 8)}: tint → ${tint}`, data: { id: node.id, tint } };
}

export async function frameList(ctx: FrameCtx, json = false): Promise<SysResult> {
  const board = loadBoard(ctx);
  const frames = board.nodes.filter((n) => n.kind === 'frame');
  if (json) {
    const payload = frames.map((n) => ({ id: n.id, ...(n.state as FrameState), tint: (n.config as FrameConfig | undefined)?.tint ?? 'neutral', position: n.position }));
    return { ok: true, message: JSON.stringify(payload), data: payload };
  }
  if (frames.length === 0) {
    return { ok: true, message: '(no frames)', data: [] };
  }
  const lines = frames.map((n) => {
    const s = n.state as FrameState;
    const tint = (n.config as FrameConfig | undefined)?.tint ?? 'neutral';
    const pos = n.position ?? { x: 0, y: 0 };
    return `  ${n.id.slice(0, 13)}  "${s.label}"  ${s.width}×${s.height}  tint=${tint}  pos=(${pos.x},${pos.y})  children=${s.childIds.length}`;
  });
  return { ok: true, message: `frames (${frames.length}):\n${lines.join('\n')}`, data: frames.map((n) => n.id) };
}

/**
 * `krnl frame fit <ref> [--padding N]` — resize, reposition, AND gather.
 *
 * Two-phase contract:
 *   1. Gather — walk every non-frame, non-mother node on the board. Any
 *      whose center sits inside the frame's CURRENT bounds is added to
 *      the frame's `state.childIds` (if not already there). This is the
 *      headless analogue of the renderer's drag-end spatial recompute:
 *      after a CLI chain spawns into a frame, those tasks are inside
 *      the frame's rect but `childIds` is still just the original
 *      `--near` seed. Without the gather step the user's drag-frame-
 *      moves-children behaviour silently drops everything but the seed.
 *   2. Fit — compute the bounding box of every resolved child, then
 *      resize and reposition the frame so it wraps the box with
 *      `padding` (default FRAME_PADDING = 40 px) on every side.
 *
 * If childIds is empty AND gather found nothing inside the frame, the
 * command leaves the frame unchanged and reports it.
 *
 * This is the AI-facing automation for the user's "frames don't actually
 * own the things inside them" complaint (2026-05-17 feedback round 2).
 */
export async function frameFit(
  ctx: FrameCtx,
  ref: string | undefined,
  paddingArg: number | undefined,
): Promise<SysResult> {
  if (!ref) return { ok: false, message: 'frame fit requires <ref>' };
  const padding = (typeof paddingArg === 'number' && paddingArg >= 0)
    ? Math.round(paddingArg)
    : FRAME_PADDING;

  const board = loadBoard(ctx);
  const resolved = resolveFrame(board.nodes, ref);
  if ('error' in resolved) return { ok: false, message: resolved.error };
  const frameNode = resolved.node;
  const state = frameNode.state as FrameState;

  // Phase 1: gather any non-frame, non-mother node whose center lies
  // inside the frame's current bounds. Mothers are excluded because
  // they shouldn't be inside frames; frames are excluded because nested
  // frames are not in our model.
  const frameX = frameNode.position?.x ?? 0;
  const frameY = frameNode.position?.y ?? 0;
  const frameW = state.width;
  const frameH = state.height;
  const frameRight = frameX + frameW;
  const frameBottom = frameY + frameH;
  const existing = new Set(state.childIds ?? []);
  const gathered: string[] = [];
  for (const candidate of board.nodes) {
    if (candidate.id === frameNode.id) continue;
    if (candidate.kind === 'frame') continue;
    if (candidate.isMother) continue;
    if (existing.has(candidate.id)) continue;
    const geo = resolveSourceGeometry(board.nodes, candidate.id);
    if (!geo) continue;
    const cx = geo.x + geo.w / 2;
    const cy = geo.y + geo.h / 2;
    if (cx >= frameX && cx <= frameRight && cy >= frameY && cy <= frameBottom) {
      gathered.push(candidate.id);
      existing.add(candidate.id);
    }
  }
  const mergedChildIds = [...(state.childIds ?? []), ...gathered];

  if (mergedChildIds.length === 0) {
    return {
      ok: false,
      message: `frame ${frameNode.id.slice(0, 8)} has no childIds and nothing inside its bounds — nothing to fit. Move nodes so their centers are inside the frame, then re-run.`,
    };
  }

  // Phase 2: bounding box over all resolved children.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let resolvedCount = 0;
  for (const childId of mergedChildIds) {
    const geo = resolveSourceGeometry(board.nodes, childId);
    if (!geo) continue;
    resolvedCount++;
    if (geo.x < minX) minX = geo.x;
    if (geo.y < minY) minY = geo.y;
    if (geo.x + geo.w > maxX) maxX = geo.x + geo.w;
    if (geo.y + geo.h > maxY) maxY = geo.y + geo.h;
  }
  if (resolvedCount === 0) {
    return {
      ok: false,
      message: `frame ${frameNode.id.slice(0, 8)}: none of the ${mergedChildIds.length} childId(s) resolve to live nodes.`,
    };
  }

  const newX = Math.round(minX - padding);
  const newY = Math.round(minY - padding);
  const newW = Math.max(FRAME_MIN_W, Math.round((maxX - minX) + 2 * padding));
  const newH = Math.max(FRAME_MIN_H, Math.round((maxY - minY) + 2 * padding));

  const nextState: FrameState = { ...state, width: newW, height: newH, childIds: mergedChildIds };
  board.nodes = board.nodes.map((n) =>
    n.id === frameNode.id
      ? { ...n, position: { x: newX, y: newY }, state: nextState }
      : n,
  );
  saveBoard(ctx, board);

  return {
    ok: true,
    message: `frame ${frameNode.id.slice(0, 8)}: fitted to ${resolvedCount}/${mergedChildIds.length} children (${gathered.length} newly gathered) → pos=(${newX},${newY}) size=${newW}×${newH} padding=${padding}`,
    data: {
      id: frameNode.id,
      position: { x: newX, y: newY },
      width: newW,
      height: newH,
      padding,
      childrenResolved: resolvedCount,
      childrenTotal: mergedChildIds.length,
      childrenGathered: gathered,
    },
  };
}

export async function frameContents(
  ctx: FrameCtx,
  ref: string | undefined,
  json = false,
): Promise<SysResult> {
  if (!ref) return { ok: false, message: 'frame contents requires <ref>' };
  const board = loadBoard(ctx);
  const resolved = resolveFrame(board.nodes, ref);
  if ('error' in resolved) return { ok: false, message: resolved.error };
  const node = resolved.node;
  const state = node.state as FrameState;
  const childIds = state.childIds ?? [];
  if (json) return { ok: true, message: JSON.stringify(childIds), data: childIds };
  if (childIds.length === 0) return { ok: true, message: '(no children)', data: [] };
  return {
    ok: true,
    message: `frame ${node.id.slice(0, 8)} children (${childIds.length}):\n${childIds.map((id) => `  ${id}`).join('\n')}`,
    data: childIds,
  };
}
