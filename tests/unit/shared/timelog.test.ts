/**
 * Decision 35 — durable time log, pure layer (docs/06-requirements/time-log.md).
 * Fold (F6, F5), the board diff that every writer goes through (F2/F3),
 * the backfill builder (F4) and line parsing (NF2).
 */
import { describe, it, expect } from 'vitest';
import {
  backfillEntries,
  foldTimeLog,
  parseTimeLogText,
  stampEntry,
  timeLogEntriesFromBoards,
  UNTAGGED,
  type TimeLogEntry,
  type TimeLogInput,
} from '../../../src/shared/timelog';

/** Local wall-clock instant as ISO (tests run in the machine's zone). */
const at = (y: number, mo: number, d: number, h = 0, mi = 0): string => new Date(y, mo - 1, d, h, mi).toISOString();

let n = 0;
const uuid = (): string => `e-${++n}`;
/** Stamp with an explicit `at` (log order). */
const E = (input: TimeLogInput, when: string): TimeLogEntry => stampEntry({ ...input, at: when }, Date.parse(when), uuid);

const span = (id: string, start: string, end: string, extra: Partial<{ taskId: string | null; taskText: string; tag: string | null; kind: 'work' | 'break'; manual: boolean }> = {}): TimeLogEntry =>
  E({
    type: 'span.closed', spanId: id, taskId: extra.taskId ?? null, taskText: extra.taskText ?? '',
    tag: extra.tag ?? null, kind: extra.kind ?? 'work', startedAt: start, endedAt: end,
    ...(extra.manual ? { manual: true } : {}),
  }, end);

const NOV = { fromYMD: '2026-11-01', toYMD: '2026-11-30' };

