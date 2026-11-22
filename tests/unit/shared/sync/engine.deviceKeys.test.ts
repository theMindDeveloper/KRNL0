// Decision 61 — a window's place, visibility and size stay on each device,
// through a real sync between two devices (the fake server): uploads carry
// the uploader's places (for older versions), a device never takes another's,
// and changing only a place never sends anything.
import { afterEach, describe, expect, it } from 'vitest';
import { FakeServer, makeDevice, settle, type Device } from './fakes';
import type { Json } from '../../../../src/shared/sync/types';

const DOC = 'board:main';
type Cfg = Record<string, Json>;
const calendar = (config: Cfg) => ({ id: 'mother-calendar', kind: 'calendar', isMother: true, position: { x: 0, y: 0 }, config, state: {} });
const board = (config: Cfg) => ({ schemaVersion: 2, nodes: [calendar(config)], edges: [] });
const cfgOf = (d: Device): Cfg => ((d.host.read(DOC) as { nodes: Array<{ config: Cfg }> }).nodes[0]!.config);
const setCfg = (d: Device, patch: Cfg) => d.edit(DOC, (b) => {
  const n = (b as { nodes: Array<{ config: Cfg }> }).nodes[0]!;
  n.config = { ...n.config, ...patch };
});

let devices: Device[] = [];
afterEach(() => { for (const d of devices) d.engine.stop(); devices = []; });

describe('per-device window keys through sync (Decision 61)', () => {
  it('two devices keep their own places and sizes; other settings still sync', async () => {
    const server = new FakeServer();
    const a = makeDevice(server, { [DOC]: board({ view: 'week', stationSlot: 'top-left', canvasSize: { width: 900, height: 900 } }) });
    const b = makeDevice(server);
    devices.push(a, b);
    a.engine.start();
    await settle([a]);
    // What reached the server still carries A's places (an older KRNL0 keeps its layout).
    const onServer = server.docs.get(DOC)!.body as { nodes: Array<{ config: Cfg }> };
    expect(onServer.nodes[0]!.config['stationSlot']).toBe('top-left');

    b.engine.start();
    await settle([a, b]);
    expect(cfgOf(b)['view']).toBe('week');

    // B moves and resizes its Calendar: nothing is sent for that alone.
    const puts = server.puts;
    setCfg(b, { stationSlot: 'bottom', canvasSize: { width: 1200, height: 1200 } });
    await settle([a, b]);
    expect(server.puts).toBe(puts);
    expect(cfgOf(a)['stationSlot']).toBe('top-left');

    // A changes a real setting: B takes it and keeps its own place and size.
    setCfg(a, { view: 'month' });
    await settle([a, b]);
    expect(cfgOf(b)).toMatchObject({ view: 'month', stationSlot: 'bottom', canvasSize: { width: 1200, height: 1200 } });
    expect(cfgOf(a)).toMatchObject({ view: 'month', stationSlot: 'top-left', canvasSize: { width: 900, height: 900 } });

    // And the other way round.
    setCfg(b, { view: 'year' });
    await settle([a, b]);
    expect(cfgOf(a)).toMatchObject({ view: 'year', stationSlot: 'top-left', canvasSize: { width: 900, height: 900 } });
    expect(cfgOf(b)).toMatchObject({ view: 'year', stationSlot: 'bottom' });
  });
});
