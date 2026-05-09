import { SysParser } from './parser';

export interface SysResult {
  ok: boolean;
  message?: string;
  data?: unknown;
}

export class SysFacade {
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

    // TODO (Week 4): route to command handlers, load/mutate/save board.json
    return {
      ok: true,
      message: `[stub] parsed: ${JSON.stringify(command)}`,
      data: command,
    };
  }
}

const HELP_TEXT = `
THE SYSTEM — sys CLI v0.1.0
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
  sys habit done <name> [--date YYYY-MM-DD]
  sys habit streak <name>

Edges:
  sys edge add --from <node:event> --to <node:command> [--args k=v]
  sys edge remove <id>
  sys edge list

Voice:
  sys say "..."   speak via TTS
  sys hear        one-shot STT transcription

All commands accept --json for machine-readable output.
`.trim();
