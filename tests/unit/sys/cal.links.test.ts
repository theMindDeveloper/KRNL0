/** Decision 64 / calendar-sync F21 — `krnl cal link …`, `cal links`, `cal unlink`, `cal sync`, `cal export`, `cal import`. */
import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { SysParser } from '../../../src/sys/parser';
import { SysFacade } from '../../../src/sys/SysFacade';
import { seedBoard } from '../../../src/main/persistence/board';
import { calendarSetLayers } from '../../../src/renderer/components/nodes/CalendarNode/commands';

vi.mock('electron', () => ({
  app: { getName: vi.fn(() => 'krnl0-test'), getAppPath: vi.fn(() => tmpdir()), on: vi.fn() },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
}));

describe('parsing', () => {
  it('cal link ics / check / set', () => {
    expect(SysParser.parse(['cal', 'link', 'ics', 'webcal://x/y.ics', '--name', 'Work', '--color', 'teal'])).toMatchObject({ kind: 'cal', sub: 'link', mode: 'ics', target: 'webcal://x/y.ics', name: 'Work', color: 'teal' });
    expect(SysParser.parse(['cal', 'link', 'check', 'https://x/y.ics', '--json'])).toMatchObject({ kind: 'cal', sub: 'link', mode: 'check', json: true });
    expect(SysParser.parse(['cal', 'link', 'set', 'Work', '--hide'])).toMatchObject({ kind: 'cal', sub: 'link', mode: 'set', target: 'Work', on: false });
    expect(SysParser.parse(['cal', 'links', '--json'])).toMatchObject({ kind: 'cal', sub: 'links', json: true });
    expect(SysParser.parse(['cal', 'unlink', 'Work'])).toMatchObject({ kind: 'cal', sub: 'unlink', ref: 'Work' });
    expect(SysParser.parse(['cal', 'sync'])).toMatchObject({ kind: 'cal', sub: 'sync', ref: undefined });
    expect(SysParser.parse(['cal', 'export', '--out', 'a.ics'])).toMatchObject({ kind: 'cal', sub: 'export', out: 'a.ics' });
    expect(SysParser.parse(['cal', 'import', 'a.ics', '--dry-run'])).toMatchObject({ kind: 'cal', sub: 'import', file: 'a.ics', dryRun: true });
  });
  it('the linked layer switches like the others', () => {
    expect(calendarSetLayers({ selectedDate: null, anchorDate: '2026-11-22' }, { linked: false }).layers).toEqual({ recorded: true, habits: true, routines: true, linked: false });
  });
});

describe('through the facade', () => {
  const dir = mkdtempSync(join(tmpdir(), 'krnl-calcli-'));
  const boardPath = join(dir, 'board.json');
  writeFileSync(boardPath, JSON.stringify(seedBoard()));
  const facade = new SysFacade({ boardPath });

  it('links need the app (no calendar service in a headless run)', async () => {
    const res = await facade.run(['cal', 'links']);
    expect(res.ok).toBe(false);
    expect(res.message).toContain('KRNL0 app');
  });

  it('import adds events once; export writes them back out', async () => {
    const file = join(dir, 'semester.ics');
    writeFileSync(file, [
      'BEGIN:VCALENDAR', 'VERSION:2.0',
      'BEGIN:VEVENT', 'UID:exam-77', 'SUMMARY:Exam', 'DTSTART:20991203T080000Z', 'DTEND:20991203T100000Z', 'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n'));
    const dry = await facade.run(['cal', 'import', file, '--dry-run']);
    expect(dry.ok).toBe(true);
    expect(dry.message).toContain('would add 1 events');
    expect((await facade.run(['cal', 'import', file])).ok).toBe(true);
    const board = JSON.parse(readFileSync(boardPath, 'utf8')) as { nodes: Array<{ kind: string; isMother?: boolean; state: { habits?: Array<{ name: string; icsUid?: string; kind?: string }> } }> };
    const habits = board.nodes.find((n) => n.kind === 'habit' && n.isMother)!.state.habits!;
    expect(habits.filter((h) => h.icsUid === 'exam-77')).toHaveLength(1);
    expect(habits.find((h) => h.icsUid === 'exam-77')!.kind).toBe('routine');
    const again = await facade.run(['cal', 'import', file]);
    expect(again.message).toContain('nothing to add');

    const out = join(dir, 'out.ics');
    const exp = await facade.run(['cal', 'export', '--out', out]);
    expect(exp.ok).toBe(true);
    expect(readFileSync(out, 'utf8')).toContain('SUMMARY:Exam');
  });
});
