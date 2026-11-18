/**
 * UX review picks (2026-11-18): task-node F21/F22, engagement F20, canvases F9.
 * - planActions: "Done on <day>" backdates, Won't do drops without deleting,
 *   Archive takes one done card off the board.
 * - finishedCards: an archived card leaves even in an unfinished chain; a
 *   card held only by its chain is reported with the task that holds it.
 * - CanvasSwitcher: what is on each canvas, in words.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useBoardStore } from '../../../src/renderer/store/boardStore';
import { archiveDoneTask, doneLabel, markDoneAsPlanned, wontDoTask } from '../../../src/renderer/store/planActions';
import { finishedTaskIds, waitingOnChain } from '../../../src/renderer/store/finishedCards';
import { canvasContents } from '../../../src/renderer/components/TopBar/CanvasSwitcher';

type Loose = Record<string, unknown>;

const task = (id: string, extra: Loose = {}) => ({
  id, kind: 'todo.task', isMother: false, position: { x: 0, y: 0 }, config: {},
  state: { text: id, done: false, kind: 'event', plannedMin: 120, parentTodoId: 'todo', parentTaskId: null, todoItemId: `it-${id}`, ...extra },
});
const todo = (items: Loose[]) => ({ id: 'todo', kind: 'todo', isMother: true, position: { x: 0, y: 0 }, config: {}, state: { items } });
const item = (id: string, extra: Loose = {}) => ({ id: `it-${id}`, text: id, done: false, createdAt: '2026-11-10T00:00:00.000Z', completedAt: null, taskNodeId: id, ...extra });
const edge = (a: string, b: string) => ({ id: `e-${a}-${b}`, from: { nodeId: a, event: 'task.next' }, to: { nodeId: b, command: 'task.activate' }, enabled: true });

const stateOf = (id: string) => useBoardStore.getState().board!.nodes.find((n) => n.id === id)!.state as Loose;

describe('doneLabel (task-node F21)', () => {
  const now = new Date('2026-11-18T12:00').getTime();
  it('names the day for an earlier day, the time for earlier today, else "Mark done"', () => {
    expect(doneLabel(new Date('2026-11-16T16:00').getTime(), now)).toBe('Done on Mon 16');
    expect(doneLabel(new Date('2026-11-18T09:30').getTime(), now)).toBe('Done at 09:30');
    expect(doneLabel(null, now)).toBe('Mark done');
  });
});

describe('plan actions on the board', () => {
  beforeEach(async () => {
    await import('../../../src/renderer/components/Canvas/commandDispatch');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-18T08:00'));
  });
  afterEach(() => { vi.useRealTimers(); });

  it('F21 — Done on its day: completedAt is the end of the block', async () => {
    useBoardStore.setState({ board: { nodes: [todo([item('quiz')]), task('quiz', { scheduledFor: '2026-11-16T14:00' })], edges: [] } as never });
    await markDoneAsPlanned('quiz');
    expect(stateOf('quiz')['done']).toBe(true);
    expect(stateOf('quiz')['completedAt']).toBe(new Date('2026-11-16T16:00').toISOString());
  });

  it("F21 — Won't do drops the Todo row, unplans the task, keeps the card", async () => {
    useBoardStore.setState({ board: { nodes: [todo([item('quiz')]), task('quiz', { scheduledFor: '2026-11-16T14:00' })], edges: [] } as never });
    expect(wontDoTask('quiz')).toBe(true);
    await vi.waitFor(() => expect(stateOf('quiz')['scheduledFor']).toBeUndefined(), { timeout: 5000 });
    const items = stateOf('todo')['items'] as Array<Loose>;
    expect(items[0]!['droppedAt']).toBeTruthy();
    expect(useBoardStore.getState().board!.nodes.some((n) => n.id === 'quiz')).toBe(true);
  }, 20_000);

  it('F22 — Archive takes one done card of an unfinished chain off the board, mirrored to its row', () => {
    useBoardStore.setState({
      board: {
        nodes: [todo([item('a', { done: true }), item('b')]), task('a', { done: true, completedAt: '2026-11-17T10:00:00.000Z' }), task('b')],
        edges: [edge('a', 'b')],
      } as never,
    });
    const board = () => useBoardStore.getState().board!;
    expect(finishedTaskIds(board(), 'overnight', Date.now()).has('a')).toBe(false);
    archiveDoneTask('a');
    expect(typeof stateOf('a')['archivedAt']).toBe('string');
    expect(((stateOf('todo')['items'] as Array<Loose>)[0]!)['archivedAt']).toBe(stateOf('a')['archivedAt']);
    const hidden = finishedTaskIds(board(), 'keep', Date.now());
    expect(hidden.has('a')).toBe(true);
    expect(hidden.has('b')).toBe(false);
  });

  it('F22 — an open task cannot be archived', () => {
    useBoardStore.setState({ board: { nodes: [todo([item('b')]), task('b')], edges: [] } as never });
    archiveDoneTask('b');
    expect(stateOf('b')['archivedAt']).toBeUndefined();
  });
});

describe('waitingOnChain (engagement F20)', () => {
  const now = new Date('2026-11-18T08:00').getTime();
  const board = {
    nodes: [task('a', { done: true, completedAt: '2026-11-16T10:00:00.000Z' }), task('b'), task('solo', { done: true, completedAt: '2026-11-18T07:00:00.000Z' })],
    edges: [edge('a', 'b')],
  } as never;

  it('reports a done card that would have left, held by an open task of its chain', () => {
    expect(waitingOnChain(board, 'overnight', now).get('a')).toBe('b');
  });
  it('says nothing for a card that has not reached its time yet, or under "keep"', () => {
    expect(waitingOnChain(board, 'overnight', now).has('solo')).toBe(false);
    expect(waitingOnChain(board, 'keep', now).size).toBe(0);
  });
});

describe('canvasContents (canvases F9)', () => {
  it('counts notes and images per canvas; shared nodes never count', () => {
    const board = {
      nodes: [
        { id: 't1', kind: 'text', canvasId: 'c1' }, { id: 't2', kind: 'text', canvasId: 'c1' },
        { id: 'i1', kind: 'image', canvasId: 'c1' },
        { id: 'todo', kind: 'todo', isMother: true }, { id: 'x', kind: 'todo.task' },
      ],
      drawings: [{ canvasId: 'c2' }],
    } as never;
    const out = canvasContents(board, ['c1', 'c2', 'c3'], 'c1');
    expect(out['c1']).toBe('2 notes, 1 image');
    expect(out['c2']).toBe('drawing');
    expect(out['c3']).toBe('empty');
  });
});