describe('foldTimeLog — per task per day (F6)', () => {
  it('splits a span at local midnight and books each part on its own day', () => {
    const fold = foldTimeLog([
      span('s1', at(2026, 11, 3, 23, 30), at(2026, 11, 4, 0, 45), { taskId: 't1', taskText: 'Math', tag: 'study' }),
    ], NOV);
    const row = fold.tasks.find((t) => t.taskId === 't1')!;
    expect(row.byDay).toEqual({ '2026-11-03': 30, '2026-11-04': 45 });
    expect(row.totalMin).toBe(75);
    expect(fold.byDay).toEqual({ '2026-11-03': 30, '2026-11-04': 45 });
    expect(fold.days).toHaveLength(30);
  });

  it('clips to the range: only the in-range part of an overnight span counts', () => {
    const fold = foldTimeLog([
      span('s1', at(2026, 10, 31, 23, 0), at(2026, 11, 1, 1, 0), { taskId: 't1', taskText: 'Deploy' }),
    ], NOV);
    expect(fold.totalMin).toBe(60);
    expect(fold.tasks[0]!.byDay).toEqual({ '2026-11-01': 60 });
    expect(fold.spans).toHaveLength(1);
  });

  it('applies edits, retags and deletes by span id — last wins', () => {
    const s = at(2026, 11, 5, 14, 0);
    const fold = foldTimeLog([
      span('s1', s, at(2026, 11, 6, 9, 0), { taskId: 't1', taskText: 'Observe' }),
      E({ type: 'span.edited', spanId: 's1', startedAt: s, endedAt: at(2026, 11, 5, 18, 30) }, at(2026, 11, 6, 9, 5)),
      span('s2', at(2026, 11, 7, 9, 0), at(2026, 11, 7, 10, 0), { taskId: 't1', taskText: 'Observe' }),
      E({ type: 'span.retagged', spanId: 's2', taskId: 't2', taskText: 'Physics', tag: 'study' }, at(2026, 11, 7, 11, 0)),
      span('s3', at(2026, 11, 8, 9, 0), at(2026, 11, 8, 9, 30), { taskId: 't1', taskText: 'Observe' }),
      E({ type: 'span.deleted', spanId: 's3' }, at(2026, 11, 8, 10, 0)),
    ], NOV);
    const t1 = fold.tasks.find((t) => t.taskId === 't1')!;
    const t2 = fold.tasks.find((t) => t.taskId === 't2')!;
    expect(t1.totalMin).toBe(270); // 14:00–18:30, the forgotten night is gone (UC-L2)
    expect(t1.byDay).toEqual({ '2026-11-05': 270 });
    expect(t2).toMatchObject({ taskText: 'Physics', tag: 'study', totalMin: 60 });
    expect(fold.spans.map((x) => x.spanId)).toEqual(['s1', 's2']);
  });

  it('a close after a delete brings the span back (undo); duplicates are harmless', () => {
    const fold = foldTimeLog([
      span('s1', at(2026, 11, 5, 9), at(2026, 11, 5, 10), { taskId: 't1', taskText: 'A' }),
      span('s1', at(2026, 11, 5, 9), at(2026, 11, 5, 10), { taskId: 't1', taskText: 'A' }),
      E({ type: 'span.deleted', spanId: 's1' }, at(2026, 11, 5, 11)),
      E({ type: 'span.closed', spanId: 's1', taskId: 't1', taskText: 'A', tag: null, kind: 'work', startedAt: at(2026, 11, 5, 9), endedAt: at(2026, 11, 5, 10) }, at(2026, 11, 5, 12)),
    ], NOV);
    expect(fold.totalMin).toBe(60);
  });

  it('keeps breaks apart, gives free-text spans their own row and leaves the rest untagged', () => {
    const fold = foldTimeLog([
      span('w1', at(2026, 11, 5, 9), at(2026, 11, 5, 9, 40), { taskText: 'emails', tag: 'admin' }),
      span('w2', at(2026, 11, 5, 10), at(2026, 11, 5, 10, 20)),
      span('b1', at(2026, 11, 5, 9, 40), at(2026, 11, 5, 9, 50), { kind: 'break' }),
    ], NOV);
    expect(fold.totalMin).toBe(60);
    expect(fold.breakByDay).toEqual({ '2026-11-05': 10 });
    expect(fold.tasks.find((t) => t.key === 'label:emails')).toMatchObject({ taskId: null, taskText: 'emails', totalMin: 40 });
    expect(fold.tasks.find((t) => t.key === UNTAGGED)).toMatchObject({ totalMin: 20 });
    expect(fold.byTag).toEqual({ admin: { totalMin: 40, byDay: { '2026-11-05': 40 } }, [UNTAGGED]: { totalMin: 20, byDay: { '2026-11-05': 20 } } });
  });

  it('rows survive task deletion: the snapshot text is the latest one seen (UC-L1)', () => {
    const fold = foldTimeLog([
      E({ type: 'task.created', taskId: 't1', taskText: 'build', tag: 'code' }, at(2026, 11, 1, 8)),
      span('s1', at(2026, 11, 2, 9), at(2026, 11, 2, 11), { taskId: 't1', taskText: 'build' }),
      E({ type: 'task.renamed', taskId: 't1', taskText: 'build cluster' }, at(2026, 11, 3, 8)),
    ], NOV);
    expect(fold.tasks[0]).toMatchObject({ taskText: 'build cluster', tag: 'code', totalMin: 120 });
  });
});

