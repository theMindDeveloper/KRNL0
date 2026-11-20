/**
 * Separate boards (Decision 49, docs/06-requirements/boards.md).
 * Storage: the open board keeps board.json and timelog/ where they always
 * were; every other board is parked in boards/<id>/ and swapped in on switch.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { seedBoard } from '../../../src/main/persistence/board';
import {
  ackBoardsNotice, createBoard, deleteBoard, listBoards, readBoardsIndex, renameBoard, switchBoard,
} from '../../../src/main/persistence/boards';

type Raw = { nodes: Array<Record<string, unknown>>; edges: Array<Record<string, unknown>>; [k: string]: unknown };

let dir = '';
const boardPath = () => join(dir, 'board.json');
const read = (p = boardPath()): Raw => JSON.parse(readFileSync(p, 'utf8')) as Raw;
const write = (b: unknown, p = boardPath()) => writeFileSync(p, JSON.stringify(b, null, 2));
const mother = (b: Raw, kind: string) => b.nodes.find((n) => n.kind === kind && n.isMother === true)!;

/** A board with three todo items (one done), two habits and a note. */
function seeded(): Raw {
  const b = seedBoard() as unknown as Raw;
  (mother(b, 'todo').state as Record<string, unknown>).items = [
    { id: 'i1', text: 'Read', done: false }, { id: 'i2', text: 'Write', done: false }, { id: 'i3', text: 'Old', done: true },
  ];
  (mother(b, 'habit').state as Record<string, unknown>).habits = [
    { id: 'h1', name: 'Run', log: ['2026-11-01', '2026-11-02'] }, { id: 'h2', name: 'Read', log: ['2026-11-02'] },
  ];
  b.nodes.push({ id: 'note-main', kind: 'text', position: { x: 0, y: 0 }, canvasId: 'canvas-main', state: { text: 'main note' } });
  return b;
}

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'krnl-boards-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('F1 — the list of boards', () => {
  it('a board with one canvas becomes one board, with no notice and no change to board.json', () => {
    const before = seeded();
    write(before);
    const index = readBoardsIndex(dir);
    expect(index.boards).toEqual([{ id: 'canvas-main', name: 'Main' }]);
    expect(index.activeId).toBe('canvas-main');
    expect(index.notice ?? null).toBeNull();
    expect(read()).toEqual(before);
  });

  it('lists each board with its open plans and habits', () => {
    write(seeded());
    createBoard(dir, 'Uni');
    const list = listBoards(dir);
    expect(list.boards.map((b) => [b.name, b.active, b.plans, b.habits])).toEqual([['Main', true, 2, 2], ['Uni', false, 0, 0]]);
  });
});

describe('F2 — a new board', () => {
  it('starts empty: its own lists, nothing from the open board', () => {
    write(seeded());
    const res = createBoard(dir, 'Uni');
    expect(typeof res).toBe('object');
    const id = (res as { id: string }).id;
    const parked = read(join(dir, 'boards', id, 'board.json'));
    expect((mother(parked, 'todo').state as { items?: unknown[] }).items ?? []).toHaveLength(0);
    expect((mother(parked, 'habit').state as { habits?: unknown[] }).habits ?? []).toHaveLength(0);
    expect(parked.nodes.some((n) => n.id === 'note-main')).toBe(false);
  });

  it('"copy my habits" brings the habits with their history at zero; plans are not copied', () => {
    write(seeded());
    const id = (createBoard(dir, 'Uni', { copyHabits: true }) as { id: string }).id;
    const parked = read(join(dir, 'boards', id, 'board.json'));
    const habits = (mother(parked, 'habit').state as { habits: Array<{ name: string; log: string[] }> }).habits;
    expect(habits.map((h) => h.name)).toEqual(['Run', 'Read']);
    expect(habits.every((h) => h.log.length === 0)).toBe(true);
    expect((mother(parked, 'todo').state as { items?: unknown[] }).items ?? []).toHaveLength(0);
  });

  it('needs a name, and a name that is not taken', () => {
    write(seeded());
    expect(createBoard(dir, '  ')).toBe('a board needs a name');
    createBoard(dir, 'Uni');
    expect(createBoard(dir, 'uni')).toContain('already a board called');
  });
});

