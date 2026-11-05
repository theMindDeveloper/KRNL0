// Durable time log (Decision 35) — shared, pure API.
//
//   entries.ts   entry types + Zod schemas, stamp / parse helpers
//   diff.ts      timeLogEntriesFromBoards(prev, next): the writer choke point
//   backfill.ts  backfillEntries(board, existing): one-time F4 backfill
//   fold.ts      foldTimeLog(entries, { fromYMD, toYMD }): per-day summaries
//
// I/O lives in src/main/persistence/timelog.ts (main) and
// src/renderer/store/timeLog.ts (renderer, via IPC).

export * from './entries';
export * from './diff';
export * from './backfill';
export * from './fold';
