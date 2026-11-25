/**
 * time-log F21 — recorded time is a task, or a free name with its kind of
 * work. CLI side: `krnl pomo add … --text "name" [--tag <kind>]` and
 * `krnl pomo retag <id> --text "name"` (the app's Log past time / Time spent on).
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { seedBoard } from '../../../src/main/persistence/board';
import { defaultPomoState } from '../../../src/renderer/components/nodes/PomoNode/types';
import { SysParser } from '../../../src/sys/parser';

vi.mock('electron', () => ({
  app: { getName: vi.fn(() => 'krnl0-test') },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
}));

const dir = mkdtempSync(join(tmpdir(), 'krnl0-pomo-add-name-'));
const boardPath = join(dir, 'board.json');
process.env['KRNL0_BOARD_DIR'] = dir;

let SysFacade: typeof import('../../../src/sys/SysFacade').SysFacade;
beforeAll(async () => { ({ SysFacade } = await import('../../../src/sys/SysFacade')); });
afterAll(() => rmSync(dir, { recursive: true, force: true }));

type Board = { nodes: Array<Record<string, unknown>>; [k: string]: unknown };
type Rec = { id: string; label: string; taskId: string | null; tag?: string };
const readBoard = (): Board => JSON.parse(readFileSync(boardPath, 'utf-8')) as Board;
const history = (): Rec[] => ((readBoard().nodes.find((n) => n['kind'] === 'pomo' && n['isMother'] === true)!['state'] as { history: Rec[] }).history);
const run = (argv: string[]) => new SysFacade({ boardPath }).run(argv);

beforeEach(() => {
  const b = seedBoard() as unknown as Board;
  const p = b.nodes.find((n) => n['kind'] === 'pomo' && n['isMother'] === true)!;
  p['state'] = { ...defaultPomoState(), history: [] };
  writeFileSync(boardPath, JSON.stringify(b), 'utf-8');
});

describe('pomo add with a free name (F21)', () => {
  it('parses --tag', () => {
    expect(SysParser.parse(['pomo', 'add', '--start', '20:00', '--end', '22:00', '--text', 'Age of Empires 2', '--tag', 'writing']))
      .toEqual({ kind: 'pomo', sub: 'add', start: '20:00', end: '22:00', ref: undefined, text: 'Age of Empires 2', tag: 'writing' });
  });

  it('records a name that is not a task', async () => {
    const r = await run(['pomo', 'add', '--start', '2026-11-03T20:00', '--end', '22:00', '--text', 'Age of Empires 2']);
    expect(r.ok, r.message).toBe(true);
    const h = history();
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ label: 'Age of Empires 2', taskId: null });
  });

  it('files the name under the kind of work given', async () => {
    const r = await run(['pomo', 'add', '--start', '2026-11-03T20:00', '--end', '22:00', '--text', 'Age of Empires 2', '--tag', 'writing']);
    expect(r.ok, r.message).toBe(true);
    expect(history()[0]).toMatchObject({ label: 'Age of Empires 2', taskId: null, tag: 'writing' });
  });

  it('refuses an unknown kind, and --tag with a task', async () => {
    expect((await run(['pomo', 'add', '--start', '2026-11-03T20:00', '--end', '22:00', '--text', 'Chess', '--tag', 'no-such-kind'])).ok).toBe(false);
    expect((await run(['pomo', 'add', '--start', '2026-11-03T20:00', '--end', '22:00', '--task', 'x', '--tag', 'writing'])).ok).toBe(false);
    expect(history()).toHaveLength(0);
  });

  it('retag gives a recorded span a free name', async () => {
    await run(['pomo', 'add', '--start', '2026-11-03T20:00', '--end', '22:00', '--text', 'Something']);
    const id = history()[0]!.id;
    const r = await run(['pomo', 'retag', id, '--text', 'Age of Empires 2', '--tag', 'writing']);
    expect(r.ok, r.message).toBe(true);
    expect(history()[0]).toMatchObject({ label: 'Age of Empires 2', taskId: null, tag: 'writing' });
  });
});

describe('time rename (F22)', () => {
  it('parses', () => {
    expect(SysParser.parse(['time', 'rename', 'AOE2', 'Age of Empires 2', '--tag', 'writing']))
      .toEqual({ kind: 'time', sub: 'rename', from: 'AOE2', to: 'Age of Empires 2', tag: 'writing' });
  });

  it('moves every span of a name to another, and says when nothing is named so', async () => {
    await run(['pomo', 'add', '--start', '2026-11-03T18:00', '--end', '19:00', '--text', 'AOE2']);
    await run(['pomo', 'add', '--start', '2026-11-03T20:00', '--end', '22:00', '--text', 'Age of Empires 2']);
    const r = await run(['time', 'rename', 'aoe2', 'Age of Empires 2', '--tag', 'writing']);
    expect(r.ok, r.message).toBe(true);
    expect(history().map((h) => h.label)).toEqual(['Age of Empires 2', 'Age of Empires 2']);
    expect(history()[0]).toMatchObject({ tag: 'writing' });
    expect((await run(['time', 'rename', 'Chess', 'Go'])).ok).toBe(false);
  });
});

describe('pomo add over time already recorded (F23)', () => {
  it('adds the free parts around it', async () => {
    await run(['pomo', 'add', '--start', '2026-11-03T15:00', '--end', '15:10', '--text', 'Emails']);
    const r = await run(['pomo', 'add', '--start', '2026-11-03T14:00', '--end', '17:00', '--text', 'Chess']);
    expect(r.ok, r.message).toBe(true);
    expect(r.message).toContain('around time already recorded');
    expect(history().map((h) => h.label)).toEqual(['Chess', 'Emails', 'Chess']);
  });
});

describe('time rename reaches the time log (Analytics reads it)', () => {
  it('logs a span.retagged line for every renamed span', async () => {
    const { readTimeLog } = await import('../../../src/main/persistence/timelog');
    await run(['pomo', 'add', '--start', '2026-11-03T18:00', '--end', '19:00', '--text', 'AOE2']);
    const before = readTimeLog(dir).length;
    const r = await run(['time', 'rename', 'AOE2', 'Age of Empires 2']);
    expect(r.ok, r.message).toBe(true);
    const added = readTimeLog(dir).slice(before);
    expect(added.some((e) => e.type === 'span.retagged' && (e as { taskText?: string }).taskText === 'Age of Empires 2')).toBe(true);
  });
});

