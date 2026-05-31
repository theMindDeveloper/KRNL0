export type SysCommand =
  | { kind: 'board'; sub: 'show' | 'summary' | 'stats'; json: boolean }
  | { kind: 'board'; sub: 'save' | 'load'; path: string | undefined }
  | { kind: 'node'; sub: 'list'; nodeKind: string | undefined; motherOnly: boolean; childOnly: boolean; json: boolean }
  | { kind: 'node'; sub: 'read'; id: string | undefined; json: boolean }
  | { kind: 'node'; sub: 'remove'; id: string | undefined; force: boolean }
  | { kind: 'node'; sub: 'set-position'; id: string | undefined; x: number | undefined; y: number | undefined }
  | { kind: 'node'; sub: 'add'; nodeKind: string | undefined; at: { x: number; y: number } | undefined }
  | { kind: 'pomo'; sub: 'stop' | 'status' | 'break' | 'extend' }
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
  | { kind: 'text'; sub: 'add'; text: string | undefined; at: { x: number; y: number } | undefined; near: string | undefined }
  | { kind: 'text'; sub: 'set'; id: string | undefined; text: string | undefined }
  | { kind: 'text'; sub: 'resize'; id: string | undefined; w: number | undefined; h: number | undefined }
  | { kind: 'image'; sub: 'add'; path: string | undefined; at: { x: number; y: number } | undefined; near: string | undefined }
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
  | { kind: 'help'; group: string | undefined; sub: string | undefined }
  // Decision 29 — new commands
  | { kind: 'task'; sub: 'kind'; ref: string | undefined; taskKind: 'focus' | 'event' | undefined }
  | { kind: 'task'; sub: 'note'; ref: string | undefined; text: string | undefined; clear: boolean }
  | { kind: 'habit'; sub: 'rename'; ref: string | undefined; newName: string | undefined }
  | { kind: 'habit'; sub: 'icon'; ref: string | undefined; icon: string | undefined; clear: boolean }
  | { kind: 'habit'; sub: 'note'; ref: string | undefined; text: string | undefined; clear: boolean }
  | {
      kind: 'habit';
      sub: 'schedule';
      ref: string | undefined;
      scheduleKind: 'daily' | 'weekly' | 'weekdays';
      days: number[] | undefined;
      /** Set to a non-empty string describing the invalid token when strict CSV parsing fails. */
      invalidDays: string | undefined;
      at: string | undefined;
      durationMin: number | undefined;
    }
  | { kind: 'habit'; sub: 'unschedule'; ref: string | undefined }
  | { kind: 'habit'; sub: 'archive'; ref: string | undefined }
  | { kind: 'habit'; sub: 'show'; ref: string | undefined; json: boolean }
  | { kind: 'habit'; sub: 'pin'; ref: string | undefined }
  | { kind: 'habit'; sub: 'unpin'; ref: string | undefined }
  | { kind: 'pomo'; sub: 'config'; session: number | undefined; short: number | undefined; long: number | undefined; every: number | undefined; face: string | undefined }
  | {
      kind: 'frame';
      sub: 'add';
      label: string | undefined;
      at: { x: number; y: number } | undefined;
      w: number | undefined;
      h: number | undefined;
      tint: string | undefined;
      near: string | undefined;
    }
  | { kind: 'frame'; sub: 'label'; ref: string | undefined; label: string | undefined }
  | { kind: 'frame'; sub: 'resize'; ref: string | undefined; w: number | undefined; h: number | undefined }
  | { kind: 'frame'; sub: 'tint'; ref: string | undefined; tint: string | undefined }
  | { kind: 'frame'; sub: 'list'; json: boolean }
  | { kind: 'frame'; sub: 'contents'; ref: string | undefined; json: boolean }
  | { kind: 'frame'; sub: 'fit'; ref: string | undefined; padding: number | undefined }
  | { kind: 'analytics'; sub: 'show'; view: string | undefined; range: number | undefined; metric: string | undefined; json: boolean }
  | { kind: 'analytics'; sub: 'totals'; range: number | undefined; json: boolean }
  | { kind: 'analytics'; sub: 'streaks'; json: boolean }
  | { kind: 'log'; sub: 'tail'; limit: number | undefined; json: boolean }
  | { kind: 'log'; sub: 'stats'; json: boolean }
  | { kind: 'theme'; sub: 'show'; json: boolean }