describe('foldTimeLog — time per tag on the days worked (F6 scenario)', () => {
  it('books "backend" 2h on Nov 3 and 1h on Nov 4 although API is completed on Nov 5', () => {
    const fold = foldTimeLog([
      span('a', at(2026, 11, 3, 9), at(2026, 11, 3, 11), { taskId: 'api', taskText: 'API', tag: 'backend' }),
      span('b', at(2026, 11, 4, 9), at(2026, 11, 4, 10), { taskId: 'api', taskText: 'API', tag: 'backend' }),
      E({ type: 'task.completed', taskId: 'api', taskText: 'API', tag: 'backend', plannedMin: 120 }, at(2026, 11, 5, 17)),
    ], NOV);
    expect(fold.byTag['backend']).toEqual({ totalMin: 180, byDay: { '2026-11-03': 120, '2026-11-04': 60 } });
    expect(fold.completions).toHaveLength(1);
  });

  it('includes open tasks and falls back to the task tag when a span has none', () => {
    const fold = foldTimeLog([
      E({ type: 'task.created', taskId: 'x', taskText: 'Read', tag: 'reading' }, at(2026, 11, 1, 8)),
      span('s', at(2026, 11, 2, 9), at(2026, 11, 2, 9, 30), { taskId: 'x', taskText: 'Read', tag: null }),
    ], NOV);
    expect(fold.byTag['reading']?.totalMin).toBe(30);
    expect(fold.tasks[0]!.done).toBe(false);
  });
});

describe('foldTimeLog — completions and plans (F5, UC-L3)', () => {
  it('keeps every completion: completed, reopened, completed again = two entries', () => {
    const fold = foldTimeLog([
      E({ type: 'task.completed', taskId: 'd', taskText: 'Deploy', tag: null, plannedMin: 30 }, at(2026, 11, 3, 10)),
      E({ type: 'task.reopened', taskId: 'd' }, at(2026, 11, 4, 10)),
      E({ type: 'task.completed', taskId: 'd', taskText: 'Deploy', tag: null, plannedMin: 30 }, at(2026, 11, 5, 10)),
    ], NOV);
    expect(fold.completions.map((c) => c.at)).toEqual([at(2026, 11, 3, 10), at(2026, 11, 5, 10)]);
    const row = fold.tasks.find((t) => t.taskId === 'd')!;
    expect(row.completions).toHaveLength(2);
    expect(row.done).toBe(true);
    expect(row.plannedMin).toBe(30);
  });

  it('remembers a moved plan; plan vs actual uses the latest plan', () => {
    const fold = foldTimeLog([
      E({ type: 'plan.set', taskId: 'd', taskText: 'Deploy', start: '2026-11-02T10:00', durationMin: 60 }, at(2026, 11, 1, 9)),
      E({ type: 'plan.set', taskId: 'd', taskText: 'Deploy', start: '2026-11-02T10:00', durationMin: 60 }, at(2026, 11, 1, 9, 1)), // repeat
      E({ type: 'plan.set', taskId: 'd', taskText: 'Deploy', start: '2026-11-04T10:00', durationMin: 90 }, at(2026, 11, 2, 9)),
      span('s', at(2026, 11, 4, 10), at(2026, 11, 4, 11, 40), { taskId: 'd', taskText: 'Deploy' }),
    ], NOV);
    expect(fold.plans['d']!.map((p) => p.start)).toEqual(['2026-11-02T10:00', '2026-11-04T10:00']);
    const row = fold.tasks.find((t) => t.taskId === 'd')!;
    expect(row.plan).toEqual({ start: '2026-11-04T10:00', durationMin: 90 });
    expect(row).toMatchObject({ plannedMin: 90, totalMin: 100 });
  });

  it('lists a planned task with no time yet; a cleared plan is null', () => {
    const fold = foldTimeLog([
      E({ type: 'plan.set', taskId: 'p', taskText: 'Plan only', start: '2026-11-20T09:00', durationMin: 45 }, at(2026, 11, 1, 9)),
      E({ type: 'plan.set', taskId: 'q', taskText: 'Dropped', start: '2026-11-21T09:00', durationMin: 45 }, at(2026, 11, 1, 9)),
      E({ type: 'plan.cleared', taskId: 'q' }, at(2026, 11, 2, 9)),
    ], NOV);
    expect(fold.tasks.map((t) => t.taskText)).toEqual(['Plan only']);
    expect(fold.plans['q']!.at(-1)!.start).toBeNull();
  });
});

// ── the writer choke point ──────────────────────────────────────────────────

