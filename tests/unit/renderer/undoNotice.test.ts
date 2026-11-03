// @vitest-environment jsdom
/** "Deleted … · UNDO" takes back exactly the delete, and only while it is safe. */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useBoardStore } from '../../../src/renderer/store/boardStore';
import { undoable, undoNoticed, useUndoNotice } from '../../../src/renderer/store/undoNotice';
import type { Board, Node } from '../../../src/shared/types';

vi.mock('../../../src/renderer/store/eventLog', async (orig) => ({
  ...(await orig<typeof import('../../../src/renderer/store/eventLog')>()),
  saveBoard: vi.fn(async () => undefined),
}));

const note = (id: string): Node => ({ id, kind: 'text', isMother: false, position: { x: 0, y: 0 }, state: { text: id }, config: {} } as unknown as Node);
const ids = () => useBoardStore.getState().board!.nodes.map((n) => n.id);

beforeEach(() => {
  useBoardStore.getState().setBoard({ version: 1, savedAt: '', viewport: { x: 0, y: 0, zoom: 1 }, nodes: [note('a'), note('b'), note('c')], edges: [] } as unknown as Board);
  useUndoNotice.setState({ notice: null });
});

describe('undo notice', () => {
  it('a delete of several steps comes back in one UNDO', () => {
    undoable('Deleted 2 items', () => {
      useBoardStore.getState().removeNode('a');
      useBoardStore.getState().removeNode('b');
    });
    expect(useUndoNotice.getState().notice?.label).toBe('Deleted 2 items');
    expect(ids()).toEqual(['c']);
    expect(undoNoticed()).toBe(true);
    expect(ids()).toEqual(['a', 'b', 'c']);
  });

  it('refuses once something else changed the board', () => {
    undoable('Deleted 1 item', () => useBoardStore.getState().removeNode('a'));
    useBoardStore.getState().removeNode('b');
    expect(undoNoticed()).toBe(false);
    expect(ids()).toEqual(['c']);
  });

  it('shows nothing when the action changed nothing', () => {
    undoable('Deleted 0 items', () => undefined);
    expect(useUndoNotice.getState().notice).toBeNull();
  });
});
