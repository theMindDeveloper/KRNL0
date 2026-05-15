export type SysCommand =
  | { kind: 'board'; sub: 'show' | 'summary' | 'stats'; json: boolean }
  | { kind: 'board'; sub: 'save' | 'load'; path: string | undefined }
  | { kind: 'node'; sub: 'list'; nodeKind: string | undefined; motherOnly: boolean; childOnly: boolean; json: boolean }
  | { kind: 'node'; sub: 'read'; id: string | undefined; json: boolean }
  | { kind: 'node'; sub: 'remove'; id: string | undefined; force: boolean }
  | { kind: 'node'; sub: 'set-position'; id: string | undefined; x: number | undefined; y: number | undefined }
  | { kind: 'node'; sub: 'add'; nodeKind: string | undefined; at: { x: number; y: number } | undefined }
  | { kind: 'pomo'; sub: 'stop' | 'status' }
  | { kind: 'pomo'; sub: 'start'; label: string | undefined; minutes: number | undefined }
  | { kind: 'todo'; sub: 'list'; json: boolean }
  | { kind: 'todo'; sub: 'check'; id: string | undefined }
  | { kind: 'todo'; sub: 'add'; text: string | undefined; tag: string | undefined }
  | { kind: 'task'; sub: 'list'; todoId: string | undefined; json: boolean }
  | { kind: 'task'; sub: 'add'; todoId: string | undefined; text: string | undefined; durationMin: number | undefined }
  | { kind: 'task'; sub: 'edit'; id: string | undefined; text: string | undefined }
  | { kind: 'task'; sub: 'toggle'; id: string | undefined }
  | { kind: 'task'; sub: 'delete'; id: string | undefined }
  | { kind: 'task'; sub: 'pomo'; id: string | undefined }
  | { kind: 'task'; sub: 'subtask'; parentId: string | undefined; text: string | undefined }
  | { kind: 'task'; sub: 'duration'; id: string | undefined; minutes: number | undefined }
  | { kind: 'task'; sub: 'sibling'; id: string | undefined }
  | { kind: 'task'; sub: 'parallel'; id: string | undefined }
  | { kind: 'task'; sub: 'reset-pomo'; id: string | undefined }
  | { kind: 'task'; sub: 'chain'; refs: string[] }
  | { kind: 'task'; sub: 'schedule'; id: string | undefined; at: string | undefined; durationMin: number | undefined }
  | { kind: 'task'; sub: 'unschedule'; id: string | undefined }
  | { kind: 'task'; sub: 'addNext'; sourceRef: string | undefined; text: string | undefined; durationMin: number | undefined }
  | { kind: 'cal'; sub: 'show'; from: string | undefined; to: string | undefined; json: boolean }
  | { kind: 'clock'; sub: 'day'; arg: string | undefined }
  | { kind: 'clock'; sub: 'show'; json: boolean }
  | { kind: 'habit'; sub: 'add' | 'streak' | 'remove'; name: string | undefined }
  | { kind: 'habit'; sub: 'done'; name: string | undefined; date: string | undefined }
  | { kind: 'habit'; sub: 'color'; name: string | undefined; color: string | undefined }
  | { kind: 'habit'; sub: 'view'; view: string | undefined }
  | { kind: 'habit'; sub: 'list'; json: boolean }
  | { kind: 'edge'; sub: 'list'; json: boolean }
  | { kind: 'edge'; sub: 'remove'; id: string | undefined }
  | { kind: 'edge'; sub: 'add'; from: string | undefined; to: string | undefined }
  | { kind: 'edge'; sub: 'enable' | 'disable'; id: string | undefined }
  | { kind: 'info'; json: boolean }
  | { kind: 'settings'; sub: 'show'; json: boolean }
  | { kind: 'text'; sub: 'add'; text: string | undefined; at: { x: number; y: number } | undefined }
  | { kind: 'text'; sub: 'set'; id: string | undefined; text: string | undefined }
  | { kind: 'text'; sub: 'resize'; id: string | undefined; w: number | undefined; h: number | undefined }
  | { kind: 'image'; sub: 'add'; path: string | undefined; at: { x: number; y: number } | undefined }
  | { kind: 'image'; sub: 'replace'; id: string | undefined; path: string | undefined }
  | { kind: 'image'; sub: 'resize'; id: string | undefined; w: number | undefined; h: number | undefined }
  | { kind: 'image'; sub: 'clear'; id: string | undefined }
  | { kind: 'term'; sub: 'setTitle'; title: string | undefined }
  | { kind: 'term'; sub: 'setFontSize'; fontSize: number | undefined }
  | { kind: 'term'; sub: 'clear' }
  | { kind: 'term'; sub: 'setShell'; shell: string | undefined }
  | { kind: 'node'; sub: 'move'; id: string | undefined; to: { x: number; y: number } | undefined }
  | { kind: 'viewport'; sub: 'pan'; dx: number | undefined; dy: number | undefined }
  | { kind: 'viewport'; sub: 'zoom'; factor: number | undefined }
  | { kind: 'viewport'; sub: 'show'; json: boolean }
  | { kind: 'undo' }
  | { kind: 'redo' }
  | { kind: 'marquee'; rect: { x1: number; y1: number; x2: number; y2: number } | undefined; delete: boolean }
  | { kind: 'theme'; sub: 'set'; value: string | undefined }
  | { kind: 'version' }
  | { kind: 'whoami' }
  | { kind: 'say'; text: string }
  | { kind: 'hear' }
  | { kind: 'sfx'; sub: 'play'; clipId: string | undefined }
  | { kind: 'sfx'; sub: 'stop' }
  | { kind: 'sfx'; sub: 'list' }
  | { kind: 'help'; group: string | undefined; sub: string | undefined };

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

