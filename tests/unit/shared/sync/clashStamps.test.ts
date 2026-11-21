// Edit stamps and the sync merge rules (Decision 53, server-sync.md F21, F22).
import { describe, expect, it } from 'vitest';
import { mergeBoards, pathId, pathKey } from '../../../../src/shared/boardMerge';
import {
  CLASH_MIN_GAP_MS,
  STAMP_MAX_AGE_MS,
  STAMPS_KEY,
  changedAt,
  fingerprint,
  latestWins,
  noteEdits,
  splitStamps,
  stampsFor,
  valueAt,
  withStamps,
  type Stamps,
} from '../../../../src/shared/sync/stamps';
import { WebTransport } from '../../../../src/web/sync/transport';

type B = Record<string, unknown>;
const task = (id: string, title: string, extra: B = {}) => ({ id, kind: 'task', state: { title, done: false, ...extra } });
const board = (...nodes: unknown[]): B => ({ schemaVersion: 2, nodes, edges: [] });
const titlePath = (id: string) => pathKey(pathKey(pathId(pathKey('', 'nodes'), id), 'state'), 'title');
const H = 3_600_000;

describe('paths and values', () => {
  it('a path names a value the way the merge walks to it', () => {
    const b = board(task('t1', 'Gym'));
    expect(titlePath('t1')).toBe('/nodes/#t1/state/title');
    expect(valueAt(b, titlePath('t1'))).toBe('Gym');
    expect(valueAt(b, titlePath('nope'))).toBeUndefined();
    expect(valueAt(b, '')).toBe(b);
    // Odd keys and ids cannot break a path.
    const odd = { 'a/b': { '#x': 1 }, list: [{ id: 'x/y#z', v: 2 }] };
    expect(valueAt(odd, pathKey(pathKey('', 'a/b'), '#x'))).toBe(1);
    expect(valueAt(odd, pathKey(pathId(pathKey('', 'list'), 'x/y#z'), 'v'))).toBe(2);
  });
});

describe('noteEdits: what this device changed, and when', () => {
  const base = board(task('t1', 'Gym'), task('t2', 'Read'));

  it('stamps a changed value, an added item as a whole, and a deleted item', () => {
    const local = board(task('t1', 'Gym 18:00'), task('t3', 'New'));
    const s = noteEdits({}, base, local, 1000, true);
    expect(s[titlePath('t1')]).toEqual([1000, fingerprint('Gym 18:00')]);
    expect(s['/nodes/#t3']).toEqual([1000, fingerprint(task('t3', 'New'))]);
    expect(s['/nodes/#t2']).toEqual([1000, '-']);
    expect(Object.keys(s)).toHaveLength(3);
  });

  it('keeps the time of an earlier change when something else changes later (9:00 X, 11:00 Y)', () => {
    const at9 = noteEdits({}, base, board(task('t1', 'X'), task('t2', 'Read')), 9 * H, true);
    const at11 = noteEdits(at9, base, board(task('t1', 'X'), task('t2', 'Y')), 11 * H, true);
    expect(at11[titlePath('t1')]![0]).toBe(9 * H);
    expect(at11[titlePath('t2')]![0]).toBe(11 * H);
  });

  it('changing a value back to what the server has is a change too', () => {
    const s1 = noteEdits({}, base, board(task('t1', 'X'), task('t2', 'Read')), 1, true);
    const s2 = noteEdits(s1, base, base, 2, true);
    expect(s2[titlePath('t1')]).toEqual([2, fingerprint('Gym')]);
  });

  it('nothing changed: the very same table comes back', () => {
    const s = { [titlePath('t1')]: [5, fingerprint('Gym')] } as Stamps;
    expect(noteEdits(s, base, base, 9, true)).toBe(s);
  });

  it('before any clock measurement the stamp is marked untrusted', () => {
    const s = noteEdits({}, base, board(task('t1', 'X'), task('t2', 'Read')), 7, false);
    expect(s[titlePath('t1')]).toEqual([7, fingerprint('X'), 1]);
    expect(changedAt(s, board(task('t1', 'X')), titlePath('t1'))).toBeNull();
  });

  it('lists of plain values are one value; lists of items are walked by id', () => {
    const b = { tags: ['a', 'b'], points: [1, 2, 1], nodes: [task('t1', 'Gym')] };
    const l = { tags: ['a', 'c'], points: [1, 2, 3], nodes: [task('t1', 'Gym', { done: true })] };
    const s = noteEdits({}, b, l, 1, true);
    expect(Object.keys(s).sort()).toEqual(['/nodes/#t1/state/done', '/points', '/tags']);
  });
});

