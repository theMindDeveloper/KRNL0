// sys board — CLI twin of the top-bar board menu (Decision 49, boards.md).
//   board list [--json]              list boards (* = the open one) with their open plans and habits
//   board new <name> [--copy-habits] create a board (empty, or with the open board's habits)
//   board switch <ref>               open a board (id, name or the start of one)
//   board rename <ref> <name>        rename a board
//   board delete <ref>               delete a board (not the open one, not the last one)

import type { SysResult } from '../SysFacade';
import { createBoard, deleteBoard, listBoards, renameBoard, switchBoard } from '../../main/persistence/boards';

export interface BoardCtx {
  /** The folder that holds board.json. */
  boardDir: string;
  /** The app's own switch (swaps the files and reloads the window). Absent when no window is open. */
  onBoardSwitch?: (ref: string | undefined) => { ok: boolean; message: string };
}

export function boardList(ctx: BoardCtx, json: boolean): SysResult {
  const list = listBoards(ctx.boardDir);
  if (json) return { ok: true, message: JSON.stringify(list.boards), data: list.boards };
  const lines = list.boards.map((b) => `${b.active ? '*' : ' '} ${b.id}  ${b.name}  (${b.plans} open plan${b.plans === 1 ? '' : 's'}, ${b.habits} habit${b.habits === 1 ? '' : 's'})`);
  if (list.recording) {
    const where = list.boards.find((b) => b.id === list.recording!.boardId)?.name ?? list.recording.boardId;
    lines.push(`  the timer is running in "${where}"`);
  }
  return { ok: true, message: lines.join('\n'), data: list.boards };
}

export function boardNew(ctx: BoardCtx, name: string | undefined, copyHabits: boolean): SysResult {
  const res = createBoard(ctx.boardDir, name, { copyHabits });
  if (typeof res === 'string') return { ok: false, message: res };
  return { ok: true, message: `created board ${res.id} "${res.name}"${copyHabits ? ' with your habits' : ''} (open it with: board switch ${res.name})`, data: res };
}

export function boardSwitch(ctx: BoardCtx, ref: string | undefined): SysResult {
  if (ctx.onBoardSwitch) return ctx.onBoardSwitch(ref);
  const res = switchBoard(ctx.boardDir, ref);
  if (typeof res === 'string') return { ok: false, message: res };
  return { ok: true, message: `switched to board "${res.name}"`, data: res };
}

export function boardRename(ctx: BoardCtx, ref: string | undefined, name: string | undefined): SysResult {
  const res = renameBoard(ctx.boardDir, ref, name);
  if (typeof res === 'string') return { ok: false, message: res };
  return { ok: true, message: `renamed the board to "${res.name}"`, data: res };
}

export function boardDelete(ctx: BoardCtx, ref: string | undefined): SysResult {
  const res = deleteBoard(ctx.boardDir, ref);
  if (typeof res === 'string') return { ok: false, message: res };
  return { ok: true, message: `deleted board "${res.name}" (its files are kept in boards/.deleted)`, data: res };
}
