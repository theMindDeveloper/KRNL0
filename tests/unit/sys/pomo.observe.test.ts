/** Observe mode — `pomo config --mode`, free-text + tag spans, and where they show up. */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { pomoBreak, pomoDropBlips, pomoResume, pomoRetagSegment, pomoSetConfig, pomoSetLiveLabel, pomoSetTag, pomoStart, pomoStop } from '../../../src/renderer/components/nodes/PomoNode/commands';
import { defaultPomoState } from '../../../src/renderer/components/nodes/PomoNode/types';
import type { PomoState } from '../../../src/renderer/components/nodes/PomoNode/types';
import { selectPomoReality } from '../../../src/renderer/store/pomoReality';
import { computeTagBreakdown } from '../../../src/renderer/analytics/tags';
import { SysParser } from '../../../src/sys/parser';
import type { Board } from '../../../src/shared/types';

vi.mock('electron', () => ({
  app: { getName: vi.fn(() => 'krnl0-test') },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
}));

const dir = mkdtempSync(join(tmpdir(), 'krnl0-pomo-observe-'));
const boardPath = join(dir, 'board.json');
process.env['KRNL0_BOARD_DIR'] = dir;

const SEG = { id: 'seg-1234', startedAt: '2026-11-01T09:00:00.000Z', endedAt: '2026-11-01T09:30:00.000Z',
  durationMin: 30, label: '', completed: false, taskId: null, kind: 'work' as const };

function seed(): void {
  writeFileSync(boardPath, JSON.stringify({
    version: 1, schemaVersion: 2, viewport: { x: 0, y: 0, zoom: 1 }, edges: [],
    nodes: [
      { id: 'mother-pomo', kind: 'pomo', isMother: true, position: { x: 0, y: 0 }, config: { sessionMin: 25 },
        state: { ...defaultPomoState(), history: [SEG] } },
    ],
  }), 'utf-8');
}
const pomoNode = () => JSON.parse(readFileSync(boardPath, 'utf-8')).nodes[0];

let mod: typeof import('../../../src/sys/commands/pomo');
beforeAll(async () => { mod = await import('../../../src/sys/commands/pomo'); });
afterAll(() => {
  delete process.env['KRNL0_BOARD_PATH'];
  rmSync(dir, { recursive: true, force: true });
});

describe('observe mode — FSM', () => {
  it('setConfig stores a valid mode and ignores junk', () => {
    const cfg = pomoSetConfig(null, { config: { mode: 'observe' } });
    expect(cfg.mode).toBe('observe');
    expect(pomoSetConfig(cfg, { config: { mode: 'nope' as never } }).mode).toBe('observe');
  });

  it('retag stores free text + tag on a span; a task clears the tag', () => {
    const s: PomoState = { ...defaultPomoState(), history: [SEG] };
    const free = pomoRetagSegment(s, { id: SEG.id, taskId: null, label: ' emails ', tag: 'admin' });
    expect(free.history[0]).toMatchObject({ taskId: null, label: 'emails', tag: 'admin' });
    const task = pomoRetagSegment(free, { id: SEG.id, taskId: 't1', label: 'Study' });
    expect(task.history[0]!.tag).toBeUndefined();
    expect(task.history[0]!.taskId).toBe('t1');
    const cleared = pomoRetagSegment(free, { id: SEG.id, taskId: null });
    expect(cleared.history[0]).toMatchObject({ label: '' });
    expect(cleared.history[0]!.tag).toBeUndefined();
  });
});

