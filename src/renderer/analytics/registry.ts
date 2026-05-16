// Pluggable data-source registry.
//
// The analytics engine knows nothing about TaskNode / HabitNode / PomoNode.
// Each concrete adapter lives in `sources/` and registers itself once at
// module-load time (the import in `useAnalytics.ts` triggers the side effect).
// Future nodes that emit observable signals can ship their own source file
// alongside the node code and call `registerDataSource()` — no edits to the
// engine, the charts, or the hook.

import type { AnalyticsDataSource, AnalyticsEvent, BoardLike } from './types';

const REGISTRY = new Map<string, AnalyticsDataSource>();

export function registerDataSource(source: AnalyticsDataSource): void {
  if (REGISTRY.has(source.id)) {
    // Re-registration is benign — most likely a test re-import. Replace.
  }
  REGISTRY.set(source.id, source);
}

export function unregisterDataSource(id: string): void {
  REGISTRY.delete(id);
}

export function listDataSources(): AnalyticsDataSource[] {
  return Array.from(REGISTRY.values());
}

export function clearDataSources(): void {
  REGISTRY.clear();
}

/** Run every registered source against the board and return the merged event
 *  stream, sorted ascending by date (stable). */
export function collectAllEvents(board: BoardLike): AnalyticsEvent[] {
  const out: AnalyticsEvent[] = [];
  for (const src of REGISTRY.values()) {
    try {
      const events = src.collect(board);
      for (const e of events) out.push(e);
    } catch {
      // One bad source must never break the dashboard. Silent skip — the node
      // can render an empty panel; failures bubble up in dev via React error
      // boundaries when a chart misreads its props.
    }
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}
