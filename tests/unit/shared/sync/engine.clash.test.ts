// Sync clashes between two devices that were apart (Decision 53, server-sync.md
// F21, F22): the later edit wins in server time, whichever device comes back
// first; a wrong clock is corrected; an edit beats a delete; stale or missing
// times keep the server's version. The fake world has one clock that the tests
// move by hand; each device sees it through its own (possibly wrong) clock.
import { afterEach, describe, expect, it } from 'vitest';
import { FakeServer, MemoryStore, makeDevice, settle, synced, type Device } from './fakes';
import { SyncEngine } from '../../../../src/shared/sync/engine';
import { STAMPS_KEY, fingerprint } from '../../../../src/shared/sync/stamps';
import type { Json } from '../../../../src/shared/sync/types';

const H = 3_600_000;
const DOC = 'board:main';
const task = (id: string, title: string) => ({ id, kind: 'task', state: { title, done: false } });
const board = (...nodes: unknown[]) => ({ schemaVersion: 2, nodes, edges: [] });
type Board = { nodes: Array<{ id: string; state: { title: string; done: boolean; note?: string } }> };
const nodesOf = (d: Device) => (synced(d, DOC) as Board).nodes;
const titleOf = (d: Device, id = 't1') => nodesOf(d).find((n) => n.id === id)?.state.title;
const setTitle = (d: Device, title: string, id = 't1') => d.edit(DOC, (b) => { (b as unknown as Board).nodes.find((n) => n.id === id)!.state.title = title; });

let devices: Device[] = [];
afterEach(() => { for (const d of devices) d.engine.stop(); devices = []; });

/** A server and two devices, synced on one board; the world's time is 9:00 (any day). */
async function world(skewB = 0) {
  const server = new FakeServer();
  const clock = { t: 1_800_000_000_000 - (1_800_000_000_000 % (24 * H)) + 9 * H };
  server.clock = () => clock.t;
  const a = makeDevice(server, { [DOC]: board(task('t1', 'Call mom'), task('t2', 'Gym')) }, { now: () => clock.t });
  const b = makeDevice(server, {}, { now: () => clock.t + skewB });
  devices.push(a, b);
  a.engine.start();
  await settle([a]);
  b.engine.start();
  await settle([a, b]);
  expect(titleOf(b)).toBe('Call mom');
  return { server, clock, a, b };
}

/** Both go offline, `first` comes back, then `second`. */
async function backInOrder(first: Device, second: Device) {
  first.transport.setOnline(true);
  await settle([first, second]);
  second.transport.setOnline(true);
  await settle([first, second], 10);
}

