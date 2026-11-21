import { afterEach, describe, expect, it } from 'vitest';
import { FakeServer, makeDevice, settle, synced, type Device } from './fakes';
import type { Json } from '../../../../src/shared/sync/types';
import { sameContent } from '../../../../src/shared/sync/shape';
import { splitStamps, stampsFor } from '../../../../src/shared/sync/stamps';

type Node = { id: string; title?: string; done?: boolean; x?: number };
const board = (nodes: Node[], extra: Record<string, Json> = {}) => ({ schemaVersion: 2, nodes, edges: [], ...extra });
const nodes = (d: Device, name = 'board:b1') => ((d.host.read(name) as { nodes: Node[] } | null)?.nodes ?? []);
const titleOf = (d: Device, id: string) => nodes(d).find((n) => n.id === id)?.title;

let devices: Device[] = [];
afterEach(() => { for (const d of devices) d.engine.stop(); devices = []; });
const start = (...ds: Device[]) => { devices.push(...ds); for (const d of ds) d.engine.start(); };

describe('sync engine — two devices (server-sync.md F3, F4)', () => {
  it('a new board on A reaches B', async () => {
    const server = new FakeServer();
    const a = makeDevice(server, { 'board:b1': board([{ id: 'n1', title: 'Gym' }]) });
    const b = makeDevice(server);
    start(a, b);
    await settle([a, b]);
    expect(titleOf(b, 'n1')).toBe('Gym');
  });

  it('different edits at the same time both survive', async () => {
    const server = new FakeServer();
    const a = makeDevice(server, { 'board:b1': board([{ id: 'n1', title: 'Gym' }, { id: 'n2', title: 'Read chapter 4' }]) });
    const b = makeDevice(server);
    start(a, b);
    await settle([a, b]);
    a.edit('board:b1', (x) => { (x.nodes as Node[])[0]!.done = true; });
    b.edit('board:b1', (x) => { (x.nodes as Node[])[1]!.title = 'Read chapter 5'; });
    await settle([a, b]);
    for (const d of [a, b]) {
      expect(nodes(d).find((n) => n.id === 'n1')?.done).toBe(true);
      expect(titleOf(d, 'n2')).toBe('Read chapter 5');
    }
    expect(sameContent(synced(a, 'board:b1'), synced(b, 'board:b1'))).toBe(true);
  });

  it('the same field: the first to reach the server wins, everywhere', async () => {
    const server = new FakeServer();
    server.delay = [0, 0];
    const a = makeDevice(server, { 'board:b1': board([{ id: 'n1', title: 'Gym' }]) });
    const b = makeDevice(server);
    start(a, b);
    await settle([a, b]);
    b.transport.setOnline(false);
    a.edit('board:b1', (x) => { (x.nodes as Node[])[0]!.title = 'X'; });
    await settle([a]);
    b.edit('board:b1', (x) => { (x.nodes as Node[])[0]!.title = 'Y'; });
    b.transport.setOnline(true);
    await settle([a, b]);
    expect(titleOf(a, 'n1')).toBe('X');
    expect(titleOf(b, 'n1')).toBe('X');
  });

  it('per-device keys are never uploaded and never overwritten', async () => {
    const server = new FakeServer();
    const a = makeDevice(server, { 'board:b1': board([{ id: 'n1' }], { viewport: { x: 1, y: 2, zoom: 1 } }) });
    const b = makeDevice(server);
    start(a, b);
    await settle([a, b]);
    b.edit('board:b1', (x) => { x.viewport = { x: 500, y: 500, zoom: 2 }; });
    await settle([a, b]);
    expect((server.docs.get('board:b1')?.body as Record<string, Json>).viewport).toBeUndefined();
    expect((a.host.read('board:b1') as Record<string, Json>).viewport).toEqual({ x: 1, y: 2, zoom: 1 });
  });

  it('does not upload a remote change back (no loops)', async () => {
    const server = new FakeServer();
    const a = makeDevice(server, { 'board:b1': board([{ id: 'n1', title: 'Gym' }]) });
    const b = makeDevice(server);
    start(a, b);
    await settle([a, b]);
    const before = server.puts;
    a.edit('board:b1', (x) => { (x.nodes as Node[])[0]!.title = 'Run'; });
    await settle([a, b], 10);
    expect(server.puts - before).toBe(1);
  });
});

describe('offline (F5)', () => {
  it('edits made offline are sent on reconnect and merged', async () => {
    const server = new FakeServer();
    const a = makeDevice(server, { 'board:b1': board([{ id: 'n1', title: 'Gym' }]) });
    const b = makeDevice(server);
    start(a, b);
    await settle([a, b]);
    a.transport.setOnline(false);
    a.edit('board:b1', (x) => { (x.nodes as Node[]).push({ id: 'n2', title: 'Train ride plan' }); });
    a.edit('board:b1', (x) => { (x.nodes as Node[])[0]!.done = true; });
    b.edit('board:b1', (x) => { (x.nodes as Node[]).push({ id: 'n3', title: 'From the phone' }); });
    await settle([a, b]);
    a.transport.setOnline(true);
    await settle([a, b]);
    for (const d of [a, b]) expect(nodes(d).map((n) => n.id).sort()).toEqual(['n1', 'n2', 'n3']);
    expect(sameContent(synced(a, 'board:b1'), synced(b, 'board:b1'))).toBe(true);
  });
});

