/** Decision 60 — a window's place, visibility and size stay on each device. */
import { describe, it, expect } from 'vitest';
import { NODE_CONFIG_DEVICE_KEYS, restoreDevice, stripDevice, withDeviceNodeKeys } from '../../../src/shared/sync/shape';

const board = (cfg: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  layoutMode: 'station', nodes: [{ id: 'mother-calendar', kind: 'calendar', isMother: true, position: { x: 0, y: 0 }, config: cfg, state: {} }], ...extra,
});

describe('per-device window keys in sync', () => {
  it('are never uploaded', () => {
    const out = stripDevice('board:b1', board({ view: 'week', stationSlot: 'top-right-lower', stationHidden: false, canvasSize: { width: 900, height: 900 } })) as { nodes: Array<{ config: Record<string, unknown> }> };
    expect(out.nodes[0]!.config).toEqual({ view: 'week' });
    expect(NODE_CONFIG_DEVICE_KEYS).toEqual(['stationSlot', 'stationHidden', 'canvasSize']);
  });

  it('the server\'s copy never overwrites this device\'s; other config still syncs', () => {
    const synced = board({ view: 'month', stationSlot: 'top-left' });
    const local = board({ view: 'week', stationSlot: 'top-right-lower', canvasSize: { width: 900, height: 900 } });
    const out = restoreDevice('board:b1', synced as never, local as never) as { nodes: Array<{ config: Record<string, unknown> }> };
    expect(out.nodes[0]!.config).toEqual({ view: 'month', stationSlot: 'top-right-lower', canvasSize: { width: 900, height: 900 } });
  });

  it('a window this device has never seen keeps what came with it', () => {
    const synced = board({ view: 'week', stationSlot: 'top-left' });
    const out = restoreDevice('board:b1', synced as never, { nodes: [] } as never) as { nodes: Array<{ config: Record<string, unknown> }> };
    expect(out.nodes[0]!.config).toEqual({ view: 'week', stationSlot: 'top-left' });
  });

  it('other documents are left alone', () => {
    const body = { nodes: [{ id: 'x', config: { stationSlot: 'a' } }] };
    expect(stripDevice('boards', body as never)).toEqual(body);
  });

  it("an upload carries this device's own keys again (older versions keep a full layout)", () => {
    const local = board({ view: 'week', stationSlot: 'top-right-lower', canvasSize: { width: 900, height: 900 } });
    const body = stripDevice('board:b1', local as never);
    const up = withDeviceNodeKeys('board:b1', body, local as never) as { nodes: Array<{ config: Record<string, unknown> }> };
    expect(up.nodes[0]!.config).toEqual({ view: 'week', stationSlot: 'top-right-lower', canvasSize: { width: 900, height: 900 } });
  });

  it('only for boards, and only for windows this device has', () => {
    const local = board({ stationSlot: 'a' });
    const body = { nodes: [{ id: 'other', config: { view: 'week' } }] };
    expect(withDeviceNodeKeys('board:b1', body as never, local as never)).toEqual(body);
    expect(withDeviceNodeKeys('boards', { x: 1 } as never, local as never)).toEqual({ x: 1 });
    expect(withDeviceNodeKeys('board:b1', body as never, null)).toEqual(body);
  });
});
