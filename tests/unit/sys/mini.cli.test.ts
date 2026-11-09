/** Decision 37 — `krnl mini status|show|hide|on|off` (pocket-timer.md F10). */
import { describe, it, expect, vi } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';

vi.mock('electron', () => ({
  app: { getName: vi.fn(() => 'krnl0-test'), getAppPath: vi.fn(() => tmpdir()), on: vi.fn() },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
}));

import { SysFacade } from '../../../src/sys/SysFacade';
import { SysParser } from '../../../src/sys/parser';
import type { PocketPort, PocketStatus } from '../../../src/shared/pocket';

const boardPath = join(tmpdir(), 'krnl0-mini-cli-unused', 'board.json');

function fakePocket(status: PocketStatus) {
  const port = {
    status: () => status,
    show: vi.fn(() => ({ ok: true, message: 'Floating timer shown.' })),
    hide: vi.fn(() => ({ ok: true, message: 'Floating timer hidden.' })),
    setEnabled: vi.fn((on: boolean) => ({ ok: true, message: on ? 'Floating timer on.' : 'Floating timer off.' })),
    setLook: vi.fn((look: string) => ({ ok: true, message: `Floating timer look: ${look}.` })),
  };
  return port satisfies PocketPort;
}

const live: PocketStatus = { enabled: true, visible: true, collapsed: false, look: 'dial', live: true };

describe('mini parser', () => {
  it.each([
    [['mini'], { kind: 'mini', sub: 'status', json: false }],
    [['mini', '--json'], { kind: 'mini', sub: 'status', json: true }],
    [['mini', 'status', '--json'], { kind: 'mini', sub: 'status', json: true }],
    [['mini', 'show'], { kind: 'mini', sub: 'show' }],
    [['mini', 'hide'], { kind: 'mini', sub: 'hide' }],
    [['mini', 'on'], { kind: 'mini', sub: 'on' }],
    [['mini', 'off'], { kind: 'mini', sub: 'off' }],
    [['mini', 'look', 'capsule'], { kind: 'mini', sub: 'look', look: 'capsule' }],
    [['mini', 'look'], { kind: 'mini', sub: 'look', look: undefined }],
  ])('%j', (argv, expected) => {
    expect(SysParser.parse(argv)).toEqual(expected);
  });

  it('rejects an unknown subcommand with the valid ones', () => {
    expect(SysParser.parse(['mini', 'big'])).toMatchObject({ kind: 'invalid', message: expect.stringContaining('status | show | hide | on | off') });
  });
});

describe('mini commands', () => {
  it('status prints plain words, --json the bare status', async () => {
    const r = await new SysFacade({ boardPath, pocket: fakePocket(live) }).run(['mini']);
    expect(r.message).toBe('Floating timer is on (dial) · showing · a session is running.');
    const j = await new SysFacade({ boardPath, pocket: fakePocket(live) }).run(['mini', 'status', '--json']);
    expect(JSON.parse(j.message!)).toEqual(live);
  });

  it('on, off and show go to the running app', async () => {
    const p = fakePocket(live);
    expect((await new SysFacade({ boardPath, pocket: p }).run(['mini', 'off'])).message).toBe('Floating timer off.');
    expect(p.setEnabled).toHaveBeenCalledWith(false);
    await new SysFacade({ boardPath, pocket: p }).run(['mini', 'show']);
    expect(p.show).toHaveBeenCalled();
  });

  it('look picks dial, capsule or box (F12)', async () => {
    const p = fakePocket(live);
    await new SysFacade({ boardPath, pocket: p }).run(['mini', 'look', 'box']);
    expect(p.setLook).toHaveBeenCalledWith('box');
    const bad = await new SysFacade({ boardPath, pocket: p }).run(['mini', 'look', 'orb']);
    expect(bad.ok).toBe(false);
    const now = await new SysFacade({ boardPath, pocket: p }).run(['mini', 'look']);
    expect(now.message).toContain('dial');
  });

  it('outside the app it says where to run it', async () => {
    const r = await new SysFacade({ boardPath }).run(['mini', 'status']);
    expect(r.ok).toBe(false);
    expect(r.message).toContain('running KRNL0 app');
  });
});