describe('F3 — switching', () => {
  it('parks the open board with its time log and brings the other back; switching again restores it exactly', () => {
    const main = seeded();
    write(main);
    mkdirSync(join(dir, 'timelog'));
    writeFileSync(join(dir, 'timelog', '2026-11.jsonl'), '{"type":"main"}\n');
    const uni = (createBoard(dir, 'Uni') as { id: string }).id;

    expect(switchBoard(dir, 'Uni')).toMatchObject({ id: uni });
    expect(readBoardsIndex(dir).activeId).toBe(uni);
    expect(read().nodes.some((n) => n.id === 'note-main')).toBe(false);
    expect(existsSync(join(dir, 'timelog'))).toBe(false);
    expect(readFileSync(join(dir, 'boards', 'canvas-main', 'timelog', '2026-11.jsonl'), 'utf8')).toContain('main');

    // Work in Uni: a plan and a line of time log.
    const u = read();
    (mother(u, 'todo').state as Record<string, unknown>).items = [{ id: 'u1', text: 'Lecture', done: false }];
    write(u);
    mkdirSync(join(dir, 'timelog'));
    writeFileSync(join(dir, 'timelog', '2026-11.jsonl'), '{"type":"uni"}\n');

    expect(switchBoard(dir, 'Main')).toMatchObject({ id: 'canvas-main' });
    expect(read()).toEqual(main);
    expect(readFileSync(join(dir, 'timelog', '2026-11.jsonl'), 'utf8')).toContain('main');
    expect(listBoards(dir).boards.find((b) => b.id === uni)?.plans).toBe(1);
    expect(readFileSync(join(dir, 'boards', uni, 'timelog', '2026-11.jsonl'), 'utf8')).toContain('uni');
  });

  it('finds a board by id, name or the start of either; says so when there is none', () => {
    write(seeded());
    createBoard(dir, 'Side project');
    expect(switchBoard(dir, 'side')).toMatchObject({ name: 'Side project' });
    expect(switchBoard(dir, 'nope')).toBe('no board "nope"');
    expect(existsSync(boardPath())).toBe(true);
  });

  it('switching to the open board changes nothing', () => {
    const main = seeded();
    write(main);
    expect(switchBoard(dir, 'Main')).toMatchObject({ id: 'canvas-main' });
    expect(read()).toEqual(main);
  });
});

describe('F4 — one timer at a time', () => {
  it('leaving a board whose timer is running records where it runs; coming back clears it', () => {
    const main = seeded();
    Object.assign(mother(main, 'pomo').state as Record<string, unknown>, { status: 'running', startedAt: '2026-11-20T09:00:00.000Z', label: 'Essay' });
    write(main);
    createBoard(dir, 'Uni');
    switchBoard(dir, 'Uni');
    expect(listBoards(dir).recording).toEqual({ boardId: 'canvas-main', startedAt: '2026-11-20T09:00:00.000Z', label: 'Essay' });
    switchBoard(dir, 'Main');
    expect(listBoards(dir).recording).toBeNull();
  });

  it('a board whose timer is idle leaves no recording note', () => {
    write(seeded());
    createBoard(dir, 'Uni');
    switchBoard(dir, 'Uni');
    expect(listBoards(dir).recording).toBeNull();
  });
});

describe('F5 / F6 — rename and delete', () => {
  it('renames, and refuses a taken name', () => {
    write(seeded());
    createBoard(dir, 'Uni');
    expect(renameBoard(dir, 'Uni', 'University')).toMatchObject({ name: 'University' });
    expect(renameBoard(dir, 'University', 'main')).toContain('already a board called');
    expect(listBoards(dir).boards.map((b) => b.name)).toEqual(['Main', 'University']);
  });

  it('never deletes the open board or the last one; a deleted board is kept in boards/.deleted', () => {
    write(seeded());
    expect(deleteBoard(dir, 'Main')).toBe('cannot delete the last board');
    const id = (createBoard(dir, 'Uni') as { id: string }).id;
    expect(deleteBoard(dir, 'Main')).toContain('cannot be deleted');
    expect(deleteBoard(dir, 'Uni')).toMatchObject({ id });
    expect(listBoards(dir).boards.map((b) => b.name)).toEqual(['Main']);
    expect(existsSync(join(dir, 'boards', id))).toBe(false);
    expect(readdirSync(join(dir, 'boards', '.deleted')).some((n) => n.startsWith(id))).toBe(true);
  });
});

