/** Quick add — plans typed the way people say them. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { SysFacade } from '../../../src/sys/SysFacade';
import { seedBoard } from '../../../src/main/persistence/board';
import { parseQuickAdd, describeQuickAdd } from '../../../src/shared/quickAdd';

vi.mock('electron', () => ({
  app: { getName: vi.fn(() => 'krnl0-test'), getAppPath: vi.fn(() => tmpdir()), on: vi.fn() },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
}));

// Sunday 8 Nov 2026, 10:00.
const NOW = new Date(2026, 10, 8, 10, 0);

describe('parseQuickAdd', () => {
  it('a day and a time', () => {
    expect(parseQuickAdd('Call mom tomorrow at 5pm', NOW)).toEqual({ text: 'Call mom', day: '2026-11-09', time: '17:00' });
  });
  it('a 24-hour time and a length, today', () => {
    expect(parseQuickAdd('Gym 18:00 1h', NOW)).toEqual({ text: 'Gym', day: '2026-11-08', time: '18:00', durationMin: 60 });
  });
  it('a weekday without a time is a due day', () => {
    expect(parseQuickAdd('Pay rent friday', NOW)).toEqual({ text: 'Pay rent', day: '2026-11-13' });
  });
  it('a length alone', () => {
    expect(parseQuickAdd('Read 30 min', NOW)).toEqual({ text: 'Read', durationMin: 30 });
    expect(parseQuickAdd('Deep work 1h30', NOW)).toEqual({ text: 'Deep work', durationMin: 90 });
  });
  it('a time that already passed today rolls to tomorrow (and says so)', () => {
    expect(parseQuickAdd('Stretch at 9am', NOW)).toEqual({ text: 'Stretch', day: '2026-11-09', time: '09:00', rolledToTomorrow: true });
  });
  it('"next monday" is the one after this coming Monday', () => {
    expect(parseQuickAdd('Review next monday', NOW).day).toBe('2026-11-16');
    expect(parseQuickAdd('Review monday', NOW).day).toBe('2026-11-09');
  });
  it('"at 3" is 3 pm; "at 9" is 9 am; 3am stays 3 am', () => {
    expect(parseQuickAdd('Call Sam at 3', NOW).time).toBe('15:00');
    expect(parseQuickAdd('Standup at 9 tomorrow', NOW).time).toBe('09:00');
    expect(parseQuickAdd('Flight at 3am tomorrow', NOW).time).toBe('03:00');
  });
  it('"every …" makes a repeating plan, starting on its first day', () => {
    expect(parseQuickAdd('Water plants every day', NOW)).toEqual({ text: 'Water plants', repeat: { kind: 'daily' }, day: '2026-11-08' });
    expect(parseQuickAdd('Weekly review every sunday 18:00', NOW)).toEqual({ text: 'Weekly review', repeat: { kind: 'weekly', day: 7 }, day: '2026-11-08', time: '18:00' });
    expect(parseQuickAdd('Standup every weekday 9:30', NOW)).toMatchObject({ text: 'Standup', repeat: { kind: 'weekdays' }, day: '2026-11-09', time: '09:30' });
    expect(describeQuickAdd(parseQuickAdd('Weekly review every sunday 18:00', NOW), NOW)).toBe('today 18:00 · repeats every Sunday');
  });
  it('a range gives the start and the length', () => {
    expect(parseQuickAdd('Meeting 14:00-15:30', NOW)).toEqual({ text: 'Meeting', day: '2026-11-08', time: '14:00', durationMin: 90 });
    expect(parseQuickAdd('Gym 6pm-7pm tomorrow', NOW)).toEqual({ text: 'Gym', day: '2026-11-09', time: '18:00', durationMin: 60 });
    expect(parseQuickAdd('Class 9-11am monday', NOW)).toEqual({ text: 'Class', day: '2026-11-09', time: '09:00', durationMin: 120 });
    expect(parseQuickAdd('Pages 10-20', NOW)).toEqual({ text: 'Pages 10-20' }); // no clock words: not a time
  });
  it('"in 2 hours" is a start from now; a length can follow', () => {
    expect(parseQuickAdd('Call back in 2 hours', NOW)).toEqual({ text: 'Call back', time: '12:00', day: '2026-11-08' });
    expect(parseQuickAdd('Stretch in 17 min for 10 min', new Date(2026, 10, 8, 10, 1))).toEqual({ text: 'Stretch', time: '10:20', day: '2026-11-08', durationMin: 10 });
    expect(parseQuickAdd('Sleep in 3 hours', new Date(2026, 10, 8, 22, 30)).day).toBe('2026-11-09');
  });
  it('plain names are left alone', () => {
    expect(parseQuickAdd('Read chapter 3', NOW)).toEqual({ text: 'Read chapter 3' });
    expect(parseQuickAdd('Buy 2 m cable', NOW)).toEqual({ text: 'Buy 2 m cable' });
    expect(parseQuickAdd('Call 5 friends', NOW)).toEqual({ text: 'Call 5 friends' });
  });
});

describe('quick add reads dates', () => {
  it('day before month, month names and ordinals; past dates move forward', () => {
    expect(parseQuickAdd('Dentist 15.11', NOW)).toEqual({ text: 'Dentist', day: '2026-11-15' });
    expect(parseQuickAdd('Dentist 15.11. at 9:30', NOW)).toEqual({ text: 'Dentist', day: '2026-11-15', time: '09:30' });
    expect(parseQuickAdd('Tax return 31/1', NOW).day).toBe('2027-01-31');
    expect(parseQuickAdd('Party Nov 20th 7pm', NOW)).toEqual({ text: 'Party', day: '2026-11-20', time: '19:00' });
    expect(parseQuickAdd('Trip on 3 March', NOW)).toEqual({ text: 'Trip', day: '2027-03-03' });
    expect(parseQuickAdd('Pay bills on the 15th', NOW)).toEqual({ text: 'Pay bills', day: '2026-11-15' });
    expect(parseQuickAdd('Pay bills on the 2nd', NOW).day).toBe('2026-12-02');
  });
  it('noon is 12:00', () => {
    expect(parseQuickAdd('Lunch with Sam at noon friday', NOW)).toEqual({ text: 'Lunch with Sam', time: '12:00', day: '2026-11-13' });
  });
  it('several repeat days: reads none of it and says why', () => {
    const q = parseQuickAdd('Gym every monday and thursday 18:00', NOW);
    expect(q.text).toBe('Gym every monday and thursday 18:00');
    expect(q.repeat).toBeUndefined();
    expect(q.day).toBeUndefined();
    expect(q.hint).toContain('routine');
    expect(parseQuickAdd('Gym every mon, thu', NOW).hint).toBeDefined();
    expect(parseQuickAdd('Gym every monday 18:00', NOW).hint).toBeUndefined();
  });
  it('leaves lengths, versions and impossible dates alone', () => {
    expect(parseQuickAdd('Read 1.5h', NOW)).toEqual({ text: 'Read', durationMin: 90 });
    expect(parseQuickAdd('Ship 2.5.1', NOW)).toEqual({ text: 'Ship 2.5.1' });
    expect(parseQuickAdd('Odd 31.02', NOW).day).toBeUndefined();
  });
});

describe('describeQuickAdd', () => {
  it('says what Enter will do', () => {
    expect(describeQuickAdd(parseQuickAdd('Call mom tomorrow at 5pm', NOW), NOW)).toBe('tomorrow 17:00');
    expect(describeQuickAdd(parseQuickAdd('Gym 18:00 1h', NOW), NOW)).toBe('today 18:00 · 1 h');
    expect(describeQuickAdd(parseQuickAdd('Pay rent friday', NOW), NOW)).toBe('due Fri 13 Nov');
    expect(describeQuickAdd(parseQuickAdd('Read chapter 3', NOW), NOW)).toBeNull();
  });
});

describe('krnl todo add reads the words too', () => {
  let dir = '';
  let boardPath = '';
  let f: SysFacade;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'krnl0-quick-'));
    boardPath = join(dir, 'board.json');
    writeFileSync(boardPath, JSON.stringify(seedBoard()), 'utf-8');
    f = new SysFacade({ boardPath, hasOpenRenderer: () => false, onBoardChanged: () => {} });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const board = () => JSON.parse(readFileSync(boardPath, 'utf-8')) as { nodes: Array<{ id: string; kind: string; isMother?: boolean; state: Record<string, unknown> }> };

  it('a day and a time land on the Calendar; a day alone is a due day', async () => {
    const r = await f.run(['todo', 'add', 'Dentist next monday 14:00 30 min']);
    expect(r.ok).toBe(true);
    expect(r.message).toContain('on the Calendar');
    const task = board().nodes.find((n) => n.kind === 'todo.task' && n.state['text'] === 'Dentist')!;
    expect(String(task.state['scheduledFor'])).toMatch(/T14:00$/);
    expect(task.state['plannedMin']).toBe(30);
    await f.run(['todo', 'add', 'Pay rent friday']);
    const items = board().nodes.find((n) => n.kind === 'todo' && n.isMother)!.state['items'] as Array<{ text: string; dueOn?: string }>;
    expect(items.find((i) => i.text === 'Pay rent')?.dueOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const r2 = await f.run(['todo', 'add', 'Water plants every day']);
    expect(r2.message).toContain('repeats every day');
    const again = board().nodes.find((n) => n.kind === 'todo' && n.isMother)!.state['items'] as Array<{ text: string; repeat?: unknown }>;
    expect(again.find((i) => i.text === 'Water plants')?.repeat).toEqual({ kind: 'daily' });
  });
});
