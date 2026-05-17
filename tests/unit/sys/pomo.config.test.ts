// Decision 29 §2 — pomo config command
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { pomoConfig } from '../../../src/sys/commands/pomo';

// pomo.ts uses boardIo.ts which reads BOARD_PATH from env
let tmpDir = '';
let boardPath = '';

function readBoard() {
  return JSON.parse(readFileSync(boardPath, 'utf-8'));
}

function getPomoConfig() {
  const board = readBoard();
  const node = board.nodes.find((n: { kind: string; isMother?: boolean }) => n.kind === 'pomo' && n.isMother);
  return node?.config ?? {};
}

function seedBoard(): void {
  const board = {
    version: 1,
    schemaVersion: 1,
    nodes: [
      {
        id: 'mother-pomo',
        kind: 'pomo',
        isMother: true,
        position: { x: -1400, y: 0 },
        state: {
          status: 'idle', startedAt: null, durationMin: 25, breakMin: 5,
          label: '', sessionsCompleted: 0, activeTaskId: null, history: [], pausedAt: null, pausedElapsedMs: 0,
        },
        config: { sessionMin: 25, shortBreakMin: 5, longBreakMin: 15, longBreakEvery: 4 },
      },
    ],
    edges: [],
  };
  writeFileSync(boardPath, JSON.stringify(board), 'utf-8');
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'krnl0-pomo-cfg-'));
  boardPath = join(tmpDir, 'board.json');
  seedBoard();
  // Point boardIo at our temp board
  process.env['KRNL0_BOARD_PATH'] = boardPath;
});

afterEach(() => {
  delete process.env['KRNL0_BOARD_PATH'];
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
});

describe('pomo config', () => {
  it('shows current config when no flags provided', () => {
    const res = pomoConfig({});
    expect(res.ok).toBe(true);
    const data = JSON.parse(res.message ?? '{}');
    expect(data.sessionMin).toBe(25);
    expect(data.shortBreakMin).toBe(5);
  });

  it('updates sessionMin', () => {
    const res = pomoConfig({ session: 50 });
    expect(res.ok).toBe(true);
    expect(getPomoConfig().sessionMin).toBe(50);
  });

  it('updates shortBreakMin', () => {
    pomoConfig({ short: 10 });
    expect(getPomoConfig().shortBreakMin).toBe(10);
  });

  it('updates longBreakMin', () => {
    pomoConfig({ long: 20 });
    expect(getPomoConfig().longBreakMin).toBe(20);
  });

  it('updates longBreakEvery', () => {
    pomoConfig({ every: 6 });
    expect(getPomoConfig().longBreakEvery).toBe(6);
  });

  it('updates face', () => {
    pomoConfig({ face: 'lcd' });
    expect(getPomoConfig().face).toBe('lcd');
  });

  it('updates multiple fields at once', () => {
    pomoConfig({ session: 30, short: 8, long: 20, every: 3, face: 'ascii' });
    const cfg = getPomoConfig();
    expect(cfg.sessionMin).toBe(30);
    expect(cfg.shortBreakMin).toBe(8);
    expect(cfg.longBreakMin).toBe(20);
    expect(cfg.longBreakEvery).toBe(3);
    expect(cfg.face).toBe('ascii');
  });

  it('rejects invalid face', () => {
    const res = pomoConfig({ face: 'neon' });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/invalid.*face/i);
  });

  it('persists to board.json', () => {
    pomoConfig({ session: 45 });
    const cfg = getPomoConfig();
    expect(cfg.sessionMin).toBe(45);
  });
});
