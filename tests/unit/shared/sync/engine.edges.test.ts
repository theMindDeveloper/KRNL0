// Edge cases of the sync engine (server-sync.md, "Edge cases"): what the server
// will never take, a certificate that changed, and a board from a newer app.
import { afterEach, describe, expect, it } from 'vitest';
import { FakeServer, makeDevice, settle, type Device } from './fakes';
import { SyncEngine } from '../../../../src/shared/sync/engine';
import { SyncError, type Json } from '../../../../src/shared/sync/types';

const board = (nodes: Array<{ id: string }>, extra: Record<string, Json> = {}) => ({ schemaVersion: 2, nodes, edges: [], ...extra });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let devices: Device[] = [];
afterEach(() => { for (const d of devices) d.engine.stop(); devices = []; });
const start = (...ds: Device[]) => { devices.push(...ds); for (const d of ds) d.engine.start(); };

describe('too large for the server (refused)', () => {
  it('a board the server refuses pauses with the reason, and is not retried in a loop', async () => {
    const server = new FakeServer();
    const a = makeDevice(server, { 'board:b1': board([{ id: 'n1' }]) });
    let puts = 0;
    const realPut = a.transport.putDoc.bind(a.transport);
    a.transport.putDoc = async (name, baseRev, body) => {
      if (name === 'board:b1') { puts++; throw new SyncError('refused', 'This board is too large for the server (20 MB).'); }
      return realPut(name, baseRev, body);
    };
    start(a);
    await settle([a]);
    const after = puts;
    await sleep(300);
    await settle([a]);
    expect(a.engine.getStatus().state).toBe('paused');
    expect(a.engine.getStatus().message).toContain('too large');
    expect(puts).toBe(after); // no retry storm
    // Another board still syncs.
    a.edit('board:b2', (b) => { b.nodes = [{ id: 'other' }]; });
    await settle([a]);
    expect(server.docs.get('board:b2')).toBeDefined();
  });

  it('a file the server refuses stays on the device, is said once, and is not tried again', async () => {
    const server = new FakeServer();
    const a = makeDevice(server);
    a.host.files.set('01HUGEVIDEO0000', { ext: 'mp4', bytes: new Uint8Array([1, 2, 3]) });
    let tries = 0;
    a.transport.putAsset = async () => { tries++; throw new SyncError('refused', 'asset too large'); };
    start(a);
    await settle([a]);
    expect(tries).toBe(1);
    expect(a.store.flag('asset-refused:01HUGEVIDEO0000')).toBe(true);
    expect(a.engine.getStatus().state).toBe('synced');
    expect(a.engine.getStatus().message).toContain('too large for the server');
    await a.engine.syncNow();
    await settle([a]);
    expect(tries).toBe(1);
  });
});

describe('the server\'s certificate changed', () => {
  it('stops and asks to connect again (a job meets it)', async () => {
    const server = new FakeServer();
    const a = makeDevice(server, { 'board:b1': board([{ id: 'n1' }]) });
    a.transport.listDocs = async () => { throw new SyncError('certificate', 'The server\'s certificate is not the one this computer paired with.'); };
    start(a);
    await settle([a]);
    expect(a.engine.getStatus().state).toBe('signed-out');
    expect(a.engine.getStatus().message).toContain('certificate');
  });

  it('stops when the live connection is refused for its certificate', async () => {
    const server = new FakeServer();
    const a = makeDevice(server);
    a.transport.connect = (h) => { setTimeout(() => h.onClose({ retrying: false, kind: 'certificate', message: 'certificate changed' }), 5); return () => {}; };
    start(a);
    await sleep(40);
    expect(a.engine.getStatus().state).toBe('signed-out');
    expect(a.engine.getStatus().message).toBe('certificate changed');
  });
});

describe('a board saved by a newer KRNL0', () => {
  it('says the words this client gives (the web: update the server)', async () => {
    const server = new FakeServer();
    server.docs.set('board:b1', { rev: 4, body: board([{ id: 'n1' }], { schemaVersion: 99 }), deleted: false });
    const base = makeDevice(server);
    const engine = new SyncEngine({ transport: base.transport, host: base.host, store: base.store, debounceMs: 5, newerAppMessage: 'Update your KRNL0 server.' });
    const d: Device = { ...base, engine };
    start(d);
    await settle([d]);
    expect(engine.getStatus().state).toBe('update');
    expect(engine.getStatus().message).toBe('Update your KRNL0 server.');
    expect(d.host.read('board:b1')).toBeNull(); // never written over with a shape it does not know
  });
});
