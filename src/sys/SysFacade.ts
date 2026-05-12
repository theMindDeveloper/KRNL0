import { SysParser, type SysCommand } from './parser';
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

    return this.dispatch(command);
  }

  private dispatch(c: SysCommand): SysResult {
    switch (c.kind) {
      case 'help':
        return { ok: true, message: HELP_TEXT };

      case 'text': {
        if (c.sub === 'add')    return textAdd(c.text, c.at);
        if (c.sub === 'set')    return textSet(c.id, c.text);
        if (c.sub === 'resize') return textResize(c.id, c.w, c.h);
        break;
      }

      case 'image': {
        if (c.sub === 'add')     return imageAdd(c.path, c.at);
        if (c.sub === 'replace') return imageReplace(c.id, c.path);
        if (c.sub === 'resize')  return imageResize(c.id, c.w, c.h);
        if (c.sub === 'clear')   return imageClear(c.id);
        break;
      }

      // Other kinds are still stubs (Week 4 follow-up). Echo parsed command so
      // callers / tests can verify the parser succeeded.
      default:
        break;
    }

    return {
      ok: true,
      message: `[stub] parsed: ${JSON.stringify(c)}`,
      data: c,
    };
  }
}

const HELP_TEXT = `
krnl0 — sys CLI v0.2.0
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
