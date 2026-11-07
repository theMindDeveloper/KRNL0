/** `krnl cal lineup` (calendar-clock-visuals.md F28) against a real board file — the CLI twin of the shelf's Line up button. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { calLineup } from '../../../src/sys/commands/cal';
import { SysParser } from '../../../src/sys/parser';
import { CLI_REGISTRY } from '../../../src/shared/cli/commandRegistry';
import { selectSchedule } from '../../../src/renderer/store/scheduleSelector';
import type { Board } from '../../../src/shared/types';

let dir = '';
let boardPath = '';

function task(id: string, text: string, scheduledFor: string | null, plannedMin: number, done = false) {
  return {
    id, kind: 'todo.task', isMother: false, position: { x: 0, y: 0 }, config: { showDuration: true },
    state: {
      text, done, ...(scheduledFor ? { scheduledFor } : {}), durationMin: plannedMin, eta: '', sequenceNumber: 1, layer: 0,
      createdAt: '2026-11-01T00:00:00.000Z', parentTodoId: 'mother-todo', parentTaskId: null, todoItemId: null,
      pomoSessionsCompleted: 0, plannedMin, secondsAccumulated: 0, currentSessionElapsedSec: 0, kind: 'event',
    },
  };
}

function seed(nodes: unknown[], edges: unknown[] = []) {
  writeFileSync(boardPath, JSON.stringify({ version: 1, schemaVersion: 2, viewport: { x: 0, y: 0, zoom: 1 }, nodes, edges }), 'utf-8');
}
const placements = () => selectSchedule(JSON.parse(readFileSync(boardPath, 'utf-8')) as Board).placements;
const NOW = new Date('2099-01-05T08:00').getTime();

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'krnl0-lineup-'));
  boardPath = join(dir, 'board.json');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('krnl cal lineup', () => {
  it('parses, and is listed in the CLI help', () => {
    expect(SysParser.parse(['cal', 'lineup', 'email', 'rent', '--json'])).toMatchObject({ kind: 'cal', sub: 'lineup', refs: ['email', 'rent'], json: true });
    const cal = CLI_REGISTRY.find((g) => g.group === 'cal');
    expect(cal?.subcommands.some((s) => s.name === 'lineup')).toBe(true);
  });

  it('puts clashing plans one after another and saves the board', async () => {
    seed([
      task('t-email', 'Email', '2099-01-05T14:00', 20),
      task('t-rent', 'Pay rent', '2099-01-05T14:00', 20),
      task('t-plan', 'Plan week', '2099-01-05T14:00', 30),
    ]);
    const changed = vi.fn();
    const res = await calLineup({ boardPath, onBoardChanged: changed }, ['Email', 'Pay rent', 'Plan week'], false, NOW);
    expect(res.ok).toBe(true);
    const p = placements();
    // Same start and length: id order — t-email, t-rent (20m each), then t-plan (30m).
    expect(p.get('t-email')!.startISO).toBe('2099-01-05T14:00');
    expect(p.get('t-rent')!.startISO).toBe('2099-01-05T14:20');
    expect(p.get('t-plan')!.startISO).toBe('2099-01-05T14:40');
    expect(changed).toHaveBeenCalledTimes(1);
    // Running it again changes nothing.
    expect((await calLineup({ boardPath }, ['t-email', 't-rent', 't-plan'], false, NOW)).message).toBe('Already lined up.');
  });

  it('a chain moves as one: its follower comes along behind its anchor', async () => {
    seed([
      task('t-anchor', 'Outline', '2099-01-05T09:00', 30),
      task('t-follow', 'Draft', null, 30),
      task('t-other', 'Call', '2099-01-05T09:00', 60),
    ], [{ id: 'e1', from: { nodeId: 't-anchor', event: 'task.next' }, to: { nodeId: 't-follow', command: 'task.activate' }, enabled: true }]);
    const res = await calLineup({ boardPath }, ['t-follow', 't-other'], false, NOW);
    expect(res.ok).toBe(true);
    const p = placements();
    // The Outline→Draft chain (60m) and Call (60m) tie on start and length: id order.
    expect(p.get('t-anchor')!.startISO).toBe('2099-01-05T09:00');
    expect(p.get('t-follow')!.startISO).toBe('2099-01-05T09:30');
    expect(p.get('t-other')!.startISO).toBe('2099-01-05T10:00');
  });

  it('done plans stay; unknown or unscheduled refs are an error', async () => {
    seed([
      task('t-a', 'A', '2099-01-05T10:00', 30),
      task('t-b', 'B', '2099-01-05T10:00', 30, true),
      task('t-c', 'C', null, 30),
    ]);
    expect((await calLineup({ boardPath }, ['t-a', 't-b'], false, NOW)).message).toBe('Already lined up.');
    expect((await calLineup({ boardPath }, ['t-a'], false, NOW)).ok).toBe(false);
    expect((await calLineup({ boardPath }, ['t-a', 'nope'], false, NOW)).ok).toBe(false);
    expect((await calLineup({ boardPath }, ['t-a', 't-c'], false, NOW)).ok).toBe(false);
  });
});
