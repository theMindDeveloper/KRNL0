// sys todo CLI — real board.json operations for the sys CLI.
// Operates on the first todo mother node in board.json.

import { randomUUID } from 'crypto';
import { loadBoardFrom, saveBoardTo } from '../../main/persistence/board';
import type { SysResult } from '../SysFacade';
import {
  todoAdd as fsmTodoAdd,
  todoToggle as fsmTodoToggle,
  visibleItems,
} from '../../renderer/components/nodes/TodoNode/commands';
import type { TodoState } from '../../renderer/components/nodes/TodoNode/types';
import { defaultTodoConfig } from '../../renderer/components/nodes/TodoNode/types';

export interface TodoCtx {
  boardPath: string;
  onBoardChanged?: () => void;
}

interface BoardShape {
  nodes: unknown[];
  edges: unknown[];
  [k: string]: unknown;
}

interface TodoNode {
  id: string;
  kind: 'todo';
  isMother: boolean;
  state: TodoState;
  [k: string]: unknown;
}

function loadBoard(ctx: TodoCtx): BoardShape {
  const raw = loadBoardFrom(ctx.boardPath);
  if (typeof raw !== 'object' || raw === null) return { nodes: [], edges: [] };
  const b = raw as Record<string, unknown>;
  if (!Array.isArray(b['nodes'])) b['nodes'] = [];
  if (!Array.isArray(b['edges'])) b['edges'] = [];
  return b as BoardShape;
}

function findTodoMother(board: BoardShape): TodoNode | null {
  for (const n of board.nodes) {
    if (typeof n !== 'object' || n === null) continue;
    const node = n as { kind?: unknown; isMother?: unknown };
    if (node.kind === 'todo' && node.isMother === true) return n as TodoNode;
  }
  return null;
}

function writeBoard(ctx: TodoCtx, board: BoardShape, mother: TodoNode): void {
  board.nodes = board.nodes.map((n) => {
    if (typeof n !== 'object' || n === null) return n;
    if ((n as { id?: unknown }).id === mother.id) return mother;
    return n;
  });
  saveBoardTo(ctx.boardPath, { ...board, savedAt: new Date().toISOString() });
  ctx.onBoardChanged?.();
}

function notFound(): SysResult {
  return { ok: false, message: 'No todo mother node found in board.' };
}

export async function todoAdd(
  ctx: TodoCtx,
  text?: string,
  tag?: string,
): Promise<SysResult> {
  if (!text) return { ok: false, message: 'todo add requires a task description' };
  const board = loadBoard(ctx);
  const mother = findTodoMother(board);
  if (!mother) return notFound();

  const env = {
    uuid: () => randomUUID(),
    now: () => new Date().toISOString(),
  };

  const nextState = fsmTodoAdd(
    mother.state,
    { text, ...(tag !== undefined ? { tag } : {}) },
    env,
  );

  const added = nextState.items[nextState.items.length - 1];
  writeBoard(ctx, board, { ...mother, state: nextState });
  return {
    ok: true,
    message: `Added todo: "${text}"${tag ? ` [${tag}]` : ''}`,
    data: { id: added?.id },
  };
}

export async function todoCheck(ctx: TodoCtx, id?: string): Promise<SysResult> {
  if (!id) return { ok: false, message: 'todo check requires a task <id>' };
  const board = loadBoard(ctx);
  const mother = findTodoMother(board);
  if (!mother) return notFound();

  const item = mother.state.items.find((i) => i.id === id);
  if (!item) return { ok: false, message: `No todo item with id "${id}"` };

  const env = { uuid: () => randomUUID(), now: () => new Date().toISOString() };
  const nextState = fsmTodoToggle(mother.state, { id }, env);
  const updated = nextState.items.find((i) => i.id === id);

  writeBoard(ctx, board, { ...mother, state: nextState });
  return {
    ok: true,
    message: `Todo "${item.text}" marked ${updated?.done ? 'done' : 'undone'}.`,
    data: { id, done: updated?.done },
  };
}

export async function todoList(ctx: TodoCtx): Promise<SysResult> {
  const board = loadBoard(ctx);
  const mother = findTodoMother(board);
  if (!mother) return notFound();

  const items = visibleItems(mother.state, defaultTodoConfig());
  const lines = items.map((i) => {
    const status = i.done ? '[x]' : '[ ]';
    const tag = i.tag ? ` [${i.tag}]` : '';
    return `${status} ${i.id.slice(0, 8)}  ${i.text}${tag}`;
  });

  return {
    ok: true,
    message: lines.length > 0 ? lines.join('\n') : 'No todos.',
    data: items,
  };
}
