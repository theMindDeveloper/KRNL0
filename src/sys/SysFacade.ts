import { SysParser } from './parser';
import * as habit from './commands/habit';

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

Pomodoro:
  sys pomo start [--label "..."] [--minutes 25]
  sys pomo stop
  sys pomo status

Todos:
  sys todo add "..." [--tag work]
  sys todo check <id>
  sys todo list

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
