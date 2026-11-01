/**
 * CLI input hardening: flags may come before positionals, numeric options
 * reject NaN / zero / negative, and the pomo/habit/marquee verbs added for
 * CLI parity parse correctly.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { getName: vi.fn(() => 'krnl0-test') },
  ipcMain: { handle: vi.fn() },
  protocol: { handle: vi.fn(), registerSchemesAsPrivileged: vi.fn() },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
}));
import { SysParser } from '../../../src/sys/parser';
import { SysFacade } from '../../../src/sys/SysFacade';

describe('SysParser — positional arguments after flags', () => {
  it('todo add --tag work "milk" reads "milk" as the text', () => {
    expect(SysParser.parse(['todo', 'add', '--tag', 'work', 'milk'])).toEqual({
      kind: 'todo', sub: 'add', text: 'milk', tag: 'work',
    });
  });

  it('boolean flags do not swallow the following positional', () => {
    expect(SysParser.parse(['habit', 'icon', '--clear', 'run'])).toMatchObject({
      kind: 'habit', sub: 'icon', ref: 'run', clear: true,
    });
  });

  it('task schedule --at <iso> <id> still finds the id', () => {
    expect(SysParser.parse(['task', 'schedule', '--at', '2026-11-02T09:00', 't1'])).toMatchObject({
      kind: 'task', sub: 'schedule', id: 't1', at: '2026-11-02T09:00',
    });
  });
});

describe('SysParser — strict positive numbers', () => {
  it.each([
    [['task', 'add', 'x', '--duration', '30m']],
    [['task', 'add', 'x', '--duration', '0']],
    [['task', 'add', 'x', '--duration', '-5']],
    [['pomo', 'start', '--minutes', 'abc']],
    [['pomo', 'config', '--session', 'NaN']],
    [['task', 'duration', 't1', 'ten']],
    [['analytics', 'totals', '--range', '']],
  ])('rejects %j as invalid', (argv) => {
    expect(SysParser.parse(argv)).toMatchObject({ kind: 'invalid' });
  });

  it('accepts a valid duration', () => {
    expect(SysParser.parse(['task', 'add', 'x', '--duration', '45'])).toMatchObject({ durationMin: 45 });
  });

  it('the facade reports invalid input as a failure', async () => {
    const res = await new SysFacade({ boardPath: '/nonexistent/board.json' }).run(['task', 'add', 'x', '--duration', '30m']);
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/--duration must be a positive number/);
  });
});

describe('SysParser — CLI parity verbs', () => {
  it.each(['pause', 'resume', 'discard'])('parses pomo %s', (sub) => {
    expect(SysParser.parse(['pomo', sub])).toEqual({ kind: 'pomo', sub });
  });

  it('parses habit undo', () => {
    expect(SysParser.parse(['habit', 'undo', 'run', '--date', '2026-01-02'])).toEqual({
      kind: 'habit', sub: 'undo', name: 'run', date: '2026-01-02',
    });
  });

  it('marquee without --delete is refused before anything is dispatched', async () => {
    let dispatched = false;
    const facade = new SysFacade({
      boardPath: '/nonexistent/board.json',
      cliDispatch: async () => { dispatched = true; return { ok: true, message: '' }; },
    });
    const res = await facade.run(['marquee', '--rect', '0,0,500,500']);
    expect(res.ok).toBe(false);
    expect(dispatched).toBe(false);
    const ok = await facade.run(['marquee', '--rect', '0,0,500,500', '--delete']);
    expect(ok.ok).toBe(true);
    expect(dispatched).toBe(true);
  });
});