describe('F8 — canvases become boards, once', () => {
  function threeCanvases(): Raw {
    const b = seeded();
    b.canvases = [{ id: 'canvas-main', name: 'Main' }, { id: 'c-research', name: 'Research' }, { id: 'c-ideas', name: 'Ideas' }];
    b.activeCanvasId = 'c-research';
    b.nodes.push(
      { id: 'note-r1', kind: 'text', position: { x: 0, y: 0 }, canvasId: 'c-research', state: { text: 'r1' } },
      { id: 'note-r2', kind: 'text', position: { x: 9, y: 9 }, canvasId: 'c-research', state: { text: 'r2' } },
      { id: 'note-i1', kind: 'text', position: { x: 0, y: 0 }, canvasId: 'c-ideas', state: { text: 'i1' } },
    );
    b.edges.push(
      { id: 'e-rr', from: { nodeId: 'note-r1', event: 'x' }, to: { nodeId: 'note-r2', command: 'y' } },
      { id: 'e-mr', from: { nodeId: 'note-main', event: 'x' }, to: { nodeId: 'note-r1', command: 'y' } },
    );
    b.drawings = [{ id: 's-main', canvasId: 'canvas-main' }, { id: 's-r', canvasId: 'c-research' }];
    return b;
  }

  it('the first canvas keeps every plan and habit; the others keep their own notes and start with empty lists', () => {
    write(threeCanvases());
    const index = readBoardsIndex(dir);
    expect(index.boards.map((b) => b.name)).toEqual(['Main', 'Research', 'Ideas']);
    expect(index.activeId).toBe('canvas-main');
    expect(index.notice).toEqual({ kept: 'Main', others: ['Research', 'Ideas'] });

    const main = read();
    expect(main.canvases).toEqual([{ id: 'canvas-main', name: 'Main' }]);
    expect((mother(main, 'todo').state as { items: unknown[] }).items).toHaveLength(3);
    expect((mother(main, 'habit').state as { habits: unknown[] }).habits).toHaveLength(2);
    expect(main.nodes.map((n) => n.id)).toContain('note-main');
    expect(main.nodes.map((n) => n.id)).not.toContain('note-r1');
    expect(main.edges.map((e) => e.id)).toEqual([]);
    expect((main.drawings as Array<{ id: string }>).map((s) => s.id)).toEqual(['s-main']);

    const research = read(join(dir, 'boards', 'c-research', 'board.json'));
    expect(research.nodes.filter((n) => n.kind === 'text').map((n) => n.id)).toEqual(['note-r1', 'note-r2']);
    expect(research.edges.map((e) => e.id)).toEqual(['e-rr']);
    expect((research.drawings as Array<{ id: string }>).map((s) => s.id)).toEqual(['s-r']);
    expect((mother(research, 'todo').state as { items?: unknown[] }).items ?? []).toHaveLength(0);
    expect(research.nodes.filter((n) => n.isMother === true).length).toBe(main.nodes.filter((n) => n.isMother === true).length);

    const ideas = read(join(dir, 'boards', 'c-ideas', 'board.json'));
    expect(ideas.nodes.filter((n) => n.kind === 'text').map((n) => n.id)).toEqual(['note-i1']);
  });

  it('keeps a copy of the board as it was, and runs only once', () => {
    const before = threeCanvases();
    write(before);
    readBoardsIndex(dir);
    const copy = readdirSync(dir).find((n) => n.startsWith('board.json.before-boards-'));
    expect(copy).toBeTruthy();
    expect(read(join(dir, copy!))).toEqual(before);
    const after = read();
    readBoardsIndex(dir);
    expect(read()).toEqual(after);
    expect(readdirSync(dir).filter((n) => n.startsWith('board.json.before-boards-'))).toHaveLength(1);
  });

  it('the notice is shown until it is acknowledged', () => {
    write(threeCanvases());
    expect(listBoards(dir).notice).not.toBeNull();
    ackBoardsNotice(dir);
    expect(listBoards(dir).notice).toBeNull();
  });

  it('a moved board opens: switching to it gives a board with every window', () => {
    write(threeCanvases());
    readBoardsIndex(dir);
    expect(switchBoard(dir, 'Research')).toMatchObject({ id: 'c-research' });
    const now = read();
    for (const kind of ['pomo', 'todo', 'habit']) expect(mother(now, kind)).toBeTruthy();
    expect(now.nodes.map((n) => n.id)).toContain('note-r1');
  });
});
