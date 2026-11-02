// @vitest-environment jsdom
/**
 * useCliDispatch — renderer-coupled CLI commands (undo/redo, node move, term.*).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';
import { useCliDispatch } from '../../../src/renderer/store/useCliDispatch';
import { useBoardStore } from '../../../src/renderer/store/boardStore';
import type { Board, Node } from '../../../src/shared/types';
import { TERM_CLEAR_EVENT } from '../../../src/renderer/components/nodes/TerminalNode/constants';

type Handler = (id: string, command: string, args: Record<string, unknown>) => void;

let handler: Handler | null = null;
const reply = vi.fn();
const boardSave = vi.fn(async () => undefined);

function board(nodes: Node[]): Board {
  return { version: 1, savedAt: '', viewport: { x: 0, y: 0, zoom: 1 }, nodes, edges: [] } as unknown as Board;
}

const term: Node = {
  id: 'mother-term', kind: 'term', isMother: true, position: { x: 0, y: 0 },
  state: { sessionId: null, title: 'Terminal' }, config: { shell: 'default', fontSize: 13 },
} as unknown as Node;
const note: Node = {
  id: 'node-1700000000000-abcdef', kind: 'text', isMother: false, position: { x: 10, y: 10 },
  state: { text: 'hi' }, config: {},
} as unknown as Node;

function run(command: string, args: Record<string, unknown> = {}): { ok: boolean; message: string } {
  reply.mockClear();
  handler!('req', command, args);
  const [, ok, message] = reply.mock.calls[0] as [string, boolean, string];
  return { ok, message };
}

beforeEach(() => {
  handler = null;
  boardSave.mockClear();
  (window as unknown as { krnl: unknown }).krnl = {
    onCliDispatch: (cb: Handler) => { handler = cb; return () => { handler = null; }; },
    cliDispatchReply: reply,
    boardSave,
  };
  useBoardStore.getState().setBoard(board([term, note]));
  renderHook(() => useCliDispatch());
});

afterEach(() => {
  cleanup();
  delete (window as unknown as { krnl?: unknown }).krnl;
});

describe('undo / redo from the CLI', () => {
  it('persists the undone board, like Ctrl+Z does', () => {
    useBoardStore.getState().updateNode(note.id, { position: { x: 99, y: 99 } });
    boardSave.mockClear();
    expect(run('undo').ok).toBe(true);
    expect(boardSave).toHaveBeenCalledTimes(1);
    const saved = boardSave.mock.calls[0]![0] as unknown as Board;
    expect(saved.nodes.find((n) => n.id === note.id)?.position).toEqual({ x: 10, y: 10 });
  });

  it('says so when there is nothing to undo, and writes nothing', () => {
    expect(run('undo').message).toBe('Nothing to undo');
    expect(boardSave).not.toHaveBeenCalled();
  });
});

describe('node move', () => {
  it('accepts an id prefix like every other ref', () => {
    const res = run('node.move', { id: 'node-1700000000000-ab', x: 5, y: 6 });
    expect(res.ok).toBe(true);
    expect(useBoardStore.getState().board!.nodes.find((n) => n.id === note.id)?.position).toEqual({ x: 5, y: 6 });
  });

  it('refuses to move a fixed mother node', () => {
    const res = run('node.move', { id: 'mother-term', x: 5, y: 6 });
    expect(res.ok).toBe(false);
    expect(useBoardStore.getState().board!.nodes.find((n) => n.id === term.id)?.position).toEqual({ x: 0, y: 0 });
  });
});

describe('term commands', () => {
  const termNode = () => useBoardStore.getState().board!.nodes.find((n) => n.kind === 'term')!;

  it('setTitle writes the title onto the terminal', () => {
    expect(run('term.setTitle', { title: 'build log' }).ok).toBe(true);
    expect((termNode().state as { title: string }).title).toBe('build log');
  });

  it('setFontSize validates and writes the config', () => {
    expect(run('term.setFontSize', { fontSize: 2 }).ok).toBe(false);
    expect(run('term.setFontSize', { fontSize: 16 }).ok).toBe(true);
    expect((termNode().config as { fontSize: number }).fontSize).toBe(16);
  });

  it('clear fires the terminal clear event', () => {
    const seen = vi.fn();
    window.addEventListener(TERM_CLEAR_EVENT, seen);
    expect(run('term.clear').ok).toBe(true);
    window.removeEventListener(TERM_CLEAR_EVENT, seen);
    expect(seen).toHaveBeenCalledTimes(1);
  });
});
