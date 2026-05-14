// Decision 24 — Unified Task Timeline Selector
// Single source of truth for "linked todo's plan as time."
// Pure function, no side effects, no React hooks.
// Memoized via reference identity on (nodes, edges, pomoConfig) — same pattern
// as _lastEdges / selectTaskChain in boardStore.ts.
//
// ADR 0003 §2 — buildChainIndex / walkChain / WalkUnit / ChainEntry / BranchEntry
// are now exported from ./chainWalker. Same module, same semantics, shared with
// scheduleSelector.ts. See design-pattern 6.10.

import type { Board, Edge, Node } from '../../shared/types';
import type { PomoConfig } from '../components/nodes/PomoNode/types';
import { defaultPomoConfig } from '../components/nodes/PomoNode/types';
import { buildChainIndex, walkChain } from './chainWalker';

// ── Public types ──────────────────────────────────────────────────────────────

// Decision 24.1 — palette is constrained to tokens defined in src/renderer/styles/tokens.css.
// Adding a name here without a matching `--<name>` definition will cause arcs to paint nothing.
// The contract test (tests/unit/renderer/timelineSelector.colorTokens.test.ts) enforces this.
export const COLORS = ['rose', 'amber', 'teal', 'lilac', 'sand', 'moss'] as const;
export type ColorToken = (typeof COLORS)[number];

export type TimelineSegment =
  | {
      kind: 'task';
      taskId: string;
      startMin: number;
      endMin: number;
      colorToken: ColorToken;
      done: boolean;
      parallelGroupId: string | null;
    }
  | {
      kind: 'break';
      breakId: string;
      startMin: number;
      endMin: number;
      breakKind: 'short' | 'long';
      afterTaskId: string;
    };

export interface ParallelGroup {
  groupId: string;
  taskIds: readonly string[];
  startMin: number;
  endMin: number;
}

export interface Timeline {
  todoId: string;
  segments: readonly TimelineSegment[];
  parallelGroups: ReadonlyMap<string, ParallelGroup>;
  totalMin: number;
  pomoSourceNodeId: string | null;
  /** Date.now() at computation time — for debug only, NOT a memo key. */
  computedAt: number;
}

// ── Module-level memo ─────────────────────────────────────────────────────────
// Reference identity on (nodes, edges, cfg). Zustand's set(...) always
// replaces the nodes/edges array reference, so reference-identity is a
// sufficient invalidation key with zero bookkeeping.

let _cacheKey: { nodes: unknown; edges: unknown; cfg: unknown } | null = null;
let _cache: ReadonlyMap<string, Timeline> = new Map();

// ── Dev-only palette warning ───────────────────────────────────────────────────
// Runs once at first selectTimelines call in a browser context (not in jsdom/Node).
// Logs any COLORS entry whose CSS variable is not resolved in the live theme,
// so future palette/token drift is caught at runtime before it reaches users.
let _paletteChecked = false;
function checkPaletteOnce(): void {
  if (_paletteChecked) return;
  // Skip in non-browser environments (Node.js test runner, electron main).
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  // Skip during test runs (jsdom doesn't apply tokens.css so custom properties
  // always resolve to empty — false positives would pollute test output).
  if (import.meta.env.MODE === 'test') return;
  _paletteChecked = true;
  try {
    const root = getComputedStyle(document.documentElement);
    const missing = (COLORS as readonly string[]).filter(
      (c) => root.getPropertyValue(`--${c}`).trim() === '',
    );
    if (missing.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        `[timelineSelector] Color tokens missing from theme: ${missing.join(', ')}. ` +
        `Arcs using these tokens will paint transparent. ` +
        `Add them to src/renderer/styles/tokens.css.`,
      );
    }
  } catch {
    // getComputedStyle can throw in unusual environments — never crash the selector.
  }
}

