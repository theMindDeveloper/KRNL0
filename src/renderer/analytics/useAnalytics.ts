// useAnalytics — React hook that exposes the analytics engine to consumers
// (the AnalyticsNode, the future KRNL Dock, any other UI surface).
//
// Memoisation rule (Issue #134): the returned object identity only changes
// when board.nodes or board.edges change. The dock's per-second clock tick
// must NOT cause re-bucketing — that's why we subscribe to a narrow slice
// instead of the whole store.

import { useMemo } from 'react';
import { useBoardStore } from '../store/boardStore';
import { buildAnalytics } from './engine';
import { registerBuiltinSources } from './sources';
import type { AnalyticsResult, BoardLike } from './types';

// Register the builtin sources once at module load. New sources can call
// registerDataSource() before the first useAnalytics() invocation; later
// registrations also take effect on the next render.
registerBuiltinSources();

export function useAnalytics(): AnalyticsResult {
  // Subscribe ONLY to nodes + edges. The dock subscribes to viewport / tick
  // elsewhere; those updates must not invalidate the analytics memo.
  const nodes = useBoardStore((s) => s.board?.nodes);
  const edges = useBoardStore((s) => s.board?.edges);
  // #169 — completion ledger feeds taskSource; subscribe so a record/clear
  // re-buckets analytics even when no node changed in the same tick.
  const completions = useBoardStore((s) => s.board?.completions);

  return useMemo<AnalyticsResult>(() => {
    const board: BoardLike = { nodes: nodes ?? [], completions: completions ?? [] };
    return buildAnalytics(board);
    // `edges` is included in the dep so re-derivation runs when the board
    // structure changes — even though no current source reads edges, future
    // sources (e.g. task-chain progress) will.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, completions]);
}

export type { AnalyticsResult } from './types';