const todo = { id: 'todo-m', kind: 'todo', state: { items: [] } };
const task = (id: string, s: Record<string, unknown> = {}) => ({
  id, kind: 'todo.task',
  state: { text: 'Math', done: false, plannedMin: 30, durationMin: 30, parentTodoId: 'todo-m', todoItemId: null, tag: 'study', ...s },
});
const rec = (id: string, s: Record<string, unknown> = {}) => ({
  id, startedAt: at(2026, 11, 5, 9), endedAt: at(2026, 11, 5, 9, 25), durationMin: 25, label: 'Math', completed: true, taskId: 't1', kind: 'work', ...s,
});
const pomo = (history: unknown[]) => ({ id: 'mother-pomo', kind: 'pomo', state: { history } });
const board = (...nodes: Array<{ id: string; kind: string; state?: unknown }>) => ({ nodes: [todo, ...nodes] });

describe('timeLogEntriesFromBoards — one diff for every writer (F2/F3)', () => {
  it('span.closed for a new history record, with task text and tag snapshot', () => {
    const out = timeLogEntriesFromBoards(board(task('t1'), pomo([])), board(task('t1'), pomo([rec('r1')])));
    expect(out).toEqual([{ type: 'span.closed', spanId: 'r1', taskId: 't1', taskText: 'Math', tag: 'study', kind: 'work', startedAt: rec('r1').startedAt, endedAt: rec('r1').endedAt }]);
  });

  it('span.closed keeps manual and the observe tag of a free-text span', () => {
    const out = timeLogEntriesFromBoards(board(pomo([])), board(pomo([rec('r1', { taskId: null, label: 'emails', tag: 'admin', manual: true })])));
    expect(out[0]).toMatchObject({ type: 'span.closed', taskId: null, taskText: 'emails', tag: 'admin', manual: true });
  });

  it('span.edited / span.retagged / span.deleted', () => {
    const prev = board(task('t1'), task('t2', { text: 'Physics', tag: 'science' }), pomo([rec('r1'), rec('r2'), rec('r3')]));
    const next = board(task('t1'), task('t2', { text: 'Physics', tag: 'science' }), pomo([
      rec('r1', { endedAt: at(2026, 11, 5, 9, 10) }),
      rec('r2', { taskId: 't2', label: 'Physics' }),
    ]));
    const out = timeLogEntriesFromBoards(prev, next);
    expect(out).toEqual([
      { type: 'span.edited', spanId: 'r1', startedAt: rec('r1').startedAt, endedAt: at(2026, 11, 5, 9, 10) },
      { type: 'span.retagged', spanId: 'r2', taskId: 't2', taskText: 'Physics', tag: 'science' },
      { type: 'span.deleted', spanId: 'r3' },
    ]);
  });

  it('task.created (+ plan.set when created scheduled), task.renamed', () => {
    expect(timeLogEntriesFromBoards(board(), board(task('t1', { scheduledFor: '2026-11-05T09:00', scheduledDurationMin: 45 })))).toEqual([
      { type: 'task.created', taskId: 't1', taskText: 'Math', tag: 'study' },
      { type: 'plan.set', taskId: 't1', taskText: 'Math', start: '2026-11-05T09:00', durationMin: 45 },
    ]);
    expect(timeLogEntriesFromBoards(board(task('t1')), board(task('t1', { text: 'Maths' })))).toEqual([
      { type: 'task.renamed', taskId: 't1', taskText: 'Maths' },
    ]);
  });

  it('task.completed / task.reopened, and a re-completion is a new task.completed (F5)', () => {
    const done = task('t1', { done: true, completedAt: at(2026, 11, 3, 10) });
    expect(timeLogEntriesFromBoards(board(task('t1')), board(done))).toEqual([
      { type: 'task.completed', taskId: 't1', taskText: 'Math', tag: 'study', plannedMin: 30 },
    ]);
    expect(timeLogEntriesFromBoards(board(done), board(task('t1')))).toEqual([{ type: 'task.reopened', taskId: 't1' }]);
    const again = task('t1', { done: true, completedAt: at(2026, 11, 5, 10) });
    expect(timeLogEntriesFromBoards(board(done), board(again)).map((e) => e.type)).toEqual(['task.completed']);
  });

  it('plan.set on schedule / move / new length, plan.cleared on unschedule', () => {
    const a = task('t1', { scheduledFor: '2026-11-02T10:00' });
    const b = task('t1', { scheduledFor: '2026-11-04T10:00' });
    expect(timeLogEntriesFromBoards(board(task('t1')), board(a))).toEqual([{ type: 'plan.set', taskId: 't1', taskText: 'Math', start: '2026-11-02T10:00', durationMin: 30 }]);
    expect(timeLogEntriesFromBoards(board(a), board(b))[0]).toMatchObject({ type: 'plan.set', start: '2026-11-04T10:00' });
    expect(timeLogEntriesFromBoards(board(b), board(task('t1', { scheduledFor: '2026-11-04T10:00', scheduledDurationMin: 90 })))[0]).toMatchObject({ durationMin: 90 });
    expect(timeLogEntriesFromBoards(board(b), board(task('t1')))).toEqual([{ type: 'plan.cleared', taskId: 't1' }]);
  });

  it('logs nothing for a deleted task, an unrelated change or a missing board', () => {
    expect(timeLogEntriesFromBoards(board(task('t1', { scheduledFor: '2026-11-02T10:00' })), board())).toEqual([]);
    const same = board(task('t1'), pomo([rec('r1')]));
    expect(timeLogEntriesFromBoards(same, { nodes: [...same.nodes] })).toEqual([]);
    expect(timeLogEntriesFromBoards(null, same)).toEqual([]);
  });
});

