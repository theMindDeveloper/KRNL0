/** Decision 38 — `krnl whatsnew|feedback|catchup|share|app` (launch-experience.md F7, F15, F19, F23, F24). */
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
import { DEFAULT_APP_STATE, type AppStatePort, type LaunchInfo } from '../../../src/shared/appState';

describe('parser', () => {
  it.each([
    [['whatsnew'], { kind: 'whatsnew', sub: 'print', json: false }],
    [['whatsnew', '--json'], { kind: 'whatsnew', sub: 'print', json: true }],
    [['whatsnew', 'show'], { kind: 'whatsnew', sub: 'show' }],
    [['feedback', 'grid', 'skips', 'sunday'], { kind: 'feedback', title: 'grid skips sunday', feedbackKind: undefined, link: false }],
    [['feedback', 'dark mode', '--kind', 'idea', '--link'], { kind: 'feedback', title: 'dark mode', feedbackKind: 'idea', link: true }],
    [['catchup'], { kind: 'catchup', sub: 'print', json: false }],
    [['catchup', '--json'], { kind: 'catchup', sub: 'print', json: true }],
    [['catchup', 'show'], { kind: 'catchup', sub: 'show' }],
    [['share'], { kind: 'share', sub: 'list', json: false }],
    [['share', 'streak', 'morning run'], { kind: 'share', sub: 'streak', habit: 'morning run' }],
    [['share', 'sessions'], { kind: 'share', sub: 'sessions' }],
    [['app'], { kind: 'app', sub: 'status', json: false }],
    [['app', 'backups', '--json'], { kind: 'app', sub: 'backups', json: true }],
    [['app', 'celebrations', 'off'], { kind: 'app', sub: 'celebrations', on: false }],
    [['app', 'celebrations'], { kind: 'app', sub: 'celebrations', on: undefined }],
  ])('%j', (argv, expected) => {
    expect(SysParser.parse(argv)).toEqual(expected);
  });
  it('rejects unknown subcommands', () => {
    expect(SysParser.parse(['whatsnew', 'later'])?.kind).toBe('invalid');
    expect(SysParser.parse(['app', 'celebrations', 'maybe'])?.kind).toBe('invalid');
  });
});

function boardFile(): string {
  const dir = mkdtempSync(join(tmpdir(), 'krnl0-launch-cli-'));
  const path = join(dir, 'board.json');
  writeFileSync(path, JSON.stringify({
    nodes: [{ id: 't1', kind: 'todo.task', position: { x: 0, y: 0 }, isMother: false, state: { text: 'Book dentist', done: false, scheduledFor: '2020-01-02T10:00' }, config: {} }],
    edges: [],
  }));
  return path;
}

const info: LaunchInfo = {
  version: '0.11.0', previousVersion: '0.10.1', kind: 'feature', backupFile: 'board-v0.10.1-before-v0.11.0.json',
  backupDir: '/data/backups', backups: ['board-v0.10.1-before-v0.11.0.json'], awayMs: 3 * 86_400_000, awayFrom: 0,
  simulated: false, system: 'Windows 11 · x64', prefs: { ...DEFAULT_APP_STATE },
};

describe('headless commands', () => {
  it('whatsnew prints the newest notes', async () => {
    const r = await new SysFacade({ boardPath: boardFile() }).run(['whatsnew']);
    expect(r.ok).toBe(true);
    expect(r.message).toContain("What's new in KRNL0");
  });
  it('catchup reads the board', async () => {
    const r = await new SysFacade({ boardPath: boardFile() }).run(['catchup']);
    expect(r.message).toContain('Book dentist');
    expect(r.message).toContain('passed their day');
  });
  it('feedback without a window prints the GitHub link', async () => {
    const r = await new SysFacade({ boardPath: boardFile() }).run(['feedback', 'week view', '--kind', 'bug']);
    expect(r.ok).toBe(true);
    expect(r.message).toContain('https://github.com/theMindDeveloper/KRNL0/issues/new?');
    expect(r.message).toContain('week+view');
  });
  it('opening something needs the window', async () => {
    const r = await new SysFacade({ boardPath: boardFile() }).run(['whatsnew', 'show']);
    expect(r.ok).toBe(false);
  });
  it('dialogs go to the window through cliDispatch', async () => {
    const cliDispatch = vi.fn(async () => ({ ok: true, message: 'opened' }));
    const sys = new SysFacade({ boardPath: boardFile(), hasOpenRenderer: () => true, cliDispatch });
    await sys.run(['catchup', 'show']);
    await sys.run(['feedback', 'crash', '--kind', 'idea']);
    await sys.run(['share', 'streak', 'run']);
    expect(cliDispatch.mock.calls).toEqual([
      ['catchup.show', {}],
      ['feedback.open', { title: 'crash', kind: 'idea' }],
      ['share.show', { kind: 'streak', habit: 'run' }],
    ]);
  });
  it('share list works headless', async () => {
    const r = await new SysFacade({ boardPath: boardFile() }).run(['share']);
    expect(r.message).toContain('Focus sessions: 0');
  });
});

describe('krnl app (F24)', () => {
  const port = (): AppStatePort & { setPrefs: ReturnType<typeof vi.fn> } => ({
    launch: () => info,
    setPrefs: vi.fn((p) => ({ ...DEFAULT_APP_STATE, ...p })),
  });
  it('needs the running app', async () => {
    const r = await new SysFacade({ boardPath: boardFile() }).run(['app']);
    expect(r.ok).toBe(false);
  });
  it('status, backups and celebrations', async () => {
    const p = port();
    const sys = new SysFacade({ boardPath: boardFile(), appState: p });
    expect((await sys.run(['app'])).message).toContain('updated from 0.10.1');
    expect((await sys.run(['app', 'backups'])).message).toContain('board-v0.10.1-before-v0.11.0.json');
    await sys.run(['app', 'celebrations', 'off']);
    expect(p.setPrefs).toHaveBeenCalledWith({ celebrations: false });
  });
});
