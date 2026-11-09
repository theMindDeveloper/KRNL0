/** Easy / Advanced mode (docs/06-requirements/easy-mode.md). */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { seedBoard, loadBoardFrom } from '../../src/main/persistence/board';
import { BoardSchema } from '../../src/shared/schemas/board.schema';
import { isEasyBoard } from '../../src/renderer/store/uiMode';
import { spanTone } from '../../src/renderer/store/spanTags';
import { segmentMenuItems, taskMenuItems } from '../../src/renderer/components/ContextMenu/scheduleMenus';
import { cardPlacement, pagesFor } from '../../src/renderer/components/nodes/AnalyticsNode/guide';

vi.mock('electron', () => ({ app: { getName: vi.fn(() => 'krnl0-test') }, BrowserWindow: { getAllWindows: vi.fn(() => []) } }));

const dir = mkdtempSync(join(tmpdir(), 'krnl0-easy-'));
const boardPath = join(dir, 'board.json');
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('Easy mode data', () => {
  it('F1: a new board is easy; a board without uiMode is advanced', () => {
    expect(seedBoard().uiMode).toBe('easy');
    expect(isEasyBoard(seedBoard() as never)).toBe(true);
    expect(isEasyBoard({} as never)).toBe(false);
  });

  it('uiMode round-trips through the schema and the loader', () => {
    const seeded = { ...seedBoard(), uiMode: 'easy' };
    writeFileSync(boardPath, JSON.stringify(seeded));
    expect((loadBoardFrom(boardPath) as { uiMode?: string }).uiMode).toBe('easy');
    expect(BoardSchema.safeParse(loadBoardFrom(boardPath)).success).toBe(true);
  });
});

describe('Easy mode UI rules', () => {
  const seg = { id: 's', kind: 'work' as const, taskId: 't', startMs: 0, endMs: 600_000, live: false };

  it('D5: recorded work is one colour in Easy, task colour in Advanced', () => {
    expect(spanTone([], { kind: 'work', taskId: 't1' }, true)).toBe('var(--acid)');
    expect(spanTone([], { kind: 'work', taskId: 't1' })).not.toBe('var(--acid)');
    expect(spanTone([], { kind: 'break' }, true)).toBe('var(--ink-3)');
  });

  it('D7: Easy span menu has no retag items', () => {
    const labels = (easy: boolean) => segmentMenuItems(seg, { targets: [{ id: 'x', text: 'Other' }], easy }).map((i) => i.label);
    const retag = (l: string) => l.endsWith('task…') || l === 'Untag';
    expect(labels(false).some(retag)).toBe(true);
    expect(labels(true).some(retag)).toBe(false);
    expect(labels(true)).toContain('Delete segment');
  });

  it('D9: Easy task menu has no Start focus', () => {
    const labels = (easy: boolean) => taskMenuItems({ id: 't', text: 'T', done: false }, { easy }).map((i) => i.label);
    expect(labels(false)).toContain('Start focus');
    expect(labels(true)).not.toContain('Start focus');
    expect(labels(true)).toContain('Mark done');
  });

  it('D12: Easy drops the plan-vs-actual, time-by-tag and time-per-task pages and closes the gap', () => {
    const ids = pagesFor(true).map((p) => p.id);
    expect(ids).not.toContain('estimates');
    expect(ids).not.toContain('tags');
    // Time per task too (owner, 2026-11-09): Easy's Record never links time to a
    // task, so the page showed one "untagged" row — and tags, which Easy hides.
    expect(ids).not.toContain('log');
    expect(pagesFor(false).length - ids.length).toBe(3);
    expect(cardPlacement('estimates.kpis', true)).toEqual({ display: 'none' });
    // summary, activity, year, hours, insights → 'insights' is page index 4 → grid row 9
    expect(cardPlacement('insights.radar', true).gridRow).toBe('9 / span 1');
  });
});
