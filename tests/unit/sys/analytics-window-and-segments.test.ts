/**
 * CLI parity (AGENTS.md rule 8) for this feature:
 *   analytics open | close | toggle   — Decision 32 analytics window visibility
 *   pomo segments [--date] [--json]   — list tracked spans (ids)
 *   pomo delete-segment <id>          — right-click "Delete segment"
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

vi.mock('electron', () => ({
  app: { getName: vi.fn(() => 'krnl0-test') },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
}));

const dir = mkdtempSync(join(tmpdir(), 'krnl0-an-window-'));
const boardPath = join(dir, 'board.json');
process.env['KRNL0_BOARD_DIR'] = dir;

function seed(layoutMode: 'station' | 'canvas' = 'station'): void {
  writeFileSync(boardPath, JSON.stringify({
    version: 1, schemaVersion: 2, layoutMode, viewport: { x: 0, y: 0, zoom: 1 }, edges: [],
    nodes: [
      { id: 'mother-pomo', kind: 'pomo', isMother: true, position: { x: 0, y: 0 }, config: { sessionMin: 25 },
        state: { status: 'idle', startedAt: null, durationMin: 25, breakMin: 5, label: '', sessionsCompleted: 0,
          activeTaskId: null, pausedAt: null, pausedElapsedMs: 0, sessionWorkSec: 0,
          history: [
            { id: 'seg-aaaa1', startedAt: '2026-11-01T09:00:00', endedAt: '2026-11-01T09:30:00', durationMin: 30, label: 'Math', completed: true, taskId: 't-math', kind: 'work' },
            { id: 'seg-bbbb2', startedAt: '2026-11-01T09:30:00', endedAt: '2026-11-01T09:35:00', durationMin: 5, label: '', completed: true, taskId: null, kind: 'break' },
          ] } },
      { id: 'mother-analytics', kind: 'analytics', isMother: true, position: { x: 1960, y: 0 }, state: {}, config: { stationSlot: 'bottom-right-pre' } },
    ],
  }), 'utf-8');
}

const node = (id: string) => JSON.parse(readFileSync(boardPath, 'utf-8')).nodes.find((n: { id: string }) => n.id === id);

let an: typeof import('../../../src/sys/commands/analytics');
let pomo: typeof import('../../../src/sys/commands/pomo');
let Parser: typeof import('../../../src/sys/parser').SysParser;
beforeAll(async () => {
  an = await import('../../../src/sys/commands/analytics');
  pomo = await import('../../../src/sys/commands/pomo');
  Parser = (await import('../../../src/sys/parser')).SysParser;
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('sys analytics open | close | toggle', () => {
  it('open / close write stationHidden and notify the renderer', () => {
    seed();
    const changed = vi.fn();
    expect(an.analyticsWindow({ boardPath, onBoardChanged: changed }, 'open').ok).toBe(true);
    expect(node('mother-analytics').config.stationHidden).toBe(false);
    expect(changed).toHaveBeenCalledTimes(1);
    an.analyticsWindow({ boardPath }, 'close');
    expect(node('mother-analytics').config.stationHidden).toBe(true);
    expect(node('mother-analytics').config.stationSlot).toBe('bottom-right-pre');
  });

  it('toggle starts from the default (shown) and flips', () => {
    seed();
    expect(an.analyticsWindow({ boardPath }, 'toggle').data).toEqual({ shown: false });
    expect(an.analyticsWindow({ boardPath }, 'toggle').data).toEqual({ shown: true });
  });

  it('explains canvas mode, where the window is always in the mother row', () => {
    seed('canvas');
    expect(an.analyticsWindow({ boardPath }, 'open').message).toMatch(/canvas mode/);
  });

  it('parses the verbs without clashing with the read-only "analytics show"', () => {
    expect(Parser.parse(['analytics', 'open'])).toMatchObject({ kind: 'analytics', sub: 'open' });
    expect(Parser.parse(['analytics', 'toggle'])).toMatchObject({ kind: 'analytics', sub: 'toggle' });
    expect(Parser.parse(['analytics', 'show', '--range', '7'])).toMatchObject({ kind: 'analytics', sub: 'show', range: 7 });
  });
});

describe('sys pomo segments / delete-segment', () => {
  it('lists the day\'s spans with ids', () => {
    seed();
    const res = pomo.pomoSegments({ boardPath }, { date: '2026-11-01', json: true });
    expect(res.ok).toBe(true);
    const segs = res.data as Array<{ id: string; kind: string; minutes: number }>;
    expect(segs.map((s) => [s.id, s.kind, s.minutes])).toEqual([['seg-aaaa1', 'work', 30], ['seg-bbbb2', 'break', 5]]);
    expect(pomo.pomoSegments({ boardPath }, { date: '2026-11-02' }).message).toMatch(/no tracked segments/);
    expect(pomo.pomoSegments({ boardPath }, { date: 'tomorrow' }).ok).toBe(false);
  });

  it('deletes a span by id prefix and rejects unknown ids', () => {
    seed();
    expect(pomo.pomoDeleteSegmentCmd({ boardPath }, 'seg-aaaa').ok).toBe(true);
    expect(node('mother-pomo').state.history.map((r: { id: string }) => r.id)).toEqual(['seg-bbbb2']);
    expect(pomo.pomoDeleteSegmentCmd({ boardPath }, 'nope').ok).toBe(false);
    expect(pomo.pomoDeleteSegmentCmd({ boardPath }, undefined).ok).toBe(false);
  });

  it('parses the verbs', () => {
    expect(Parser.parse(['pomo', 'delete-segment', 'seg-1'])).toMatchObject({ kind: 'pomo', sub: 'delete-segment', segmentId: 'seg-1' });
    expect(Parser.parse(['pomo', 'segments', '--date', '2026-11-01', '--json'])).toMatchObject({ kind: 'pomo', sub: 'segments', date: '2026-11-01', json: true });
  });
});
