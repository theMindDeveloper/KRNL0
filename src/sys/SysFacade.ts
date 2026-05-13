import { SysParser } from './parser';
import * as habit from './commands/habit';
import * as todo from './commands/todo';
import * as task from './commands/task';
import { textAdd, textSet, textResize } from './commands/text';
import {
  imageAdd,
  imageReplace,
  imageResize,
  imageClear,
} from './commands/image';
import {
  generateHelp,
  generateGroupHelp,
  generateSubHelp,
} from '../shared/cli/commandRegistry';

/** Function type for renderer-coupled CLI dispatch (Phase 2). */
export type CliDispatchFn = (
  command: string,
  args: Record<string, unknown>,
) => Promise<{ ok: boolean; message: string; exitCode?: number }>;

export interface SysResult {
  ok: boolean;
  message?: string;
  data?: unknown;
}

export interface SysFacadeDeps {
  boardPath: string;
  hasOpenRenderer: () => boolean;
  onBoardChanged?: () => void;
  /** Phase 2: renderer-coupled dispatch for viewport/undo/redo/theme commands. */
  cliDispatch?: CliDispatchFn;
}

function defaultBoardPath(): string {
  if (process.env['KRNL0_BOARD_PATH']) return process.env['KRNL0_BOARD_PATH'];
  const dir = process.env['KRNL0_BOARD_DIR']
    ?? `${process.env['USERPROFILE'] ?? process.env['HOME'] ?? '.'}/Documents/krnl0`;
  return `${dir}/board.json`;
}

