/** `krnl show` / `krnl highlight` — the agent points at something in the window. */
import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

vi.mock('electron', () => ({
  app: { getName: vi.fn(() => 'krnl0-test'), getAppPath: vi.fn(() => tmpdir()), on: vi.fn() },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
}));

import { SysFacade } from '../../../src/sys/SysFacade';
import { SysParser } from '../../../src/sys/parser';

function boardFile(): string {
  const dir = mkdtempSync(join(tmpdir(), 'krnl-show-'));
  const p = join(dir, 'board.json');
  writeFileSync(p, JSON.stringify({ version: 1, nodes: [], edges: [] }));
  return p;
}

describe('parser', () => {
  it.each([
    [['show', 'Essay'], { kind: 'show', sub: 'target', scope: 'auto', ref: 'Essay', note: undefined, seconds: undefined }],
    [['show', 'buy', 'bread', '--note', 'Your bread plan'], { kind: 'show', sub: 'target', scope: 'auto', ref: 'buy bread', note: 'Your bread plan', seconds: undefined }],
    [['highlight', 'calendar', '--for', '5'], { kind: 'show', sub: 'target', scope: 'auto', ref: 'calendar', note: undefined, seconds: 5 }],
    [['show', 'ui', 'add a plan'], { kind: 'show', sub: 'target', scope: 'ui', ref: 'add a plan', note: undefined, seconds: undefined }],
    [['show', 'day', 'today'], { kind: 'show', sub: 'target', scope: 'day', ref: 'today', note: undefined, seconds: undefined }],
    [['show', 'node', 'abcd1234'], { kind: 'show', sub: 'target', scope: 'node', ref: 'abcd1234', note: undefined, seconds: undefined }],
    [['show', 'clear'], { kind: 'show', sub: 'clear' }],
  ])('%j', (argv, expected) => {
    expect(SysParser.parse(argv)).toEqual(expected);
  });
  it('needs something to show', () => {
    expect(SysParser.parse(['show'])?.kind).toBe('invalid');
    expect(SysParser.parse(['show', 'ui'])?.kind).toBe('invalid');
  });
});

describe('facade', () => {
  it('goes to the window through cliDispatch', async () => {
    const cliDispatch = vi.fn(async () => ({ ok: true, message: 'Highlighted' }));
    const sys = new SysFacade({ boardPath: boardFile(), hasOpenRenderer: () => true, cliDispatch });
    await sys.run(['show', 'Essay', '--note', 'Here']);
    await sys.run(['show', 'clear']);
    expect(cliDispatch.mock.calls).toEqual([
      ['ui.show', { sub: 'target', scope: 'auto', ref: 'Essay', note: 'Here' }],
      ['ui.show', { sub: 'clear' }],
    ]);
  });
  it('says it needs the window when none is open', async () => {
    const r = await new SysFacade({ boardPath: boardFile() }).run(['show', 'calendar']);
    expect(r.ok).toBe(false);
  });
});