describe('changedAt: only a stamp that still matches its value counts', () => {
  const b = board(task('t1', 'Gym'));

  it('a matching stamp gives its time', () => {
    expect(changedAt({ [titlePath('t1')]: [42, fingerprint('Gym')] }, b, titlePath('t1'))).toBe(42);
  });

  it('a stamp an older KRNL0 left behind (the value changed since) means nothing', () => {
    expect(changedAt({ [titlePath('t1')]: [42, fingerprint('Old title')] }, b, titlePath('t1'))).toBeNull();
  });

  it('an item added as a whole gives the time to the values inside it, until one of them changes', () => {
    const s: Stamps = { '/nodes/#t1': [42, fingerprint(task('t1', 'Gym'))] };
    expect(changedAt(s, b, titlePath('t1'))).toBe(42);
    expect(changedAt(s, board(task('t1', 'Gym 2')), titlePath('t1'))).toBeNull();
  });

  it('no stamp at all: unknown', () => {
    expect(changedAt({}, b, titlePath('t1'))).toBeNull();
  });
});

describe('latestWins: the merge resolver', () => {
  const mine = { body: board(task('t1', 'X')), stamps: { [titlePath('t1')]: [10 * H, fingerprint('X')] } as Stamps };
  const theirs = (t: number, title = 'Y') => ({ body: board(task('t1', title)), stamps: { [titlePath('t1')]: [t, fingerprint(title)] } as Stamps });

  it('the later edit wins, on either side', () => {
    expect(latestWins(mine, theirs(9 * H))(titlePath('t1'))).toBe('mine');
    expect(latestWins(mine, theirs(11 * H))(titlePath('t1'))).toBe('theirs');
  });

  it('closer than the gap, or a missing time on either side: the server keeps its version', () => {
    expect(latestWins(mine, theirs(10 * H - CLASH_MIN_GAP_MS + 1))(titlePath('t1'))).toBe('theirs');
    expect(latestWins(mine, { body: board(task('t1', 'Y')), stamps: {} })(titlePath('t1'))).toBe('theirs');
    expect(latestWins({ body: mine.body, stamps: {} }, theirs(1))(titlePath('t1'))).toBe('theirs');
  });

  it('through mergeBoards: the later title wins', () => {
    const base = board(task('t1', 'Gym'));
    const out = mergeBoards(base, mine.body, theirs(9 * H).body, { resolve: latestWins(mine, theirs(9 * H)) }) as { nodes: Array<{ state: { title: string } }> };
    expect(out.nodes[0]!.state.title).toBe('X');
  });
});

describe('mergeBoards options', () => {
  const base = board(task('t1', 'Gym'), task('t2', 'Read'));

  it('the CLI rule stays the default: an item the file deleted stays deleted', () => {
    const mine = board(task('t1', 'Gym 18:00'), task('t2', 'Read'));
    const theirs = board(task('t2', 'Read'));
    const out = mergeBoards(base, mine, theirs) as { nodes: Array<{ id: string }> };
    expect(out.nodes.map((n) => n.id)).toEqual(['t2']);
  });

  it('keepEdited: an edit beats a delete, whichever side deleted', () => {
    const edited = board(task('t1', 'Gym 18:00'), task('t2', 'Read'));
    const deleted = board(task('t2', 'Read'));
    const a = mergeBoards(base, edited, deleted, { keepEdited: true }) as { nodes: Array<{ id: string; state: { title: string } }> };
    const b = mergeBoards(base, deleted, edited, { keepEdited: true }) as { nodes: Array<{ id: string; state: { title: string } }> };
    for (const out of [a, b]) expect(out.nodes.find((n) => n.id === 't1')?.state.title).toBe('Gym 18:00');
  });

  it('keepEdited: an item nobody changed still goes', () => {
    const out = mergeBoards(base, base, board(task('t2', 'Read')), { keepEdited: true }) as { nodes: Array<{ id: string }> };
    expect(out.nodes.map((n) => n.id)).toEqual(['t2']);
  });

  it('resolve is asked with the value path, and only for a real clash', () => {
    const asked: string[] = [];
    const mine = board(task('t1', 'X'), task('t2', 'Read 2'));
    const theirs = board(task('t1', 'Y', { done: true }), task('t2', 'Read'));
    const out = mergeBoards(base, mine, theirs, { resolve: (p) => { asked.push(p); return 'mine'; } }) as { nodes: Array<{ state: { title: string; done: boolean } }> };
    expect(asked).toEqual([titlePath('t1')]);
    expect(out.nodes[0]!.state).toEqual({ title: 'X', done: true });
    expect(out.nodes[1]!.state.title).toBe('Read 2');
  });
});

