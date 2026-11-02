/**
 * theme.frame.test.ts — ADR 0009 F5: `sys theme frames | frame <id> | show`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

vi.mock('electron', () => ({
  app: { getName: vi.fn(() => 'krnl0-test') },
  ipcMain: { handle: vi.fn() },
  protocol: { handle: vi.fn(), registerSchemesAsPrivileged: vi.fn() },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
}));

let tmp = '';
let boardPath = '';

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'krnl0-theme-'));
  boardPath = join(tmp, 'board.json');
  writeFileSync(boardPath, JSON.stringify({ version: 1, schemaVersion: 1, theme: 'dark', viewport: { x: 0, y: 0, zoom: 1 }, nodes: [], edges: [] }), 'utf-8');
  vi.resetModules();
});

afterEach(() => {
  try { rmSync(tmp, { recursive: true, force: true }); } catch { /* best-effort */ }
});

describe('sys theme frames', () => {
  it('lists all 8 frame styles as JSON, headlessly', async () => {
    const { SysFacade } = await import('../../../src/sys/SysFacade');
    const res = await new SysFacade({ boardPath }).run(['theme', 'frames', '--json']);
    expect(res.ok).toBe(true);
    const frames = JSON.parse(res.message ?? '[]') as Array<{ id: string }>;
    expect(frames.map((f) => f.id)).toEqual(['classic', 'pro', 'synthesizer', 'telemetry', 'krnl-dock', 'blueprint', 'macintosh', 'submarine']);
  });
});

describe('sys theme frame <id>', () => {
  it('dispatches theme.frame to the renderer', async () => {
    const { SysFacade } = await import('../../../src/sys/SysFacade');
    const cliDispatch = vi.fn(async () => ({ ok: true, message: 'Frame style set to pro' }));
    const res = await new SysFacade({ boardPath, cliDispatch }).run(['theme', 'frame', 'pro']);
    expect(res.ok).toBe(true);
    expect(cliDispatch).toHaveBeenCalledWith('theme.frame', { value: 'pro' });
  });

  it('rejects unknown ids without dispatching', async () => {
    const { SysFacade } = await import('../../../src/sys/SysFacade');
    const cliDispatch = vi.fn(async () => ({ ok: true, message: '' }));
    const res = await new SysFacade({ boardPath, cliDispatch }).run(['theme', 'frame', 'nope']);
    expect(res.ok).toBe(false);
    expect(res.message).toBe('Unknown frame style: nope');
    expect(cliDispatch).not.toHaveBeenCalled();
  });

  it('needs an open renderer window', async () => {
    const { SysFacade } = await import('../../../src/sys/SysFacade');
    const res = await new SysFacade({ boardPath }).run(['theme', 'frame', 'pro']);
    expect(res.ok).toBe(false);
    expect(res.message).toContain('requires an open renderer window');
  });
});

describe('sys theme show', () => {
  it('reports the frame from the renderer when a window is open', async () => {
    const { SysFacade } = await import('../../../src/sys/SysFacade');
    const cliDispatch = vi.fn(async () => ({ ok: true, message: 'synthesizer' }));
    const res = await new SysFacade({ boardPath, cliDispatch }).run(['theme', 'show', '--json']);
    expect(res.ok).toBe(true);
    expect(JSON.parse(res.message ?? '{}')).toEqual({ theme: 'dark', frame: 'synthesizer' });
    expect(cliDispatch).toHaveBeenCalledWith('theme.frame.get', {});
  });

  it('reports frame as unknown headlessly', async () => {
    const { SysFacade } = await import('../../../src/sys/SysFacade');
    const res = await new SysFacade({ boardPath }).run(['theme', 'show', '--json']);
    expect(JSON.parse(res.message ?? '{}')).toEqual({ theme: 'dark', frame: 'unknown' });
  });
});

describe('sys theme show — light / dark', () => {
  it('reports the theme the open window shows (it is not board data)', async () => {
    const { SysFacade } = await import('../../../src/sys/SysFacade');
    const cliDispatch = vi.fn(async (cmd: string) => ({ ok: true, message: cmd === 'theme.get' ? 'light' : 'pro' }));
    const res = await new SysFacade({ boardPath, cliDispatch }).run(['theme', 'show', '--json']);
    expect(JSON.parse(res.message ?? '{}')).toEqual({ theme: 'light', frame: 'pro' });
    const info = await new SysFacade({ boardPath, cliDispatch }).run(['info', '--json']);
    expect((JSON.parse(info.message ?? '{}') as { theme: string }).theme).toBe('light');
  });
});
