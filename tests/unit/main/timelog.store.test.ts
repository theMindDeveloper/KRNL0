/**
 * Decision 35 — the main-process time log store (time-log F1, F4, NF1, NF2, NF4).
 * Pure fs on a temp board dir: monthly .jsonl files, atomic line appends,
 * torn-line tolerance, range reads across months, idempotent backfill.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  appendTimeLog,
  ensureTimeLogBackfilled,
  listTimeLogMonths,
  logBoardChange,
  monthFilePath,
  queryTimeLog,
  readTimeLog,
  readTimeLogMonth,
  resetTimeLogBackfillMemo,
  timeLogDir,
  BACKFILL_MARKER,
} from '../../../src/main/persistence/timelog';
import { stampEntry } from '../../../src/shared/timelog';

const at = (y: number, mo: number, d: number, h = 0, mi = 0): string => new Date(y, mo - 1, d, h, mi).toISOString();

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'krnl0-timelog-'));
  resetTimeLogBackfillMemo();
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const closed = (id: string, start: string, end: string) => ({
  type: 'span.closed' as const, spanId: id, taskId: 't1', taskText: 'Math', tag: 'study', kind: 'work' as const, startedAt: start, endedAt: end,
});

describe('append + read (F1, NF2)', () => {
  it('a closed span on 2026-11-05 lands as one line in timelog/2026-11.jsonl', () => {
    appendTimeLog(dir, [closed('s1', at(2026, 11, 5, 9), at(2026, 11, 5, 9, 25))], Date.parse(at(2026, 11, 5, 9, 25)));
    const text = readFileSync(join(dir, 'timelog', '2026-11.jsonl'), 'utf-8');
    expect(text.endsWith('\n')).toBe(true);
    const lines = text.trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({ v: 1, type: 'span.closed', taskId: 't1', taskText: 'Math' });
    // NF1: the board is never touched by the log.
    expect(existsSync(join(dir, 'board.json'))).toBe(false);
  });

  it('routes entries to their own month file and reads across months in log order', () => {
    appendTimeLog(dir, [{ ...closed('a', at(2026, 10, 31, 22), at(2026, 10, 31, 23)), at: at(2026, 10, 31, 23) }]);
    appendTimeLog(dir, [{ ...closed('b', at(2026, 11, 1, 9), at(2026, 11, 1, 10)), at: at(2026, 11, 1, 10) }]);
    appendTimeLog(dir, [{ type: 'span.deleted', spanId: 'a', at: at(2026, 12, 2, 8) }]);
    expect(listTimeLogMonths(dir)).toEqual(['2026-10', '2026-11', '2026-12']);
    expect(readTimeLog(dir).map((e) => e.type === 'span.deleted' ? `del:${e.spanId}` : e.type === 'span.closed' ? e.spanId : e.type)).toEqual(['a', 'b', 'del:a']);
    expect(readTimeLog(dir, { fromMonth: '2026-11', toMonth: '2026-11' })).toHaveLength(1);
  });

  it('skips a torn last line and keeps the next append on its own line', () => {
    const path = monthFilePath(dir, '2026-11');
    mkdirSync(timeLogDir(dir), { recursive: true });
    writeFileSync(path, JSON.stringify(stampEntry({ type: 'span.deleted', spanId: 'x', at: at(2026, 11, 2) })) + '\n', 'utf-8');
    appendFileSync(path, '{"v":1,"id":"torn","at":"2026-11-0', 'utf-8'); // crash mid-line
    expect(readTimeLogMonth(dir, '2026-11')).toHaveLength(1);
    appendTimeLog(dir, [{ type: 'span.deleted', spanId: 'y', at: at(2026, 11, 3) }]);
    const entries = readTimeLogMonth(dir, '2026-11');
    expect(entries.map((e) => (e.type === 'span.deleted' ? e.spanId : ''))).toEqual(['x', 'y']);
  });

  it('query reads from a little before `from` through the newest file (later corrections)', () => {
    appendTimeLog(dir, [{ type: 'plan.set', taskId: 't', taskText: 'T', start: '2026-11-20T09:00', durationMin: 30, at: at(2026, 9, 15) }]);
    appendTimeLog(dir, [{ type: 'span.deleted', spanId: 'z', at: at(2027, 1, 3) }]);
    appendTimeLog(dir, [{ type: 'span.deleted', spanId: 'old', at: at(2026, 1, 3) }]);
    const types = queryTimeLog(dir, '2026-11-01', '2026-11-30').map((e) => e.at);
    expect(types).toEqual([at(2026, 9, 15), at(2027, 1, 3)]);
    expect(() => queryTimeLog(dir, '2026-11', '2026-11-30')).toThrow();
  });

  it('each board dir has its own timelog/ (NF4)', () => {
    const other = mkdtempSync(join(tmpdir(), 'krnl0-timelog-other-'));
    try {
      appendTimeLog(dir, [{ type: 'span.deleted', spanId: 'a' }]);
      expect(readTimeLog(other)).toEqual([]);
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });
});

describe('backfill (F4)', () => {
  const rec = (id: string, h: number) => ({ id, startedAt: at(2026, 11, 3, h), endedAt: at(2026, 11, 3, h, 25), durationMin: 25, label: 'x', completed: true, taskId: null, kind: 'work' });
  const board = {
    nodes: [
      { id: 'mother-pomo', kind: 'pomo', state: { history: [rec('r1', 9), rec('r2', 10), rec('r3', 11)] } },
      { id: 't1', kind: 'todo.task', state: { text: 'Plan me', done: false, plannedMin: 30, scheduledFor: '2026-11-09T09:00' } },
    ],
    completions: [{ taskId: 't0', text: 'Old', plannedMin: 20, completedAt: at(2026, 10, 2, 12) }],
  };

  it('a board with 3 recorded spans started twice has exactly 3 span.closed lines', () => {
    expect(ensureTimeLogBackfilled(dir, board)).toBe(5);
    expect(existsSync(join(timeLogDir(dir), BACKFILL_MARKER))).toBe(true);
    resetTimeLogBackfillMemo(); // a second app start
    expect(ensureTimeLogBackfilled(dir, board)).toBe(0);
    const all = readTimeLog(dir);
    expect(all.filter((e) => e.type === 'span.closed')).toHaveLength(3);
    expect(all.filter((e) => e.type === 'task.completed')[0]!.at).toBe(at(2026, 10, 2, 12));
    expect(listTimeLogMonths(dir)).toContain('2026-10');
  });

  it('skips what an earlier append already logged, and reads the board only when due', () => {
    appendTimeLog(dir, [{ ...closed('r1', at(2026, 11, 3, 9), at(2026, 11, 3, 9, 25)) }]);
    expect(ensureTimeLogBackfilled(dir, board)).toBe(4);
    let reads = 0;
    expect(ensureTimeLogBackfilled(dir, () => { reads++; return board; })).toBe(0);
    expect(reads).toBe(0);
  });

  it('one record with a garbage time is skipped: the rest backfill, the marker is written, later changes still log', () => {
    const bad = { ...rec('bad', 12), endedAt: 'yesterday-ish' };
    const withBad = { ...board, nodes: [{ id: 'mother-pomo', kind: 'pomo', state: { history: [rec('r1', 9), bad] } }] };
    expect(ensureTimeLogBackfilled(dir, withBad)).toBe(2); // r1 + the completion
    expect(existsSync(join(timeLogDir(dir), BACKFILL_MARKER))).toBe(true);
    const next = { nodes: [{ id: 'mother-pomo', kind: 'pomo', state: { history: [rec('r1', 9), bad, rec('r9', 15)] } }] };
    expect(logBoardChange(dir, withBad, next).map((e) => e.type)).toEqual(['span.closed']);
  });

  it('an unreadable board leaves no marker so the next start retries', () => {
    expect(() => ensureTimeLogBackfilled(dir, () => { throw new Error('locked'); })).toThrow('locked');
    expect(existsSync(join(timeLogDir(dir), BACKFILL_MARKER))).toBe(false);
  });
});

describe('logBoardChange — the CLI writer', () => {
  it('backfills from the board before the change, then appends only the change', () => {
    const r = (id: string) => ({ id, startedAt: at(2026, 11, 5, 9), endedAt: at(2026, 11, 5, 9, 25), durationMin: 25, label: '', completed: false, taskId: null, kind: 'work' });
    const prev = { nodes: [{ id: 'p', kind: 'pomo', state: { history: [r('old')] } }] };
    const next = { nodes: [{ id: 'p', kind: 'pomo', state: { history: [r('old'), r('new')] } }] };
    const written = logBoardChange(dir, prev, next);
    expect(written.map((e) => e.type)).toEqual(['span.closed']);
    const ids = readTimeLog(dir).flatMap((e) => (e.type === 'span.closed' ? [e.spanId] : []));
    expect(ids.sort()).toEqual(['new', 'old']);
  });

  it('never throws and writes nothing when nothing changed', () => {
    expect(logBoardChange(dir, { nodes: [] }, { nodes: [] })).toEqual([]);
    expect(logBoardChange(dir, 'garbage', null)).toEqual([]);
    expect(existsSync(timeLogDir(dir))).toBe(false);
  });
});