describe('stampsFor: what goes up with a board', () => {
  it('keeps matching stamps (the later of two), drops stale and old ones', () => {
    const b = board(task('t1', 'Gym'), task('t2', 'Read'));
    const now = 100 * 24 * H;
    const one: Stamps = { [titlePath('t1')]: [now - H, fingerprint('Gym')], [titlePath('t2')]: [now - 2 * H, fingerprint('Old')] };
    const two: Stamps = { [titlePath('t1')]: [now - 3 * H, fingerprint('Gym')], '/nodes/#gone': [now - STAMP_MAX_AGE_MS - 1, '-'] };
    expect(stampsFor(b, now, one, two)).toEqual({ [titlePath('t1')]: [now - H, fingerprint('Gym')] });
  });

  it('keeps a delete stamp while the value stays gone', () => {
    const b = board(task('t1', 'Gym'));
    expect(stampsFor(b, 10, { '/nodes/#t2': [5, '-'] })).toEqual({ '/nodes/#t2': [5, '-'] });
  });
});

describe('the table on the wire', () => {
  it('splits off and puts back; a malformed table is ignored', () => {
    const b = board(task('t1', 'Gym'));
    const s: Stamps = { [titlePath('t1')]: [1, fingerprint('Gym')] };
    const up = withStamps(b, s) as B;
    expect(up[STAMPS_KEY]).toEqual(s);
    expect(splitStamps(up)).toEqual({ body: b, stamps: s });
    expect(withStamps(b, {})).toBe(b);
    const bad = { ...b, [STAMPS_KEY]: { a: [1], b: 'x', c: [Number.NaN, 'h'], d: [2, 'h', 1] } };
    expect(splitStamps(bad).stamps).toEqual({ d: [2, 'h', 1] });
  });

  it('a large board stays affordable: 1000 plans, every title changed', () => {
    const base = board(...Array.from({ length: 1000 }, (_, i) => task(`01HXTASK${String(i).padStart(6, '0')}`, `Plan ${i}`)));
    const local = board(...Array.from({ length: 1000 }, (_, i) => task(`01HXTASK${String(i).padStart(6, '0')}`, `Plan ${i} (edited)`)));
    const s = noteEdits({}, base, local, 1_800_000_000_000, true);
    const boardBytes = JSON.stringify(local).length;
    const stampBytes = JSON.stringify(s).length;
    expect(Object.keys(s)).toHaveLength(1000);
    expect(stampBytes).toBeLessThan(boardBytes * 1.2);
    expect(stampBytes).toBeLessThan(80_000);
  });
});

describe('a phone that polls measures its clock from the server (F10)', () => {
  it('onOpen carries the Date header, not the phone\'s own clock', async () => {
    const serverNow = Date.now() - 2 * H; // the phone is two hours fast
    const fetchFn = (async () => new Response(JSON.stringify({ docs: [] }), { status: 200, headers: { 'content-type': 'application/json', date: new Date(serverNow).toUTCString() } })) as unknown as typeof fetch;
    class NoSocket { constructor() { throw new Error('blocked'); } }
    const t = new WebTransport({ origin: 'https://home.test', csrf: 'x', appVersion: '0.0.0', fetch: fetchFn, WebSocket: NoSocket as unknown as typeof WebSocket });
    const seen = await new Promise<number>((resolve) => {
      const close = t.connect({ onOpen: ({ serverTime }) => { close(); resolve(serverTime); }, onNotice: () => {}, onClose: () => {} });
    });
    expect(Math.abs(seen - serverNow)).toBeLessThan(2000);
  });
});