describe('backfillEntries (F4)', () => {
  const b = {
    nodes: [
      todo,
      task('t1', { scheduledFor: '2026-11-09T09:00' }),
      pomo([rec('r1'), rec('r2', { startedAt: at(2026, 10, 30, 9), endedAt: at(2026, 10, 30, 10) })]),
    ],
    completions: [{ taskId: 't0', text: 'Old', plannedMin: 20, completedAt: at(2026, 10, 2, 12), tag: 'admin' }],
  };

  it('writes spans at their end time, current plans now and ledger completions at their date', () => {
    const now = Date.parse(at(2026, 11, 5, 12));
    const out = backfillEntries(b, [], now, uuid);
    expect(out.map((e) => e.type).sort()).toEqual(['plan.set', 'span.closed', 'span.closed', 'task.completed']);
    expect(out.find((e) => e.type === 'span.closed' && e.spanId === 'r2')!.at).toBe(at(2026, 10, 30, 10));
    expect(out.find((e) => e.type === 'task.completed')).toMatchObject({ at: at(2026, 10, 2, 12), taskText: 'Old', tag: 'admin', plannedMin: 20 });
    expect(out.find((e) => e.type === 'plan.set')!.at).toBe(new Date(now).toISOString());
  });

  it('is idempotent against what the log already holds', () => {
    const first = backfillEntries(b, [], Date.now(), uuid);
    expect(backfillEntries(b, first, Date.now(), uuid)).toEqual([]);
  });
});

describe('parseTimeLogText (NF2)', () => {
  it('skips blank, torn and invalid lines', () => {
    const good = JSON.stringify(stampEntry({ type: 'span.deleted', spanId: 's1' }));
    const text = [good, '', '{"v":1,"id":"x","at":"2026-11-0', '{"v":1,"id":"y","at":"2026-11-05T10:00:00.000Z","type":"nope"}', good].join('\n');
    expect(parseTimeLogText(text)).toHaveLength(2);
  });

  it('stampEntry rejects a bad payload', () => {
    expect(() => stampEntry({ type: 'span.edited', spanId: 's', startedAt: 'not a date', endedAt: at(2026, 11, 5) })).toThrow();
  });
});
