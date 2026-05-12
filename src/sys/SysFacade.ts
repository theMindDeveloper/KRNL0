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

export interface SysResult {
  ok: boolean;
  message?: string;
  data?: unknown;
}

export interface SysFacadeDeps {
  boardPath: string;
  hasOpenRenderer: () => boolean;
  onBoardChanged?: () => void;
}

function defaultBoardPath(): string {
  if (process.env['KRNL0_BOARD_PATH']) return process.env['KRNL0_BOARD_PATH'];
  const dir = process.env['KRNL0_BOARD_DIR']
    ?? `${process.env['USERPROFILE'] ?? process.env['HOME'] ?? '.'}/Documents/krnl0`;
  return `${dir}/board.json`;
}

export class SysFacade {
  private readonly deps: SysFacadeDeps;

  constructor(deps?: Partial<SysFacadeDeps>) {
    this.deps = {
      boardPath: deps?.boardPath ?? defaultBoardPath(),
      hasOpenRenderer: deps?.hasOpenRenderer ?? (() => false),
      ...(deps?.onBoardChanged ? { onBoardChanged: deps.onBoardChanged } : {}),
    };
  }

  async run(argv: string[]): Promise<SysResult> {
    if (argv.length === 0 || argv[0] === 'help') {
      return { ok: true, message: HELP_TEXT };
    }

    const command = SysParser.parse(argv);
    if (!command) {
      return {
        ok: false,
        message: `Unknown command: '${argv.join(' ')}'. Run 'sys help' for usage.`,
      };
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
        case 'subtask': return task.taskSubtask(ctx, command.parentId, command.text);
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

const HELP_TEXT = `
krnl0 — sys CLI v0.1.0
Usage: sys <subcommand> [args] [--json]

Board:
  sys board show
  sys board save [path]
  sys board load <path>

Nodes:
  sys node list
  sys node add <kind> [--at x,y]
  sys node remove <id>

Text:
  sys text add [--text "..."] [--at x,y]
  sys text set <id> --text "..."
  sys text resize <id> --w N --h N

Image:
  sys image add <abs-path> [--at x,y]
  sys image replace <id> <abs-path>
  sys image resize <id> --w N --h N
  sys image clear <id>

Pomodoro:
  sys pomo start [--label "..."] [--minutes 25]
  sys pomo stop
  sys pomo status

Todos:
  sys todo add "..." [--tag work]
  sys todo check <id>
  sys todo list

Tasks:
  sys task add "<text>" [--todo <todoId>] [--duration <min>]
  sys task edit <id> "<text>"
  sys task toggle <id>
  sys task delete <id>
  sys task pomo <id>
  sys task subtask <parentId> "<text>"
  sys task list [<todoId>]

Habits:
  sys habit add "<name>"
  sys habit done <id|name> [--date YYYY-MM-DD]
  sys habit streak <id|name>
  sys habit color <id|name> <acid|rust|cyan|plum|spine|ink>
  sys habit remove <id|name>
  sys habit view <week|month|year>
  sys habit list

Edges:
  sys edge add --from <node:event> --to <node:command> [--args k=v]
  sys edge remove <id>
  sys edge list

Voice:
  sys say "..."   speak via TTS
  sys hear        one-shot STT transcription

All commands accept --json for machine-readable output.
`.trim();