function numFlag(args: string[], name: string): number | undefined {
  const v = flag(args, name);
  if (v === undefined) return undefined;
  const n = Number(v);
  return isNaN(n) ? undefined : n;
}

/** Returns true iff `--<name>` appears anywhere in `args`. */
function hasFlag(args: string[], name: string): boolean {
  return args.includes(`--${name}`);
}

export class SysParser {
  static parse(argv: string[]): SysCommand | null {
    const [cmd, sub, ...rest] = argv;

    if (!cmd || cmd === 'help') return { kind: 'help', group: sub, sub: rest[0] };
    if (cmd === 'version') return { kind: 'version' };
    if (cmd === 'whoami')  return { kind: 'whoami' };
    if (cmd === 'say')  return { kind: 'say', text: [sub, ...rest].filter(Boolean).join(' ') };
    if (cmd === 'hear') return { kind: 'hear' };

    if (cmd === 'board') {
      if (sub === 'show' || sub === 'summary' || sub === 'stats') {
        return { kind: 'board', sub, json: hasFlag(rest, 'json') };
      }
      if (sub === 'save' || sub === 'load') {
        return { kind: 'board', sub, path: rest[0] };
      }
    }

    if (cmd === 'node') {
      if (sub === 'list') {
        return {
          kind: 'node', sub: 'list',
          nodeKind: flag(rest, 'kind'),
          motherOnly: hasFlag(rest, 'mother'),
          childOnly: hasFlag(rest, 'child'),
          json: hasFlag(rest, 'json'),
        };
      }
      if (sub === 'read') {
        return { kind: 'node', sub: 'read', id: rest[0], json: hasFlag(rest, 'json') };
      }
      if (sub === 'remove') {
        return { kind: 'node', sub: 'remove', id: rest[0], force: hasFlag(rest, 'force') };
      }
      if (sub === 'set-position') {
        return {
          kind: 'node', sub: 'set-position',
          id: rest[0],
          x: numFlag(rest, 'x'),
          y: numFlag(rest, 'y'),
        };
      }
      if (sub === 'add') {
        const atStr = flag(rest, 'at');
        const at = atStr ? parseAt(atStr) : undefined;
        return { kind: 'node', sub: 'add', nodeKind: rest[0], at };
      }
      if (sub === 'move') {
        const toStr = flag(rest, 'to');
        const to = toStr ? parseAt(toStr) : undefined;
        return { kind: 'node', sub: 'move', id: rest[0], to };
      }
    }

    if (cmd === 'info') {
      return { kind: 'info', json: hasFlag([sub ?? '', ...rest], 'json') };
    }

    if (cmd === 'settings') {
      if (sub === 'show' || sub === undefined) {
        return { kind: 'settings', sub: 'show', json: hasFlag(rest, 'json') };
      }
    }

    if (cmd === 'pomo') {
      if (sub === 'stop' || sub === 'status') return { kind: 'pomo', sub };
      if (sub === 'start') {
        const minutesRaw = flag(rest, 'minutes');
        return {
          kind: 'pomo', sub: 'start',
          label: flag(rest, 'label'),
          minutes: minutesRaw !== undefined ? Number(minutesRaw) : undefined,
        };
      }
    }

    if (cmd === 'todo') {
      if (sub === 'list')  return { kind: 'todo', sub: 'list', json: hasFlag(rest, 'json') };
      if (sub === 'check') return { kind: 'todo', sub: 'check', id: rest[0] };
      if (sub === 'add') {
        return { kind: 'todo', sub: 'add', text: rest[0], tag: flag(rest, 'tag') };
      }
    }

    if (cmd === 'task') {
      if (sub === 'list') {
        // Allow --todo flag or positional; --json optional.
        const todoFlag = flag(rest, 'todo');
        const positional = rest[0] && !rest[0].startsWith('--') ? rest[0] : undefined;
        return {
          kind: 'task', sub: 'list',
          todoId: todoFlag ?? positional,
          json: hasFlag(rest, 'json'),
        };
      }
      if (sub === 'chain') {
        const refs = rest.filter((a) => !a.startsWith('--'));
        return { kind: 'task', sub: 'chain', refs };
      }
      if (sub === 'add') {
        const durRaw = flag(rest, 'duration');
        return {
          kind: 'task',
          sub: 'add',
          todoId: flag(rest, 'todo'),
          text: rest[0],
          durationMin: durRaw !== undefined ? Number(durRaw) : undefined,
        };
      }
      if (sub === 'edit') {
        return { kind: 'task', sub: 'edit', id: rest[0], text: rest[1] };
      }
      if (sub === 'toggle') {
        return { kind: 'task', sub: 'toggle', id: rest[0] };
      }
      if (sub === 'delete') {
        return { kind: 'task', sub: 'delete', id: rest[0] };
      }
      if (sub === 'pomo') {
        return { kind: 'task', sub: 'pomo', id: rest[0] };
      }
      if (sub === 'subtask') {
        return { kind: 'task', sub: 'subtask', parentId: rest[0], text: rest[1] };
      }
      if (sub === 'duration') {
        const mins = rest[1] !== undefined ? Number(rest[1]) : undefined;
        return {
          kind: 'task',
          sub: 'duration',
          id: rest[0],
          minutes: mins !== undefined && !isNaN(mins) ? mins : undefined,
        };
      }
      if (sub === 'sibling') {
        return { kind: 'task', sub: 'sibling', id: rest[0] };
      }
      if (sub === 'parallel') {
        return { kind: 'task', sub: 'parallel', id: rest[0] };
      }
      if (sub === 'reset-pomo') {
        return { kind: 'task', sub: 'reset-pomo', id: rest[0] };
      }
      if (sub === 'schedule') {
        const durRaw = flag(rest, 'duration');
        return {
          kind: 'task',
          sub: 'schedule',
          id: rest[0],
          at: flag(rest, 'at'),
          durationMin: durRaw !== undefined ? Number(durRaw) : undefined,
        };
      }
      if (sub === 'unschedule') {
        return { kind: 'task', sub: 'unschedule', id: rest[0] };
      }
      if (sub === 'addNext') {
        const durRaw = flag(rest, 'duration');
        return {
          kind: 'task',
          sub: 'addNext',
          sourceRef: rest[0],
          text: rest[1],
          durationMin: durRaw !== undefined ? Number(durRaw) : undefined,
        };
      }
    }

    if (cmd === 'cal') {
      if (sub === 'show' || sub === undefined) {
        return {
          kind: 'cal',
          sub: 'show',
          from: flag(rest, 'from'),
          to: flag(rest, 'to'),
          json: hasFlag(rest, 'json'),
        };
      }
    }

    if (cmd === 'clock') {
      if (sub === 'day') {
        return { kind: 'clock', sub: 'day', arg: rest[0] };
      }
      if (sub === 'show' || sub === undefined) {
        return { kind: 'clock', sub: 'show', json: hasFlag(rest, 'json') };
      }
    }

    if (cmd === 'habit') {
      if (sub === 'add')    return { kind: 'habit', sub: 'add',    name: rest[0] };
      if (sub === 'streak') return { kind: 'habit', sub: 'streak', name: rest[0] };
      if (sub === 'remove') return { kind: 'habit', sub: 'remove', name: rest[0] };
      if (sub === 'list')   return { kind: 'habit', sub: 'list', json: hasFlag(rest, 'json') };
      if (sub === 'done') {
        return { kind: 'habit', sub: 'done', name: rest[0], date: flag(rest, 'date') };
      }
      if (sub === 'color') {
        return { kind: 'habit', sub: 'color', name: rest[0], color: rest[1] };
      }
      if (sub === 'view') {
        return { kind: 'habit', sub: 'view', view: rest[0] };
      }
    }

    if (cmd === 'edge') {
      if (sub === 'list')   return { kind: 'edge', sub: 'list', json: hasFlag(rest, 'json') };
      if (sub === 'remove') return { kind: 'edge', sub: 'remove', id: rest[0] };
      if (sub === 'enable') return { kind: 'edge', sub: 'enable', id: rest[0] };
      if (sub === 'disable') return { kind: 'edge', sub: 'disable', id: rest[0] };
      if (sub === 'add') {
        return {
          kind: 'edge', sub: 'add',
          from: flag(rest, 'from'),
          to: flag(rest, 'to'),
        };
      }
    }

    if (cmd === 'text') {
      if (sub === 'add') {
        const atStr = flag(rest, 'at');
        return {
          kind: 'text', sub: 'add',
          text: flag(rest, 'text'),
          at: atStr ? parseAt(atStr) : undefined,
        };
      }
      if (sub === 'set') {
        return { kind: 'text', sub: 'set', id: rest[0], text: flag(rest, 'text') };
      }
      if (sub === 'resize') {
        return {
          kind: 'text', sub: 'resize',
          id: rest[0],
          w: numFlag(rest, 'w'),
          h: numFlag(rest, 'h'),
        };
      }
    }

    if (cmd === 'image') {
      if (sub === 'add') {
        const atStr = flag(rest, 'at');
        return {
          kind: 'image', sub: 'add',
          path: rest[0],
          at: atStr ? parseAt(atStr) : undefined,
        };
      }
      if (sub === 'replace') {
        return { kind: 'image', sub: 'replace', id: rest[0], path: rest[1] };
      }
      if (sub === 'resize') {
        return {
          kind: 'image', sub: 'resize',
          id: rest[0],
          w: numFlag(rest, 'w'),
          h: numFlag(rest, 'h'),
        };
      }
      if (sub === 'clear') {
        return { kind: 'image', sub: 'clear', id: rest[0] };
      }
    }

    if (cmd === 'term') {
      if (sub === 'setTitle') return { kind: 'term', sub: 'setTitle', title: rest[0] };
      if (sub === 'setFontSize') {
        const n = rest[0] !== undefined ? Number(rest[0]) : undefined;
        return { kind: 'term', sub: 'setFontSize', fontSize: n !== undefined && !isNaN(n) ? n : undefined };
      }
      if (sub === 'clear') return { kind: 'term', sub: 'clear' };
      if (sub === 'setShell') return { kind: 'term', sub: 'setShell', shell: rest[0] };
    }

    if (cmd === 'viewport') {
      if (sub === 'pan') {
        return { kind: 'viewport', sub: 'pan', dx: numFlag(rest, 'dx'), dy: numFlag(rest, 'dy') };
      }
      if (sub === 'zoom') {
        return { kind: 'viewport', sub: 'zoom', factor: numFlag(rest, 'factor') };
      }
      if (sub === 'show') {
        return { kind: 'viewport', sub: 'show', json: hasFlag(rest, 'json') };
      }
    }

    if (cmd === 'undo') return { kind: 'undo' };
    if (cmd === 'redo') return { kind: 'redo' };

    if (cmd === 'marquee') {
      const marqueeArgs: string[] = [...(sub !== undefined ? [sub] : []), ...rest];
      const rectStr = flag(marqueeArgs, 'rect');
      let rect: { x1: number; y1: number; x2: number; y2: number } | undefined;
      if (rectStr) {
        const parts = rectStr.split(',').map(Number);
        if (parts.length === 4 && parts.every((n) => !isNaN(n))) {
          const [x1, y1, x2, y2] = parts as [number, number, number, number];
          rect = { x1, y1, x2, y2 };
        }
      }
      const del = marqueeArgs.includes('--delete');
      return { kind: 'marquee', rect, delete: del };
    }

    if (cmd === 'theme') {
      if (sub === 'set') {
        return { kind: 'theme', sub: 'set', value: rest[0] };
      }
    }

    if (cmd === 'sfx') {
      if (sub === 'play') return { kind: 'sfx', sub: 'play', clipId: rest[0] };
      if (sub === 'stop') return { kind: 'sfx', sub: 'stop' };
      if (sub === 'list') return { kind: 'sfx', sub: 'list' };
    }

    return null;
  }
}

function parseAt(s: string): { x: number; y: number } | undefined {
  const parts = s.split(',');
  if (parts.length !== 2) return undefined;
  const x = Number(parts[0]);
  const y = Number(parts[1]);
  if (isNaN(x) || isNaN(y)) return undefined;
  return { x, y };
}