describe('the latest edit wins (F21)', () => {
  it('the later edit reaches the server second, and still wins (the old rule kept the first)', async () => {
    const { clock, a, b } = await world();
    a.transport.setOnline(false);
    b.transport.setOnline(false);
    setTitle(a, 'Call mom 19:00');
    await settle([a, b]);
    clock.t += H;
    setTitle(b, 'Call mom 20:00');
    await settle([a, b]);
    await backInOrder(a, b);
    expect(titleOf(a)).toBe('Call mom 20:00');
    expect(titleOf(b)).toBe('Call mom 20:00');
  });

  it('the later edit reaches the server first, and stays', async () => {
    const { clock, a, b } = await world();
    a.transport.setOnline(false);
    b.transport.setOnline(false);
    setTitle(a, 'Call mom 19:00');
    await settle([a, b]);
    clock.t += H;
    setTitle(b, 'Call mom 20:00');
    await settle([a, b]);
    await backInOrder(b, a);
    expect(titleOf(a)).toBe('Call mom 20:00');
    expect(titleOf(b)).toBe('Call mom 20:00');
  });

  it('a clock an hour fast does not win: B edits first in real time, its own clock says later', async () => {
    const { clock, a, b } = await world(H);
    expect(b.engine.getStatus().clockOffsetMs).toBeCloseTo(-H, -3);
    a.transport.setOnline(false);
    b.transport.setOnline(false);
    setTitle(b, 'Call mom 19:00'); // 9:00 real, 10:00 on B's clock
    await settle([a, b]);
    clock.t += H / 2;
    setTitle(a, 'Call mom 20:00'); // 9:30 real
    await settle([a, b]);
    await backInOrder(a, b);
    expect(titleOf(a)).toBe('Call mom 20:00');
    expect(titleOf(b)).toBe('Call mom 20:00');
  });

  it('a device that restarts offline uses its last measured offset', async () => {
    const { clock, a, b } = await world(H);
    a.transport.setOnline(false);
    b.transport.setOnline(false);
    // B restarts without the server: a new engine on the same storage, the same wrong clock.
    b.engine.stop();
    const engine = new SyncEngine({ transport: b.transport, host: b.host, store: b.store, debounceMs: 5, now: () => clock.t + H });
    const b2: Device = { ...b, engine, edit: (name, fn) => { const x = b.host.read(name) as Record<string, Json>; fn(x); b.host.docs.set(name, x); engine.changed(name); } };
    devices.push(b2);
    engine.start();
    setTitle(b2, 'Call mom 19:00'); // 9:00 real
    await settle([a, b2]);
    clock.t += H / 2;
    setTitle(a, 'Call mom 20:00'); // 9:30 real
    await settle([a, b2]);
    await backInOrder(a, b2);
    expect(titleOf(b2)).toBe('Call mom 20:00');
    const stamp = b.store.getStamps(DOC);
    expect(stamp).not.toBeNull();
  });

  it('a device that never measured its clock: its stamp is not trusted, the server keeps its version', async () => {
    const { clock, a, b } = await world();
    a.transport.setOnline(false);
    b.transport.setOnline(false);
    setTitle(a, 'Call mom 19:00'); // 9:00
    await settle([a, b]);
    // B comes back as if it had never been connected with this version: no offset anywhere.
    b.engine.stop();
    const store = b.store as MemoryStore;
    store.offset = null;
    const engine = new SyncEngine({ transport: b.transport, host: b.host, store, debounceMs: 5, now: () => clock.t });
    const b2: Device = { ...b, engine, edit: (name, fn) => { const x = b.host.read(name) as Record<string, Json>; fn(x); b.host.docs.set(name, x); engine.changed(name); } };
    devices.push(b2);
    engine.start();
    clock.t += H;
    setTitle(b2, 'Call mom 20:00'); // 10:00, but untrusted
    await settle([a, b2]);
    expect(store.getStamps(DOC)?.['/nodes/#t1/state/title']?.[2]).toBe(1);
    await backInOrder(a, b2);
    expect(titleOf(a)).toBe('Call mom 19:00');
    expect(titleOf(b2)).toBe('Call mom 19:00');
  });

  it('a time an older KRNL0 left behind (its value changed since) does not count', async () => {
    const { server, clock, a, b } = await world();
    // A changes the title at 9:00 and syncs: the server's table has A's stamp.
    setTitle(a, 'Call mom 19:00');
    await settle([a, b]);
    a.transport.setOnline(false);
    clock.t += H;
    setTitle(a, 'Call mom 21:00'); // 10:00, offline
    await settle([a, b]);
    // At 11:00 an older KRNL0 changes the title and uploads the table it received, unchanged.
    clock.t += H;
    const cur = server.docs.get(DOC)!;
    const body = JSON.parse(JSON.stringify(cur.body)) as Board & Record<string, unknown>;
    body.nodes.find((n) => n.id === 't1')!.state.title = 'Call mom later';
    expect(body[STAMPS_KEY]).toBeDefined();
    server.put(DOC, cur.rev, body, null);
    // A's 10:00 stamp is valid, the server's is A's old 9:00 one for another value: unknown, so the server keeps its version.
    a.transport.setOnline(true);
    await settle([a, b], 10);
    expect(titleOf(a)).toBe('Call mom later');
    expect(titleOf(b)).toBe('Call mom later');
  });

  it('nothing re-uploads once both agree (no loop, NF4)', async () => {
    const { server, clock, a, b } = await world();
    a.transport.setOnline(false);
    b.transport.setOnline(false);
    setTitle(a, 'X');
    await settle([a, b]); // the stamp is taken when the engine notices the change
    clock.t += H;
    setTitle(b, 'Y');
    await settle([a, b]);
    await backInOrder(a, b);
    const puts = server.puts;
    await a.engine.syncNow();
    await b.engine.syncNow();
    await settle([a, b]);
    expect(server.puts).toBe(puts);
    expect(a.engine.getStatus().state).toBe('synced');
    // The stamps on the server describe the title everyone has.
    const table = (server.docs.get(DOC)!.body as Record<string, unknown>)[STAMPS_KEY] as Record<string, [number, string]>;
    expect(table['/nodes/#t1/state/title']![1]).toBe(fingerprint('Y'));
  });

  it('the stamp table never reaches the device\'s own board', async () => {
    const { clock, a, b } = await world();
    setTitle(a, 'X');
    clock.t += H;
    await settle([a, b]);
    for (const d of [a, b]) expect((d.host.read(DOC) as Record<string, unknown>)[STAMPS_KEY]).toBeUndefined();
  });
});

describe('an edit beats a delete (F22)', () => {
  for (const first of ['deleting', 'editing'] as const) {
    it(`whichever device comes back first (${first})`, async () => {
      const { clock, a, b } = await world();
      a.transport.setOnline(false);
      b.transport.setOnline(false);
      a.edit(DOC, (x) => { (x as unknown as Board).nodes = (x as unknown as Board).nodes.filter((n) => n.id !== 't2'); });
      await settle([a, b]);
      clock.t += H;
      b.edit(DOC, (x) => { (x as unknown as Board).nodes.find((n) => n.id === 't2')!.state.note = 'bring shoes'; });
      await settle([a, b]);
      if (first === 'deleting') await backInOrder(a, b); else await backInOrder(b, a);
      for (const d of [a, b]) expect(nodesOf(d).find((n) => n.id === 't2')?.state.note).toBe('bring shoes');
    });
  }

  it('a delete of an item nobody changed still goes everywhere', async () => {
    const { a, b } = await world();
    a.transport.setOnline(false);
    a.edit(DOC, (x) => { (x as unknown as Board).nodes = (x as unknown as Board).nodes.filter((n) => n.id !== 't2'); });
    await settle([a, b]);
    a.transport.setOnline(true);
    await settle([a, b], 10);
    for (const d of [a, b]) expect(nodesOf(d).map((n) => n.id)).toEqual(['t1']);
  });
});