describe('observe mode — breaks and misclicks', () => {
  let t = 0;
  let n = 0;
  const env = { now: () => t, uuid: () => `id-${++n}` };

  it('work → break → back to work → stop records work, break, work', () => {
    t = Date.parse('2026-11-02T09:00:00Z');
    let s = pomoStart(defaultPomoState(), { durationMin: 24 * 60 }, env);
    t += 20 * 60_000; s = pomoBreak(s, {}, env);
    t += 5 * 60_000; s = pomoResume(s, {}, env);
    expect(s.status).toBe('running');
    t += 10 * 60_000; s = pomoStop(s, {}, env);
    expect(s.history.map((r) => [r.kind, r.durationMin])).toEqual([['work', 20], ['break', 5], ['work', 10]]);
    // A day-long session length means no span ever counts as a finished pomodoro.
    expect(s.sessionsCompleted).toBe(0);
  });

  it('a named span carries over: break → back to work → stop records the same name and tag', () => {
    t = Date.parse('2026-11-02T11:00:00Z');
    let s = pomoSetLiveLabel(defaultPomoState(), { label: ' emails ', tag: 'admin' });
    s = pomoStart(s, { durationMin: 24 * 60 }, env);
    t += 15 * 60_000; s = pomoBreak(s, {}, env);
    t += 5 * 60_000; s = pomoResume(s, {}, env);
    t += 10 * 60_000; s = pomoStop(s, {}, env);
    const work = s.history.filter((r) => r.kind === 'work');
    expect(work.map((r) => [r.label, r.tag])).toEqual([['emails', 'admin'], ['emails', 'admin']]);
    // Linking a task (or clearing) drops the free-text tag.
    expect(pomoSetTag(s, { taskId: null }).tag).toBeNull();
    expect(pomoSetTag(s, { taskId: null }).label).toBe('');
  });

  it('drops spans under 10 s that a stop just added, keeps older ones', () => {
    t = Date.parse('2026-11-02T10:00:00Z');
    const running = pomoStart({ ...defaultPomoState(), history: [SEG] }, {}, env);
    t += 3_000;
    const stopped = pomoDropBlips(running, pomoStop(running, {}, env));
    expect(stopped.history).toEqual([SEG]);
    t += 60_000;
    const longer = pomoStop(running, {}, env);
    expect(pomoDropBlips(running, longer).history).toHaveLength(2);
  });
});

describe('observe mode — reality + analytics', () => {
  const board = {
    nodes: [{ id: 'p', kind: 'pomo', isMother: true, position: { x: 0, y: 0 }, config: {},
      state: { ...defaultPomoState(), history: [{ ...SEG, label: 'emails', tag: 'admin' }] } }],
    edges: [], completions: [],
  } as unknown as Board;

  it('reality segments carry the span tag', () => {
    expect(selectPomoReality(board, Date.parse('2026-11-02T00:00:00Z'))[0]!.tag).toBe('admin');
  });

  it('free-text spans count toward Time-by-tag', () => {
    const r = computeTagBreakdown(board, { start: '2026-10-30', end: '2026-11-02' }, Date.parse('2026-11-02T00:00:00Z'));
    expect(r.tags.find((t) => t.id === 'admin')?.minutes).toBe(30);
    expect(r.totalMin).toBe(30);
  });
});

describe('observe mode — CLI', () => {
  it('parses --mode and retag --text/--tag', () => {
    expect(SysParser.parse('pomo config --mode observe'.split(' '))).toMatchObject({ sub: 'config', mode: 'observe' });
    expect(SysParser.parse('pomo retag seg-12 --text emails --tag admin'.split(' '))).toMatchObject({ sub: 'retag', segmentId: 'seg-12', ref: undefined, text: 'emails', tag: 'admin' });
  });

  it('pomo retag --text labels a span and classifies or uses the given tag', () => {
    seed();
    expect(mod.pomoRetag({ boardPath }, 'seg-12', undefined, { text: 'reply to emails', tag: 'admin' }).ok).toBe(true);
    expect(pomoNode().state.history[0]).toMatchObject({ label: 'reply to emails', tag: 'admin', taskId: null });
    expect(mod.pomoRetag({ boardPath }, 'seg-12', undefined, { text: 'x', tag: 'no-such-tag' }).ok).toBe(false);
  });

  it('pomo config --mode observe persists; bad mode is rejected', () => {
    seed();
    process.env['KRNL0_BOARD_PATH'] = boardPath;
    expect(mod.pomoConfig({ mode: 'observe' }).ok).toBe(true);
    expect(pomoNode().config.mode).toBe('observe');
    expect(mod.pomoConfig({ mode: 'zen' }).ok).toBe(false);
  });
});