describe('schema and deletes (F7, F11)', () => {
  it('an app older than the board stops uploading it', async () => {
    const server = new FakeServer();
    server.docs.set('board:b1', { rev: 4, body: board([{ id: 'n1' }], { schemaVersion: 3 }), deleted: false });
    const a = makeDevice(server);
    start(a);
    await settle([a]);
    expect(a.host.read('board:b1')).toBeNull();
    expect(a.engine.getStatus().state).toBe('update');
  });

  it('a board deleted on A is removed (kept aside) on B', async () => {
    const server = new FakeServer();
    const a = makeDevice(server, { 'board:b1': board([{ id: 'n1' }]), 'board:b2': board([{ id: 'n9' }]) });
    const b = makeDevice(server);
    start(a, b);
    await settle([a, b]);
    a.host.docs.delete('board:b2');
    a.engine.changed('board:b2');
    await settle([a, b]);
    expect(b.host.read('board:b2')).toBeNull();
    expect(b.host.removed).toContain('board:b2');
    expect(server.docs.get('board:b2')?.deleted).toBe(true);
  });

  it('a fresh device takes the server board instead of adding a duplicate', async () => {
    const server = new FakeServer();
    const a = makeDevice(server, { boards: { boards: [{ id: 'b1', name: 'Main' }] } });
    start(a);
    await settle([a]);
    const b = makeDevice(server, { boards: { boards: [{ id: 'bX', name: 'Main' }], activeId: 'bX' } });
    b.host.pristine.add('boards');
    start(b);
    await settle([a, b]);
    expect((b.host.read('boards') as { boards: Array<{ id: string }> }).boards.map((x) => x.id)).toEqual(['b1']);
    expect((b.host.read('boards') as { activeId: string }).activeId).toBe('bX');
  });
});

describe('time log and assets (F8, F9)', () => {
  it('entries reach every device exactly once', async () => {
    const server = new FakeServer();
    const a = makeDevice(server);
    const b = makeDevice(server);
    a.host.timelog.set('b1', [{ id: 'e1', at: '2026-11-20T10:00:00Z' }]);
    start(a, b);
    await settle([a, b]);
    const e2 = { id: 'e2', at: '2026-11-20T11:00:00Z' };
    a.host.timelog.get('b1')!.push(e2);
    a.engine.timelogAppended('b1', [e2]);
    a.engine.timelogAppended('b1', [e2]); // a retry: still once
    await settle([a, b]);
    expect(b.host.timelog.get('b1')?.map((e) => (e as { id: string }).id).sort()).toEqual(['e1', 'e2']);
    expect(server.timelog.get('b1')?.get('2026-11')).toHaveLength(2);
  });

  it('images move both ways', async () => {
    const server = new FakeServer();
    const a = makeDevice(server);
    const b = makeDevice(server);
    a.host.files.set('01HXYZABCDEF', { ext: 'png', bytes: new Uint8Array([1, 2, 3]) });
    start(a, b);
    await settle([a, b]);
    expect(b.host.files.get('01HXYZABCDEF')?.ext).toBe('png');
  });
});

describe('fuzz: three devices, random edits, dropped connections (NF7)', () => {
  it('every device ends with the same board', async () => {
    for (let trial = 0; trial < 5; trial++) {
      const server = new FakeServer();
      server.delay = [0, 4];
      const ds = [makeDevice(server, { 'board:b1': board([{ id: 'n0', title: 'start' }]) }), makeDevice(server), makeDevice(server)];
      start(...ds);
      await settle(ds);
      let nextId = 1;
      for (let step = 0; step < 60; step++) {
        const d = ds[Math.floor(Math.random() * ds.length)]!;
        const r = Math.random();
        if (r < 0.1) { d.transport.setOnline(!d.transport.online); continue; }
        d.edit('board:b1', (x) => {
          const list = x.nodes as Node[];
          if (r < 0.4 || list.length === 0) list.push({ id: `n${nextId++}`, title: `t${step}` });
          else if (r < 0.55) list.splice(Math.floor(Math.random() * list.length), 1);
          else { const n = list[Math.floor(Math.random() * list.length)]!; n.title = `edit${step}`; n.x = step; }
        });
        if (step % 7 === 0) await settle(ds, 1);
      }
      for (const d of ds) d.transport.setOnline(true);
      await settle(ds, 12);
      const first = synced(ds[0]!, 'board:b1');
      for (const d of ds) expect(sameContent(synced(d, 'board:b1'), first)).toBe(true);
      // The server's document is the same board plus its edit stamps (Decision 53), every one of them true for that board.
      const onServer = splitStamps(server.docs.get('board:b1')?.body ?? null);
      expect(sameContent(onServer.body, first)).toBe(true);
      expect(stampsFor(onServer.body, Date.now(), onServer.stamps)).toEqual(onServer.stamps);
    }
  }, 60_000);
});