;

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
      if (sub === 'stop' || sub === 'status' || sub === 'break' || sub === 'extend')
        return { kind: 'pomo', sub };
      if (sub === 'start') {
        const minutesRaw = flag(rest, 'minutes');
        return {
          kind: 'pomo', sub: 'start',
          label: flag(rest, 'label'),
          minutes: minutesRaw !== undefined ? Number(minutesRaw) : undefined,
        };
      }
      // Decision 29 — pomo config
      if (sub === 'config') {
        const allArgs = rest;
        return {
          kind: 'pomo', sub: 'config',
          session: numFlag(allArgs, 'session'),
          short: numFlag(allArgs, 'short'),
          long: numFlag(allArgs, 'long'),
          every: numFlag(allArgs, 'every'),
          face: flag(allArgs, 'face'),
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
      if (sub === 'kind') {
        const kv = rest[1] as string | undefined;
        const taskKind: 'focus' | 'event' | undefined =
          kv === 'focus' || kv === 'event' ? kv : undefined;
        return { kind: 'task', sub: 'kind', ref: rest[0], taskKind };
      }
      if (sub === 'note') {
        const clearFlag = hasFlag(rest, 'clear');
        // text is the first positional arg after ref (rest[0])
        return { kind: 'task', sub: 'note', ref: rest[0], text: rest[1], clear: clearFlag };
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
      // Decision 29 — new habit subcommands
      if (sub === 'rename') {
        return { kind: 'habit', sub: 'rename', ref: rest[0], newName: rest[1] };
      }
      if (sub === 'icon') {
        return { kind: 'habit', sub: 'icon', ref: rest[0], icon: rest[1], clear: hasFlag(rest, 'clear') };
      }
      if (sub === 'note') {
        return { kind: 'habit', sub: 'note', ref: rest[0], text: rest[1], clear: hasFlag(rest, 'clear') };
      }
      if (sub === 'schedule') {
        const ref = rest[0];
        const durRaw = flag(rest, 'duration');
        const durationMin = durRaw !== undefined ? Number(durRaw) : undefined;
        const atVal = flag(rest, 'at');
        if (hasFlag(rest, 'daily')) {
          return { kind: 'habit', sub: 'schedule', ref, scheduleKind: 'daily', days: undefined, invalidDays: undefined, at: atVal, durationMin };
        }
        if (hasFlag(rest, 'weekdays')) {
          return { kind: 'habit', sub: 'schedule', ref, scheduleKind: 'weekdays', days: undefined, invalidDays: undefined, at: atVal, durationMin };
        }
        if (hasFlag(rest, 'weekly')) {
          const daysStr = flag(rest, 'days');
          if (!daysStr) {
            return { kind: 'habit', sub: 'schedule', ref, scheduleKind: 'weekly', days: undefined, invalidDays: 'missing --days', at: atVal, durationMin };
          }
          // Strict CSV parsing (Decision 29 §4): each token must match /^[1-7]$/
          const tokens = daysStr.split(',');
          const dayNums: number[] = [];
          let invalidToken: string | undefined;
          for (const tok of tokens) {
            if (!/^[1-7]$/.test(tok)) {
              invalidToken = tok;
              break;
            }
            dayNums.push(Number(tok));
          }
          if (invalidToken !== undefined) {
            return { kind: 'habit', sub: 'schedule', ref, scheduleKind: 'weekly', days: undefined, invalidDays: invalidToken, at: atVal, durationMin };
          }
          return { kind: 'habit', sub: 'schedule', ref, scheduleKind: 'weekly', days: dayNums, invalidDays: undefined, at: atVal, durationMin };
        }
        // Unknown schedule kind — let handler reject
        return { kind: 'habit', sub: 'schedule', ref, scheduleKind: 'daily', days: undefined, invalidDays: 'missing --daily/--weekly/--weekdays flag', at: atVal, durationMin };
      }
      if (sub === 'unschedule') {
        return { kind: 'habit', sub: 'unschedule', ref: rest[0] };
      }
      if (sub === 'archive') {
        return { kind: 'habit', sub: 'archive', ref: rest[0] };
      }
      if (sub === 'show') {
        return { kind: 'habit', sub: 'show', ref: rest[0], json: hasFlag(rest, 'json') };
      }
      if (sub === 'pin') {
        return { kind: 'habit', sub: 'pin', ref: rest[0] };
      }
      if (sub === 'unpin') {
        return { kind: 'habit', sub: 'unpin', ref: rest[0] };
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
          near: flag(rest, 'near'),
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
          near: flag(rest, 'near'),
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
      // Decision 29 — theme show (headless-capable read)
      if (sub === 'show' || sub === undefined) {
        return { kind: 'theme', sub: 'show', json: hasFlag(rest, 'json') };
      }
    }

    // Decision 29 — frame CRUD
    if (cmd === 'frame') {
      if (sub === 'add') {
        const atStr = flag(rest, 'at');
        return {
          kind: 'frame', sub: 'add',
          label: flag(rest, 'label'),
          at: atStr ? parseAt(atStr) : undefined,
          w: numFlag(rest, 'w'),
          h: numFlag(rest, 'h'),
          tint: flag(rest, 'tint'),
          near: flag(rest, 'near'),
        };
      }
      if (sub === 'label') {
        return { kind: 'frame', sub: 'label', ref: rest[0], label: rest[1] };
      }
      if (sub === 'resize') {
        return { kind: 'frame', sub: 'resize', ref: rest[0], w: numFlag(rest, 'w'), h: numFlag(rest, 'h') };
      }
      if (sub === 'tint') {
        return { kind: 'frame', sub: 'tint', ref: rest[0], tint: rest[1] };
      }
      if (sub === 'list') {
        return { kind: 'frame', sub: 'list', json: hasFlag(rest, 'json') };
      }
      if (sub === 'contents') {
        return { kind: 'frame', sub: 'contents', ref: rest[0], json: hasFlag(rest, 'json') };
      }
      if (sub === 'fit') {
        return { kind: 'frame', sub: 'fit', ref: rest[0], padding: numFlag(rest, 'padding') };
      }
    }

    // Decision 29 — analytics reads
    if (cmd === 'analytics') {
      if (sub === 'show') {
        const rangeRaw = flag(rest, 'range');
        return {
          kind: 'analytics', sub: 'show',
          view: flag(rest, 'view'),
          range: rangeRaw !== undefined ? Number(rangeRaw) : undefined,
          metric: flag(rest, 'metric'),
          json: hasFlag(rest, 'json'),
        };
      }
      if (sub === 'totals') {
        const rangeRaw = flag(rest, 'range');
        return {
          kind: 'analytics', sub: 'totals',
          range: rangeRaw !== undefined ? Number(rangeRaw) : undefined,
          json: hasFlag(rest, 'json'),
        };
      }
      if (sub === 'streaks') {
        return { kind: 'analytics', sub: 'streaks', json: hasFlag(rest, 'json') };
      }
    }

    // Decision 29 — log reads (renderer-required)
    if (cmd === 'log') {
      if (sub === 'tail') {
        return { kind: 'log', sub: 'tail', limit: numFlag(rest, 'limit'), json: hasFlag(rest, 'json') };
      }
      if (sub === 'stats') {
        return { kind: 'log', sub: 'stats', json: hasFlag(rest, 'json') };
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
