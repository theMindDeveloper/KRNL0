/** Decision 64 — undo and redo never roll back the other calendars (they are the sync's, not an edit). */
import { describe, it, expect } from 'vitest';
import { useBoardStore } from '../../../src/renderer/store/boardStore';

describe('undo keeps the calendar links', () => {
  it('an undo of a move keeps the events the sync brought in since', () => {
    const node = { id: 'n1', kind: 'text', position: { x: 0, y: 0 }, state: {}, config: {} };
    const board = { version: 1, schemaVersion: 2, savedAt: '2026-11-22T00:00:00.000Z', viewport: { x: 0, y: 0, zoom: 1 }, layoutMode: 'canvas', nodes: [node], edges: [], calendarLinks: [{ id: 'cal-1', name: 'Work', events: [] }] };
    useBoardStore.setState({ board: board as never, history: [], future: [] });
    useBoardStore.getState().updateNode('n1', { position: { x: 50, y: 50 } } as never);
    // The sync writes new events (a reload from disk).
    const synced = { ...useBoardStore.getState().board!, calendarLinks: [{ id: 'cal-1', name: 'Work', events: [{ id: 'e', title: 'Call', start: '2026-11-23T09:00', end: '2026-11-23T09:30' }] }] };
    useBoardStore.setState({ board: synced as never });
    useBoardStore.getState().undo();
    const after = useBoardStore.getState().board as unknown as { nodes: Array<{ position: { x: number } }>; calendarLinks: Array<{ events: unknown[] }> };
    expect(after.nodes[0]!.position.x).toBe(0);
    expect(after.calendarLinks[0]!.events).toHaveLength(1);
    useBoardStore.getState().redo();
    expect((useBoardStore.getState().board as unknown as { calendarLinks: Array<{ events: unknown[] }> }).calendarLinks[0]!.events).toHaveLength(1);
  });
});
