// sys todo CLI — real board.json operations for the sys CLI.
// Operates on the first todo mother node in board.json.

import { randomUUID } from 'crypto';
import { loadBoardFrom, saveBoardTo } from '../../main/persistence/board';
import type { SysResult } from '../SysFacade';
import {
  todoToggle as fsmTodoToggle,
  visibleItems,
} from '../../renderer/components/nodes/TodoNode/commands';
import type { TodoState } from '../../renderer/components/nodes/TodoNode/types';
import { defaultTodoConfig } from '../../renderer/components/nodes/TodoNode/types';
import { createTodoTaskPair } from '../../shared/dispatch/todo';
import { resolveTodoItemRef, resolutionError } from '../../shared/dispatch/resolveRef';
import type { BoardShape } from '../../shared/dispatch/types';

export interface TodoCtx {
  boardPath: string;
  onBoardChanged?: () => void;
}

function loadBoard(ctx: TodoCtx): BoardShape {
  const raw = loadBoardFrom(ctx.boardPath);
  if (typeof raw !== 'object' || raw === null) return { nodes: [], edges: [] };
  const b = raw as Record<string, unknown>;
  if (!Array.isArray(b['nodes'])) b['nodes'] = [];
  if (!Array.isArray(b['edges'])) b['edges'] = [];
  return b as BoardShape;
}

function findTodoMother(board: BoardShape): { id: string; state: TodoState } | null {
  for (const n of board.nodes) {
    if (n.kind === 'todo' && n.isMother === true) {
      return { id: n.id, state: n.state as TodoState };
    }
  }
  return null;
}

function saveBoard(ctx: TodoCtx, board: BoardShape): void {
  saveBoardTo(ctx.boardPath, { ...board, savedAt: new Date().toISOString() });
  ctx.onBoardChanged?.();
}

export async function todoAdd(
  ctx: TodoCtx,
  text?: string,
  tag?: string,
): Promise<SysResult> {
  if (!text) return { ok: false, message: 'todo add requires a task description' };
  const board = loadBoard(ctx);

  const pair = createTodoTaskPair(
    board,
    { text, ...(tag !== undefined ? { tag } : {}) },
    { uuid: () => randomUUID(), now: () => new Date().toISOString() },
  );
  if (!pair) {
    return { ok: false, message: 'No todo mother node found in board.' };
  }

  saveBoard(ctx, board);
  return {
    ok: true,
    message: `Added todo: "${text}"${tag ? ` [${tag}]` : ''} (task: ${pair.taskNodeId.slice(0, 13)}…)`,
    data: { id: pair.todoItemId, todoItemId: pair.todoItemId, taskNodeId: pair.taskNodeId },
  };
}

export async function todoCheck(ctx: TodoCtx, id?: string): Promise<SysResult> {
  if (!id) return { ok: false, message: 'todo check requires a task <id>' };
  const board = loadBoard(ctx);
  const mother = findTodoMother(board);
  if (!mother) return { ok: false, message: 'No todo mother node found in board.' };

  const r = resolveTodoItemRef(board, id);
  if (!r.ok) return { ok: false, message: resolutionError('todo item', id, r) };

  const motherIdx = board.nodes.findIndex((n) => n.id === r.id.todoNodeId);
  if (motherIdx === -1) return { ok: false, message: `Todo node missing.` };
  const motherNode = board.nodes[motherIdx]!;
  const motherState = motherNode.state as TodoState;
  const item = motherState.items.find((i) => i.id === r.id.itemId);
  if (!item) return { ok: false, message: `No todo item with id "${id}"` };

  const env = { uuid: () => randomUUID(), now: () => new Date().toISOString() };
  const nextState = fsmTodoToggle(motherState, { id: r.id.itemId }, env);
  const updated = nextState.items.find((i) => i.id === r.id.itemId);

  board.nodes[motherIdx] = { ...motherNode, state: nextState };
  saveBoard(ctx, board);
  return {
    ok: true,
    message: `Todo "${item.text}" marked ${updated?.done ? 'done' : 'undone'}.`,
    data: { id: r.id.itemId, done: updated?.done },
  };
}

export async function todoList(ctx: TodoCtx, json = false): Promise<SysResult> {
  const board = loadBoard(ctx);
  const mother = findTodoMother(board);
  if (!mother) {
    if (json) return { ok: true, message: '[]', data: [] };
    return { ok: false, message: 'No todo mother node found in board.' };
  }

  const items = visibleItems(mother.state, defaultTodoConfig());

  if (json) {
    return {
      ok: true,
      message: JSON.stringify(items),
      data: items,
    };
  }

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
