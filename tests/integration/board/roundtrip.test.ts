import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'fs';
import { join, tmpdir } from 'path';
import { BoardSchema } from '../../../src/shared/schemas/board.schema';
import type { Board } from '../../../src/shared/types';

const TMP = join(tmpdir(), `krnl0-test-board-${Date.now()}.json`);

const EMPTY_BOARD: Board = {
  version: 1,
  schemaVersion: 1,
  savedAt: '2026-05-09T12:00:00.000Z',
  viewport: { x: 0, y: 160, zoom: 1 },
  nodes: [],
  edges: [],
};

function save(board: Board, path: string): void {
  writeFileSync(path, JSON.stringify(board, null, 2), 'utf-8');
}

function load(path: string): Board {
  const raw = readFileSync(path, 'utf-8');
  return BoardSchema.parse(JSON.parse(raw)) as unknown as Board;
}

describe('board.json round-trip', () => {
  beforeEach(() => {
    if (existsSync(TMP)) unlinkSync(TMP);
  });

  afterEach(() => {
    if (existsSync(TMP)) unlinkSync(TMP);
  });

  it('saves and loads an empty board with identical structure', () => {
    save(EMPTY_BOARD, TMP);
    const loaded = load(TMP);

    expect(loaded.version).toBe(1);
    expect(loaded.schemaVersion).toBe(1);
    expect(loaded.nodes).toHaveLength(0);
    expect(loaded.edges).toHaveLength(0);
    expect(loaded.viewport).toEqual(EMPTY_BOARD.viewport);
  });

  it('validates board with Zod — rejects bad version', () => {
    const bad = { ...EMPTY_BOARD, version: 99 };
    writeFileSync(TMP, JSON.stringify(bad), 'utf-8');
    expect(() => load(TMP)).toThrow();
  });

  it('validates board with Zod — rejects missing savedAt', () => {
    const { savedAt: _, ...bad } = EMPTY_BOARD;
    writeFileSync(TMP, JSON.stringify(bad), 'utf-8');
    expect(() => load(TMP)).toThrow();
  });

  it('preserves viewport across save/load', () => {
    const board: Board = { ...EMPTY_BOARD, viewport: { x: 100, y: -50, zoom: 1.5 } };
    save(board, TMP);
    const loaded = load(TMP);
    expect(loaded.viewport).toEqual({ x: 100, y: -50, zoom: 1.5 });
  });
});