function readVersion(): string {
  try {
    // SysFacade is used both from main process (compiled) and from tests.
    // The package.json is one level above src/.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pkg = require('../../package.json') as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export class SysFacade {
  private readonly deps: SysFacadeDeps;
  private readonly version: string;

  constructor(deps?: Partial<SysFacadeDeps>) {
    this.deps = {
      boardPath: deps?.boardPath ?? defaultBoardPath(),
      hasOpenRenderer: deps?.hasOpenRenderer ?? (() => false),
      ...(deps?.onBoardChanged ? { onBoardChanged: deps.onBoardChanged } : {}),
      ...(deps?.cliDispatch ? { cliDispatch: deps.cliDispatch } : {}),
    };
    this.version = readVersion();
  }

  async run(argv: string[]): Promise<SysResult> {
    if (argv.length === 0) {
      return { ok: true, message: generateHelp(this.version) };
    }

    const command = SysParser.parse(argv);
    if (!command) {
      return {
        ok: false,
        message: `Unknown command: '${argv.join(' ')}'. Run 'krnl help' for usage.`,
      };
    }

    if (command.kind === 'help') {
      if (command.group && command.sub) {
        const text = generateSubHelp(command.group, command.sub);
        return text
          ? { ok: true, message: text }
          : { ok: false, message: `Unknown subcommand: ${command.group} ${command.sub}` };
      }
      if (command.group) {
        const text = generateGroupHelp(command.group);
        return text
          ? { ok: true, message: text }
          : { ok: false, message: `Unknown command group: ${command.group}` };
      }
      return { ok: true, message: generateHelp(this.version) };
    }

    if (command.kind === 'version') {
      return { ok: true, message: `krnl0 v${this.version}` };
    }

    if (command.kind === 'whoami') {
      const socket = process.env['KRNL0_RPC_SOCKET'] ?? '<unset>';
      const pid = process.env['KRNL0_MAIN_PID'] ?? String(process.pid);
      const token = process.env['KRNL0_RPC_TOKEN'];
      return {
        ok: true,
        message: [
          `socket : ${socket}`,
          `token  : ${token ? '(set)' : '(unset)'}`,
          `pid    : ${pid}`,
        ].join('\n'),
      };
    }

    if (command.kind === 'term') {
      // term.* commands require an open renderer (they operate on TerminalNode state).
      // Phase 1: headless stub — inform user.
      if (!this.deps.hasOpenRenderer()) {
        return {
          ok: false,
          message: `term.${command.sub} requires an open renderer window (exit 2 = no renderer).`,
          data: { exitCode: 2 },
        };
      }
      // Renderer-side dispatch is wired in commandDispatch.ts via cli:dispatch IPC (Phase 2).
      if (!this.deps.cliDispatch) {
        return {
          ok: false,
          message: `term.${command.sub} requires cli:dispatch (no renderer coupled)`,
          data: { exitCode: 2 },
        };
      }
      return this.deps.cliDispatch(`term.${command.sub}`, command as unknown as Record<string, unknown>);
    }

    // ── Phase 2 commands — renderer-coupled via cli:dispatch ──────────────────

    if (command.kind === 'node' && command.sub === 'move') {
      if (!command.id) return { ok: false, message: 'node move requires <id>' };
      if (!command.to) return { ok: false, message: 'node move requires --to x,y' };
      if (!this.deps.cliDispatch) {
        return { ok: false, message: 'node move requires an open renderer window', data: { exitCode: 2 } };
      }
      return this.deps.cliDispatch('node.move', { id: command.id, x: command.to.x, y: command.to.y });
    }

    if (command.kind === 'viewport') {
      if (!this.deps.cliDispatch) {
        return { ok: false, message: `viewport.${command.sub} requires an open renderer window`, data: { exitCode: 2 } };
      }
      if (command.sub === 'pan') {
        if (command.dx === undefined || command.dy === undefined) {
          return { ok: false, message: 'viewport pan requires --dx and --dy' };
        }
        return this.deps.cliDispatch('viewport.pan', { dx: command.dx, dy: command.dy });
      }
      if (command.sub === 'zoom') {
        if (command.factor === undefined) {
          return { ok: false, message: 'viewport zoom requires --factor' };
        }
        return this.deps.cliDispatch('viewport.zoom', { factor: command.factor });
      }
    }

    if (command.kind === 'undo') {
      if (!this.deps.cliDispatch) {
        return { ok: false, message: 'undo requires an open renderer window', data: { exitCode: 2 } };
      }
      return this.deps.cliDispatch('undo', {});
    }

    if (command.kind === 'redo') {
      if (!this.deps.cliDispatch) {
        return { ok: false, message: 'redo requires an open renderer window', data: { exitCode: 2 } };
      }
      return this.deps.cliDispatch('redo', {});
    }

    if (command.kind === 'marquee') {
      if (!this.deps.cliDispatch) {
        return { ok: false, message: 'marquee requires an open renderer window', data: { exitCode: 2 } };
      }
      if (!command.rect) return { ok: false, message: 'marquee requires --rect x1,y1,x2,y2' };
      return this.deps.cliDispatch('marquee.delete', command.rect as unknown as Record<string, unknown>);
    }

    if (command.kind === 'theme') {
      if (!command.value || !['light', 'dark'].includes(command.value)) {
        return { ok: false, message: 'theme set requires <light|dark>' };
      }
      if (!this.deps.cliDispatch) {
        return { ok: false, message: 'theme set requires an open renderer window', data: { exitCode: 2 } };
      }
      return this.deps.cliDispatch('theme.set', { value: command.value });
    }

    if (command.kind === 'habit') {
      const ctx: habit.HabitCtx = {
        boardPath: this.deps.boardPath,
        ...(this.deps.onBoardChanged ? { onBoardChanged: this.deps.onBoardChanged } : {}),
      };
      switch (command.sub) {
        case 'add':    return habit.cliAdd(ctx, command.name);
        case 'done':   return habit.cliDone(ctx, command.name, command.date);
        case 'streak': return habit.cliStreak(ctx, command.name);
        case 'color':  return habit.cliColor(ctx, command.name, command.color);
        case 'remove': return habit.cliRemove(ctx, command.name);
        case 'view':   return habit.cliView(ctx, command.view);
        case 'list':   return habit.cliList(ctx);
      }
    }

    if (command.kind === 'todo') {
      const ctx: todo.TodoCtx = {
        boardPath: this.deps.boardPath,
        ...(this.deps.onBoardChanged ? { onBoardChanged: this.deps.onBoardChanged } : {}),
      };
      switch (command.sub) {
        case 'add':   return todo.todoAdd(ctx, command.text, command.tag);
        case 'check': return todo.todoCheck(ctx, command.id);
        case 'list':  return todo.todoList(ctx);
      }
    }

    if (command.kind === 'task') {
      const ctx: task.TaskCtx = {
        boardPath: this.deps.boardPath,
        ...(this.deps.onBoardChanged ? { onBoardChanged: this.deps.onBoardChanged } : {}),
      };
      switch (command.sub) {
        case 'list':    return task.taskList(ctx, command.todoId);
        case 'add':     return task.taskAdd(ctx, command.todoId, command.text, command.durationMin);
        case 'edit':    return task.taskEdit(ctx, command.id, command.text);
        case 'toggle':  return task.taskToggle(ctx, command.id);
        case 'delete':  return task.taskDelete(ctx, command.id);
        case 'pomo':    return task.taskStartPomo(ctx, command.id);
        case 'subtask':    return task.taskSubtask(ctx, command.parentId, command.text);
        case 'duration':   return task.taskDuration(ctx, command.id, command.minutes);
        case 'sibling':    return task.taskSibling(ctx, command.id);
        case 'reset-pomo': return task.taskResetPomo(ctx, command.id);
      }
    }

    // text + image commands route through main/boardIo.ts directly via the
    // KRNL0_BOARD_DIR env (set by handlers.ts at module load). Convergence
    // with the habit/todo/task ctx-passing pattern is a future refactor.
    if (command.kind === 'text') {
      switch (command.sub) {
        case 'add':    return textAdd(command.text, command.at);
        case 'set':    return textSet(command.id, command.text);
        case 'resize': return textResize(command.id, command.w, command.h);
      }
    }

    if (command.kind === 'image') {
      switch (command.sub) {
        case 'add':     return imageAdd(command.path, command.at);
        case 'replace': return imageReplace(command.id, command.path);
        case 'resize':  return imageResize(command.id, command.w, command.h);
        case 'clear':   return imageClear(command.id);
      }
    }

    return {
      ok: true,
      message: `[stub] parsed: ${JSON.stringify(command)}`,
      data: command,
    };
  }
}

