// ADR 0016 — sys CLI parity for tags, Done/Archive and time-by-tag analytics.
// Every UI capability has a `sys` command (AGENTS.md hard rule 8).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  todoAdd,
  todoArchive,
  todoCheck,
  todoClearArchive,
  todoList,
  todoTag,
  todoTags,
  type TodoCtx,
} from '../../../src/sys/commands/todo';
import { analyticsShow } from '../../../src/sys/commands/analytics';
import { SysParser } from '../../../src/sys/parser';
import type { TodoItem, TodoState } from '../../../src/renderer/components/nodes/TodoNode/types';
import type { CompletionRecord } from '../../../src/shared/types/board';

let tmpDir = '';
let boardPath = '';
let ctx: TodoCtx;

interface BoardOnDisk {
  nodes: Array<{ id: string; kind: string; isMother?: boolean; state: unknown; [k: string]: unknown }>;
  edges: unknown[];
  completions?: CompletionRecord[];
}

const readBoard = (): BoardOnDisk => JSON.parse(readFileSync(boardPath, 'utf-8')) as BoardOnDisk;
const todoState = (): TodoState => readBoard().nodes.find((n) => n.kind === 'todo' && n.isMother)!.state as TodoState;
const item = (text: string): TodoItem => todoState().items.find((i) => i.text === text)!;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'krnl0-todo-tags-'));
  boardPath = join(tmpDir, 'board.json');
  writeFileSync(boardPath, JSON.stringify({
    nodes: [{
      id: 'mother-todo', kind: 'todo', isMother: true, position: { x: 0, y: 0 },
      state: { items: [] }, config: { showCompleted: true, maxVisible: 50 },
    }],
    edges: [],
  }), 'utf-8');
  ctx = { boardPath };
});

afterEach(() => {
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
});

describe('parser', () => {
  it('parses the new todo subcommands', () => {
    expect(SysParser.parse(['todo', 'list', '--archived'])).toMatchObject({ sub: 'list', scope: 'archived' });
    expect(SysParser.parse(['todo', 'list', '--all', '--json'])).toMatchObject({ sub: 'list', scope: 'all', json: true });
    expect(SysParser.parse(['todo', 'tag', 'abcd', 'Meetings'])).toEqual({ kind: 'todo', sub: 'tag', ref: 'abcd', tag: 'Meetings' });
    expect(SysParser.parse(['todo', 'tags', 'add', 'Gaming', '--keywords', 'steam,elden'])).toMatchObject({
      sub: 'tags', action: 'add', label: 'Gaming', keywords: 'steam,elden',
    });
    expect(SysParser.parse(['todo', 'tags', '--json'])).toMatchObject({ sub: 'tags', action: undefined, json: true });
    expect(SysParser.parse(['todo', 'archive'])).toEqual({ kind: 'todo', sub: 'archive' });
    expect(SysParser.parse(['todo', 'clear-archive'])).toEqual({ kind: 'todo', sub: 'clear-archive' });
  });
});

describe('todo add / tag', () => {
  it('CLI adds are auto-tagged the same way as UI adds', async () => {
    await todoAdd(ctx, 'Reply to emails');
    expect(item('Reply to emails')).toMatchObject({ tag: 'admin', tagSource: 'auto' });
  });

  it('todo tag sets a hand tag; "auto" reverts', async () => {
    await todoAdd(ctx, 'Reply to emails');
    const ref = item('Reply to emails').id.slice(0, 8);
    const res = await todoTag(ctx, ref, 'Planning');
    expect(res.ok).toBe(true);
    expect(item('Reply to emails')).toMatchObject({ tag: 'planning', tagSource: 'user' });
    await todoTag(ctx, ref, 'auto');
    expect(item('Reply to emails')).toMatchObject({ tag: 'admin', tagSource: 'auto' });
  });

  it('todo tag with an unknown label creates a custom tag', async () => {
    await todoAdd(ctx, 'Elden ring');
    await todoTag(ctx, 'Elden ring', 'Gaming');
    expect(todoState().tagLibrary?.map((t) => t.id)).toEqual(['gaming']);
  });
});

