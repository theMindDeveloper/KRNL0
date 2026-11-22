/**
 * Bug hunt (2026-11-22): `krnl event add` and the event card took dates that
 * do not exist, ignored --days next to --on, and dropped a length over 8 h.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { habitAdd } from '../../../src/renderer/components/nodes/HabitNode/commands';

const env = { uuid: () => 'h-1', now: () => '2026-11-22T08:00:00.000Z', today: () => '2026-11-22' };

describe('adding an event checks its date and keeps its length', () => {
  it('a date that does not exist adds nothing (it used to become a weekly event)', () => {
    const st = { habits: [] };
    expect(habitAdd(st, { name: 'Exam', kind: 'routine', schedule: { kind: 'weekly', days: [1], timeOfDay: '09:00' }, on: '2026-02-30' }, env)).toBe(st);
    expect(habitAdd(st, { name: 'Exam', kind: 'routine', schedule: { kind: 'weekly', days: [1], timeOfDay: '09:00' }, on: '2026-13-45' }, env)).toBe(st);
  });
  it('a 10-hour event keeps its length (it was cut to the 60-minute default above 8 h)', () => {
    const out = habitAdd({ habits: [] }, { name: 'Shift', kind: 'routine', schedule: { kind: 'weekly', days: [2], timeOfDay: '08:00', durationMin: 600 }, on: '2026-12-01' }, env);
    expect(out.habits[0]!.schedule).toMatchObject({ durationMin: 600, days: [2] });
    expect(out.habits[0]).toMatchObject({ startsOn: '2026-12-01', endsOn: '2026-12-01' });
  });
});

describe('krnl event add', () => {
  let tmp = '';
  beforeEach(async () => {
    tmp = mkdtempSync(join(tmpdir(), 'krnl0-event-add-'));
    process.env.KRNL0_BOARD_DIR = tmp;
    const { seedBoard, migrateBoard } = await import('../../../src/shared/boardMigrate');
    writeFileSync(join(tmp, 'board.json'), JSON.stringify(migrateBoard(seedBoard())));
    vi.resetModules();
  });
  afterEach(() => { delete process.env.KRNL0_BOARD_DIR; rmSync(tmp, { recursive: true, force: true }); });
  const events = () => (JSON.parse(readFileSync(join(tmp, 'board.json'), 'utf-8')) as { nodes: Array<{ kind: string; state: { habits?: Array<Record<string, unknown>> } }> })
    .nodes.filter((n) => n.kind === 'habit').flatMap((n) => n.state.habits ?? []);

  it('refuses dates that do not exist, and --days with --on', async () => {
    const { SysFacade } = await import('../../../src/sys/SysFacade');
    const sys = new SysFacade();
    expect((await sys.run(['event', 'add', 'Exam', '--on', '2026-13-45', '--at', '09:00'])).ok).toBe(false);
    expect((await sys.run(['event', 'add', 'Exam', '--on', '2026-02-30', '--at', '09:00'])).ok).toBe(false);
    const both = await sys.run(['event', 'add', 'Class', '--days', 'mon', '--on', '2026-12-01', '--at', '10:00']);
    expect(both.ok).toBe(false);
    expect(both.message).toMatch(/--days.*--on/);
    expect(events()).toHaveLength(0);
  });

  it('keeps a long length', async () => {
    const { SysFacade } = await import('../../../src/sys/SysFacade');
    const r = await new SysFacade().run(['event', 'add', 'Night shift', '--on', '2026-12-01', '--at', '22:00', '--for', '600']);
    expect(r.ok).toBe(true);
    expect(events()[0]!['schedule']).toMatchObject({ timeOfDay: '22:00', durationMin: 600 });
  });
});
