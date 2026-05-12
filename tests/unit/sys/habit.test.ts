// sys habit CLI — round-trip tests against a tmp board.json
// Decision #14: each verb must read, mutate, and persist board state.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  cliAdd,
  cliDone,
  cliStreak,
  cliColor,
  cliRemove,
  cliView,
  cliList,
  type HabitCtx,
} from '../../../src/sys/commands/habit';

let tmpDir = '';
let boardPath = '';
let ctx: HabitCtx;

function readBoard(): {
  nodes: Array<{ id: string; kind: string; isMother?: boolean; state: { habits: Array<{ id: string; name: string; color: string; log: string[] }> }; config: { view?: string } }>;
} {
  return JSON.parse(readFileSync(boardPath, 'utf-8'));
}

function findMother() {
  return readBoard().nodes.find((n) => n.kind === 'habit' && n.isMother === true)!;
}

function seedBoardOnDisk(): void {
  const board = {
    version: 1,
    schemaVersion: 1,
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      {
        id: 'mother-habit',
        kind: 'habit',
        isMother: true,
        position: { x: 0, y: 0 },
        state: { habits: [] },
        config: { weekStartsOn: 'monday', view: 'week' },
      },
    ],
    edges: [],
  };
  writeFileSync(boardPath, JSON.stringify(board), 'utf-8');
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'krnl0-habit-cli-'));
  boardPath = join(tmpDir, 'board.json');
  seedBoardOnDisk();
  ctx = { boardPath };
});

afterEach(() => {
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
});

describe('sys habit add', () => {
  it('adds a habit and persists it', async () => {
    const res = await cliAdd(ctx, 'meditate');
    expect(res.ok).toBe(true);
    const mother = findMother();
    expect(mother.state.habits).toHaveLength(1);
    expect(mother.state.habits[0]!.name).toBe('meditate');
    expect(mother.state.habits[0]!.color).toBe('acid');
  });

  it('refuses empty name', async () => {
    const res = await cliAdd(ctx, undefined);
    expect(res.ok).toBe(false);
  });
});

describe('sys habit done', () => {
  it('marks today done for a named habit', async () => {
    await cliAdd(ctx, 'run');
    const res = await cliDone(ctx, 'run', undefined);
    expect(res.ok).toBe(true);
    const habit = findMother().state.habits[0]!;
    expect(habit.log).toHaveLength(1);
  });

  it('marks a specific past date', async () => {
    await cliAdd(ctx, 'run');
    const res = await cliDone(ctx, 'run', '2025-01-01');
    expect(res.ok).toBe(true);
    expect(findMother().state.habits[0]!.log).toContain('2025-01-01');
  });

  it('toggles off when called twice for same date', async () => {
    await cliAdd(ctx, 'run');
    await cliDone(ctx, 'run', '2025-01-01');
    await cliDone(ctx, 'run', '2025-01-01');
    expect(findMother().state.habits[0]!.log).not.toContain('2025-01-01');
  });

  it('rejects a future date', async () => {
    await cliAdd(ctx, 'run');
    const res = await cliDone(ctx, 'run', '2099-12-31');
    expect(res.ok).toBe(false);
  });

  it('resolves by id', async () => {
    await cliAdd(ctx, 'run');
    const id = findMother().state.habits[0]!.id;
    const res = await cliDone(ctx, id, '2025-01-01');
    expect(res.ok).toBe(true);
  });
});

describe('sys habit color', () => {
  it('updates color', async () => {
    await cliAdd(ctx, 'run');
    const res = await cliColor(ctx, 'run', 'cyan');
    expect(res.ok).toBe(true);
    expect(findMother().state.habits[0]!.color).toBe('cyan');
  });

  it('rejects unknown color', async () => {
    await cliAdd(ctx, 'run');
    const res = await cliColor(ctx, 'run', 'magenta');
    expect(res.ok).toBe(false);
  });
});

describe('sys habit view', () => {
  it('sets view in config', async () => {
    const res = await cliView(ctx, 'month');
    expect(res.ok).toBe(true);
    expect(findMother().config.view).toBe('month');
  });

  it('rejects unknown view', async () => {
    const res = await cliView(ctx, 'decade');
    expect(res.ok).toBe(false);
  });
});

describe('sys habit remove', () => {
  it('removes a habit', async () => {
    await cliAdd(ctx, 'one');
    await cliAdd(ctx, 'two');
    const res = await cliRemove(ctx, 'one');
    expect(res.ok).toBe(true);
    const habits = findMother().state.habits;
    expect(habits).toHaveLength(1);
    expect(habits[0]!.name).toBe('two');
  });

  it('returns error for unknown habit', async () => {
    const res = await cliRemove(ctx, 'ghost');
    expect(res.ok).toBe(false);
  });
});

describe('sys habit streak', () => {
  it('returns streak count', async () => {
    await cliAdd(ctx, 'run');
    const today = new Date().toISOString().slice(0, 10);
    await cliDone(ctx, 'run', today);
    const res = await cliStreak(ctx, 'run');
    expect(res.ok).toBe(true);
    expect((res.data as { streak: number }).streak).toBe(1);
  });
});

describe('sys habit list', () => {
  it('lists all habits with id, color, streak', async () => {
    await cliAdd(ctx, 'one');
    await cliAdd(ctx, 'two');
    const res = await cliList(ctx);
    expect(res.ok).toBe(true);
    const data = res.data as { habits: Array<{ name: string }> };
    expect(data.habits).toHaveLength(2);
  });

  it('reports empty state cleanly', async () => {
    const res = await cliList(ctx);
    expect(res.ok).toBe(true);
    expect((res.data as { habits: unknown[] }).habits).toHaveLength(0);
  });
});

describe('mother-node missing', () => {
  it('all commands return error if mother is absent', async () => {
    // Overwrite with board missing the habit mother.
    writeFileSync(
      boardPath,
      JSON.stringify({ nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }),
      'utf-8',
    );
    expect((await cliAdd(ctx, 'x')).ok).toBe(false);
    expect((await cliList(ctx)).ok).toBe(false);
  });
});
