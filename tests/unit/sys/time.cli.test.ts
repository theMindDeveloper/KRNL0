/**
 * Decision 35 — CLI side of the durable time log.
 *  - F3: every pomo / task / todo verb that changes time-relevant state appends
 *    the matching entry (SysFacade diffs the board around the command).
 *  - F13: `krnl time log` / `krnl time report` parse and answer from the log.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { SysParser } from '../../../src/sys/parser';
import { seedBoard } from '../../../src/main/persistence/board';
import {
  appendTimeLog,
  readTimeLog,
  resetTimeLogBackfillMemo,
  timeLogDir,
} from '../../../src/main/persistence/timelog';
import { defaultPomoState } from '../../../src/renderer/components/nodes/PomoNode/types';
import type { TimeLogEntry } from '../../../src/shared/timelog';

vi.mock('electron', () => ({
  app: { getName: vi.fn(() => 'krnl0-test') },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
}));

const dir = mkdtempSync(join(tmpdir(), 'krnl0-time-cli-'));
const boardPath = join(dir, 'board.json');
// pomo verbs write through boardIo (KRNL0_BOARD_DIR); the rest through ctx.boardPath.
process.env['KRNL0_BOARD_DIR'] = dir;

let SysFacade: typeof import('../../../src/sys/SysFacade').SysFacade;
beforeAll(async () => {
  ({ SysFacade } = await import('../../../src/sys/SysFacade'));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const at = (y: number, mo: number, d: number, h = 0, mi = 0): string => new Date(y, mo - 1, d, h, mi).toISOString();

type Board = { nodes: Array<Record<string, unknown>>; [k: string]: unknown };
const readBoard = (): Board => JSON.parse(readFileSync(boardPath, 'utf-8')) as Board;
const writeBoard = (b: Board): void => writeFileSync(boardPath, JSON.stringify(b), 'utf-8');

function pomoNode(b: Board): Record<string, unknown> {
  return b.nodes.find((n) => n['kind'] === 'pomo' && n['isMother'] === true)!;
}

const SEG = (id: string, extra: Record<string, unknown> = {}) => ({
  id, startedAt: at(2026, 11, 3, 9), endedAt: at(2026, 11, 3, 9, 30), durationMin: 30, label: '', completed: false, taskId: null, kind: 'work', ...extra,
});

function reset(history: unknown[] = []): void {
  rmSync(timeLogDir(dir), { recursive: true, force: true });
  resetTimeLogBackfillMemo();
  const b = seedBoard() as unknown as Board;
  const p = pomoNode(b);
  p['state'] = { ...defaultPomoState(), history };
  writeBoard(b);
}

const run = (argv: string[]) => new SysFacade({ boardPath }).run(argv);
/** Entries this test's commands logged (not the one-time backfill). */
const logged = (since: number): TimeLogEntry[] => readTimeLog(dir).filter((e) => Date.parse(e.at) >= since);
const typesSince = (since: number): string[] => logged(since).map((e) => e.type);
/**
 * Position in the log, and the entries appended after it. A timestamp window
 * is not enough: on a fast machine the entry written just before
 * `Date.now()` can carry the very same millisecond and slip into the window.
 * readTimeLog keeps log order (stable sort by time), so new entries are last.
 */
const mark = (): number => readTimeLog(dir).length;
const loggedAfter = (n: number): TimeLogEntry[] => readTimeLog(dir).slice(n);