export function selectTimelines(board: Board | null): ReadonlyMap<string, Timeline> {
  checkPaletteOnce();
  if (!board) return _cache; // last good cache; safe (null board ⇒ no consumers)
  const pomo = board.nodes.find((n) => n.kind === 'pomo') ?? null;
  const cfg = (pomo?.config as PomoConfig | null) ?? null;
  if (
    _cacheKey !== null &&
    _cacheKey.nodes === board.nodes &&
    _cacheKey.edges === board.edges &&
    _cacheKey.cfg === cfg
  ) {
    return _cache;
  }
  _cacheKey = { nodes: board.nodes, edges: board.edges, cfg };
  _cache = buildAll(board.nodes, board.edges, cfg ?? defaultPomoConfig(), pomo?.id ?? null);
  return _cache;
}

export function selectTimeline(board: Board | null, todoId: string): Timeline | null {
  return selectTimelines(board).get(todoId) ?? null;
}

// ── Internals ─────────────────────────────────────────────────────────────────

function buildAll(
  nodes: readonly Node[],
  edges: readonly Edge[],
  cfg: PomoConfig,
  pomoSourceNodeId: string | null,
): ReadonlyMap<string, Timeline> {
  const chainIndex = buildChainIndex(edges);

  // Find all todo node ids
  const todoIds = nodes
    .filter((n) => n.kind === 'todo')
    .map((n) => n.id);

  const result = new Map<string, Timeline>();

  for (const todoId of todoIds) {
    const units = walkChain(todoId, nodes, chainIndex);
    const segments: TimelineSegment[] = [];
    const parallelGroups = new Map<string, ParallelGroup>();

    let cursor = 0;
    let breakCounter = 0;
    let colorIndex = 0;

    for (const unit of units) {
      if (unit.kind === 'task') {
        const start = cursor;
        const end = cursor + unit.plannedMin;
        const colorToken = COLORS[colorIndex % COLORS.length] ?? 'rose';
        colorIndex += 1;

        segments.push({
          kind: 'task',
          taskId: unit.taskId,
          startMin: start,
          endMin: end,
          colorToken,
          done: unit.done,
          parallelGroupId: null,
        });

        cursor = end;
      } else {
        // Parallel group
        const groupStart = cursor;
        const groupEnd =
          groupStart + Math.max(...unit.branches.map((b) => b.plannedMin));

        const groupTaskIds: string[] = [];
        for (const branch of unit.branches) {
          const colorToken = COLORS[colorIndex % COLORS.length] ?? 'rose';
          colorIndex += 1;

          segments.push({
            kind: 'task',
            taskId: branch.taskId,
            startMin: groupStart,
            endMin: groupStart + branch.plannedMin,
            colorToken,
            done: branch.done,
            parallelGroupId: unit.groupId,
          });

          groupTaskIds.push(branch.taskId);
        }

        parallelGroups.set(unit.groupId, {
          groupId: unit.groupId,
          taskIds: groupTaskIds,
          startMin: groupStart,
          endMin: groupEnd,
        });

        cursor = groupEnd;
      }

      // Insert break after each unit (task or group = 1 counter unit).
      // Q5: (counter + 1) % longBreakEvery === 0 → long, else short.
      // Note: selector emits a trailing break after the last unit; ClockNode
      // strips it at render time (see Decision 24 Q5). Calendar (v2) may keep it.
      breakCounter += 1;
      const isLong = breakCounter % cfg.longBreakEvery === 0;
      const breakLen = isLong ? cfg.longBreakMin : cfg.shortBreakMin;

      const afterTaskId =
        unit.kind === 'task' ? unit.taskId : unit.sentinelTaskId;

      segments.push({
        kind: 'break',
        breakId: `break-${afterTaskId}`,
        startMin: cursor,
        endMin: cursor + breakLen,
        breakKind: isLong ? 'long' : 'short',
        afterTaskId,
      });

      cursor += breakLen;
    }

    result.set(todoId, {
      todoId,
      segments,
      parallelGroups,
      totalMin: cursor,
      pomoSourceNodeId,
      computedAt: Date.now(),
    });
  }

  return result;
}
