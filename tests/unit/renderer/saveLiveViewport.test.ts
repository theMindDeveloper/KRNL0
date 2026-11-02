// @vitest-environment jsdom
/** A content save must not write the launch-time camera over the live one. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { useBoardStore } from '../../../src/renderer/store/boardStore';
import { saveBoard } from '../../../src/renderer/store/eventLog';
import type { Board } from '../../../src/shared/types';

afterEach(() => { delete (window as unknown as { krnl?: unknown }).krnl; });

describe('saveBoard viewport', () => {
  it('writes the live store viewport, not the one the board was loaded with', async () => {
    const boardSave = vi.fn(async () => undefined);
    (window as unknown as { krnl: unknown }).krnl = { boardSave };
    const board = { version: 1, savedAt: '', viewport: { x: 0, y: 0, zoom: 1 }, nodes: [], edges: [] } as unknown as Board;
    useBoardStore.getState().setBoard(board);
    useBoardStore.getState().setViewport({ x: 120, y: -40, zoom: 1.5 });
    await saveBoard(useBoardStore.getState().board);
    expect((boardSave.mock.calls[0]![0] as unknown as Board).viewport).toEqual({ x: 120, y: -40, zoom: 1.5 });
  });
});