describe('CLI writers (F3)', () => {
  let t0 = 0;
  beforeEach(() => {
    reset();
    t0 = Date.now() - 1000;
  });

  it('todo add → task.created; task edit → task.renamed', async () => {
    expect((await run(['todo', 'add', 'Math homework'])).ok).toBe(true);
    expect(logged(t0)).toEqual([expect.objectContaining({ type: 'task.created', taskText: 'Math homework' })]);
    const m1 = mark();
    expect((await run(['task', 'edit', 'Math homework', 'Physics homework'])).ok).toBe(true);
    expect(loggedAfter(m1)).toEqual([expect.objectContaining({ type: 'task.renamed', taskText: 'Physics homework' })]);
  });

  it('task toggle → task.completed, again → task.reopened, again → a second task.completed (F5)', async () => {
    await run(['todo', 'add', 'Deploy']);
    const m1 = mark();
    await run(['task', 'toggle', 'Deploy']);
    await run(['task', 'toggle', 'Deploy']);
    await run(['task', 'toggle', 'Deploy']);
    expect(loggedAfter(m1).map((e) => e.type)).toEqual(['task.completed', 'task.reopened', 'task.completed']);
    expect(loggedAfter(m1)[0]).toMatchObject({ taskText: 'Deploy' });
  });

  it('task schedule → plan.set, moved → plan.set, unschedule → plan.cleared', async () => {
    await run(['todo', 'add', 'Deploy']);
    const m1 = mark();
    expect((await run(['task', 'schedule', 'Deploy', '--at', '2026-11-09T10:00', '--duration', '45'])).ok).toBe(true);
    expect((await run(['task', 'schedule', 'Deploy', '--at', '2026-11-11T10:00'])).ok).toBe(true);
    expect((await run(['task', 'unschedule', 'Deploy'])).ok).toBe(true);
    const plans = loggedAfter(m1);
    expect(plans.map((e) => e.type)).toEqual(['plan.set', 'plan.set', 'plan.cleared']);
    expect(plans[0]).toMatchObject({ start: '2026-11-09T10:00', durationMin: 45, taskText: 'Deploy' });
    expect(plans[1]).toMatchObject({ start: '2026-11-11T10:00' });
  });

  // `pomo stop` itself writes through boardIo (Electron paths, not loadable in
  // vitest); the same span-closing FSM runs when a task with a live pomo is
  // completed or deleted from the CLI.
  it('task toggle on the task the pomo is running on closes the span → span.closed', async () => {
    await run(['todo', 'add', 'Reading']);
    const b = readBoard();
    const taskId = b.nodes.find((n) => n['kind'] === 'todo.task')!['id'] as string;
    pomoNode(b)['state'] = { ...defaultPomoState(), status: 'running', startedAt: new Date(Date.now() - 30 * 60_000).toISOString(), activeTaskId: taskId, label: 'Reading' };
    writeBoard(b);
    const m1 = mark();
    expect((await run(['task', 'toggle', 'Reading'])).ok).toBe(true);
    const out = loggedAfter(m1);
    expect(out.map((e) => e.type).sort()).toEqual(['span.closed', 'task.completed']);
    expect(out.find((e) => e.type === 'span.closed')).toMatchObject({ kind: 'work', taskId, taskText: 'Reading' });
  });

  it('pomo retag → span.retagged; pomo delete-segment → span.deleted', async () => {
    reset([SEG('seg-aaaa1111'), SEG('seg-bbbb2222')]);
    // Time window, not mark(): span entries sort by the span's own time. No
    // logging command runs just before t1, so the same-millisecond slip can't happen.
    const t1 = Date.now();
    expect((await run(['pomo', 'retag', 'seg-aaaa1111', '--text', 'emails'])).ok).toBe(true);
    expect((await run(['pomo', 'delete-segment', 'seg-bbbb2222'])).ok).toBe(true);
    const out = logged(t1);
    expect(out.map((e) => e.type)).toEqual(['span.retagged', 'span.deleted']);
    expect(out[0]).toMatchObject({ spanId: 'seg-aaaa1111', taskId: null, taskText: 'emails' });
    expect(out[1]).toMatchObject({ spanId: 'seg-bbbb2222' });
  });

  it('the first logging command backfills the existing history once (F4)', async () => {
    reset([SEG('seg-old00001')]);
    await run(['todo', 'add', 'Something']);
    const all = readTimeLog(dir);
    expect(all.filter((e) => e.type === 'span.closed').map((e) => (e.type === 'span.closed' ? e.spanId : ''))).toEqual(['seg-old00001']);
    expect(existsSync(join(timeLogDir(dir), '.backfilled'))).toBe(true);
  });

  it('read-only verbs and failures log nothing', async () => {
    await run(['todo', 'list']);
    await run(['pomo', 'segments']);
    await run(['task', 'toggle', 'no-such-task']);
    expect(readTimeLog(dir)).toEqual([]);
  });
});