describe('todo tags', () => {
  it('lists built-ins with item counts', async () => {
    await todoAdd(ctx, 'Gym');
    const res = await todoTags(ctx, { json: true });
    const rows = res.data as Array<{ id: string; items: number; builtin: boolean }>;
    expect(rows.find((r) => r.id === 'health')).toMatchObject({ items: 1, builtin: true });
  });

  it('adds and removes a custom tag', async () => {
    expect((await todoTags(ctx, { action: 'add', label: 'Gaming', keywords: 'steam' })).ok).toBe(true);
    expect((await todoTags(ctx, { action: 'add', label: 'Gaming' })).ok).toBe(false);
    expect(todoState().tagLibrary?.[0]).toMatchObject({ id: 'gaming', keywords: ['steam'] });
    expect((await todoTags(ctx, { action: 'remove', label: 'gaming' })).ok).toBe(true);
    expect(todoState().tagLibrary).toEqual([]);
    expect((await todoTags(ctx, { action: 'remove', label: 'code' })).ok).toBe(false);
  });
});

describe('ledger + Done/Archive', () => {
  it('completing a task files its tag on the completion ledger', async () => {
    await todoAdd(ctx, 'Fix login bug');
    await todoCheck(ctx, 'Fix login bug');
    const entry = readBoard().completions?.find((c) => c.text === 'Fix login bug');
    expect(entry?.tag).toBe('code');
  });

  it('re-tagging a done item refreshes its ledger entry', async () => {
    await todoAdd(ctx, 'Fix login bug');
    await todoCheck(ctx, 'Fix login bug');
    await todoTag(ctx, 'Fix login bug', 'study');
    expect(readBoard().completions?.find((c) => c.text === 'Fix login bug')?.tag).toBe('study');
  });

  it('todo list hides archived items unless asked', async () => {
    await todoAdd(ctx, 'open one');
    await todoAdd(ctx, 'finished one');
    await todoCheck(ctx, 'finished one');
    expect((await todoList(ctx, true)).data).toHaveLength(2);
    await todoArchive(ctx);
    expect((await todoList(ctx, true)).data).toHaveLength(1);
    expect((await todoList(ctx, true, 'archived')).data).toHaveLength(1);
    expect((await todoList(ctx, true, 'all')).data).toHaveLength(2);
  });

  it('clear-archive deletes rows and task nodes but keeps the ledger', async () => {
    await todoAdd(ctx, 'finished one');
    await todoCheck(ctx, 'finished one');
    await todoArchive(ctx);
    const res = await todoClearArchive(ctx);
    expect(res.ok).toBe(true);
    const board = readBoard();
    expect(todoState().items).toHaveLength(0);
    expect(board.nodes.filter((n) => n.kind === 'todo.task')).toHaveLength(0);
    expect(board.completions?.some((c) => c.text === 'finished one')).toBe(true);
  });
});

describe('analytics show --view tags', () => {
  it('groups completed minutes by tag', async () => {
    await todoAdd(ctx, 'Fix login bug');
    await todoAdd(ctx, 'Gym');
    await todoCheck(ctx, 'Fix login bug');
    await todoCheck(ctx, 'Gym');
    const res = await analyticsShow({ boardPath }, { view: 'tags', range: 7, json: true });
    const data = res.data as { tags: Array<{ id: string; count: number; minutes: number }>; totalCount: number };
    expect(data.totalCount).toBe(2);
    expect(data.tags.map((t) => t.id).sort()).toEqual(['code', 'health']);
    expect(data.tags.every((t) => t.count === 1 && t.minutes > 0)).toBe(true);
  });

  it('classifies legacy ledger entries that predate tags', async () => {
    const board = readBoard();
    board.completions = [{ taskId: 't1', text: 'Team standup', plannedMin: 15, completedAt: new Date().toISOString() }];
    writeFileSync(boardPath, JSON.stringify(board), 'utf-8');
    const res = await analyticsShow({ boardPath }, { view: 'tags', json: true });
    const data = res.data as { tags: Array<{ id: string; minutes: number }> };
    expect(data.tags).toEqual([expect.objectContaining({ id: 'meetings', minutes: 15 })]);
  });
});