describe('krnl time — parse (F13)', () => {
  it('parses time log and time report', () => {
    expect(SysParser.parse(['time', 'log', '--from', '2026-11-01', '--to', '2026-11-05', '--json']))
      .toEqual({ kind: 'time', sub: 'log', from: '2026-11-01', to: '2026-11-05', json: true });
    expect(SysParser.parse(['time', 'report', '--month', '2026-11', '--by', 'tag']))
      .toEqual({ kind: 'time', sub: 'report', month: '2026-11', by: 'tag', json: false });
    expect(SysParser.parse(['time', '--month', '2026-11'])).toMatchObject({ kind: 'time', sub: 'report', month: '2026-11' });
  });
});

describe('krnl time — log and report (F13)', () => {
  beforeAll(() => {
    reset();
    // Mark backfilled so the seeded board adds nothing.
    appendTimeLog(dir, [
      { type: 'span.closed', spanId: 'a', taskId: 'api', taskText: 'API', tag: 'backend', kind: 'work', startedAt: at(2026, 11, 3, 9), endedAt: at(2026, 11, 3, 11), at: at(2026, 11, 3, 11) },
      { type: 'span.closed', spanId: 'b', taskId: 'api', taskText: 'API', tag: 'backend', kind: 'work', startedAt: at(2026, 11, 4, 9), endedAt: at(2026, 11, 4, 10), at: at(2026, 11, 4, 10) },
      { type: 'span.closed', spanId: 'c', taskId: null, taskText: 'emails', tag: 'admin', kind: 'work', startedAt: at(2026, 11, 4, 14), endedAt: at(2026, 11, 4, 14, 30), at: at(2026, 11, 4, 14, 30) },
      { type: 'plan.set', taskId: 'api', taskText: 'API', start: '2026-11-03T09:00', durationMin: 240, at: at(2026, 11, 1, 8) },
      { type: 'task.completed', taskId: 'api', taskText: 'API', tag: 'backend', plannedMin: 240, at: at(2026, 11, 5, 17) },
    ]);
    writeFileSync(join(timeLogDir(dir), '.backfilled'), 'test\n', 'utf-8');
  });

  it('time report --by task: per-task totals, plan and per-day minutes', async () => {
    const r = await run(['time', 'report', '--month', '2026-11']);
    expect(r.ok).toBe(true);
    const lines = (r.message ?? '').split('\n');
    expect(lines[0]).toBe('time report — 2026-11 · 3h30 worked (minutes per day)');
    expect(lines[1]).toMatch(/^task\s+total\s+plan\s+03\s+04$/);
    expect(lines[2]).toMatch(/^API ✓\s+3h00\s+4h00\s+120\s+60$/);
    expect(lines[3]).toMatch(/^emails\s+30m\s+·\s+·\s+30$/);
  });

  it('time report --by tag --json books tags on the days worked (F6)', async () => {
    const r = await run(['time', 'report', '--month', '2026-11', '--by', 'tag', '--json']);
    const data = JSON.parse(r.message ?? '{}') as { rows: Array<{ tag: string; totalMin: number; byDay: Record<string, number> }> };
    expect(data.rows.find((x) => x.tag === 'backend')).toEqual({ tag: 'backend', totalMin: 180, byDay: { '2026-11-03': 120, '2026-11-04': 60 } });
  });

  it('time report --by day lists each worked day', async () => {
    const r = await run(['time', 'report', '--month', '2026-11', '--by', 'day']);
    expect(r.message).toContain('2026-11-04');
    expect(r.message).toMatch(/2026-11-04\s+1h30\s+API 1h00, emails 30m/);
  });

  it('time log lists the raw entries logged on those days', async () => {
    const r = await run(['time', 'log', '--from', '2026-11-04', '--to', '2026-11-05', '--json']);
    const entries = JSON.parse(r.message ?? '[]') as TimeLogEntry[];
    expect(entries.map((e) => e.type)).toEqual(['span.closed', 'span.closed', 'task.completed']);
    const text = await run(['time', 'log', '--from', '2026-11-03', '--to', '2026-11-03']);
    expect(text.message).toContain('span.closed');
    expect(text.message).toContain('"API" [backend]');
  });

  it('rejects bad dates and --by values', async () => {
    expect((await run(['time', 'report', '--month', '2026-13'])).ok).toBe(false);
    expect((await run(['time', 'report', '--month', '2026-11', '--by', 'week'])).ok).toBe(false);
    expect((await run(['time', 'log', '--from', '2026-11-05', '--to', '2026-11-01'])).ok).toBe(false);
    expect((await run(['time', 'log', '--from', 'yesterday'])).ok).toBe(false);
  });
});
