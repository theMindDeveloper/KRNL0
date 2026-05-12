export type SysCommand =
  | { kind: 'board'; sub: 'show' | 'save' | 'load'; path: string | undefined }
  | { kind: 'node'; sub: 'list' }
  | { kind: 'node'; sub: 'remove'; id: string | undefined }
  | { kind: 'node'; sub: 'add'; nodeKind: string | undefined; at: { x: number; y: number } | undefined }
  | { kind: 'pomo'; sub: 'stop' | 'status' }
  | { kind: 'pomo'; sub: 'start'; label: string | undefined; minutes: number | undefined }
  | { kind: 'todo'; sub: 'list' }
  | { kind: 'todo'; sub: 'check'; id: string | undefined }
  | { kind: 'todo'; sub: 'add'; text: string | undefined; tag: string | undefined }
  | { kind: 'habit'; sub: 'add' | 'streak'; name: string | undefined }
  | { kind: 'habit'; sub: 'done'; name: string | undefined; date: string | undefined }
  | { kind: 'edge'; sub: 'list' }
  | { kind: 'edge'; sub: 'remove'; id: string | undefined }
  | { kind: 'edge'; sub: 'add'; from: string | undefined; to: string | undefined }
  | { kind: 'text'; sub: 'add'; text: string | undefined; at: { x: number; y: number } | undefined }
  | { kind: 'text'; sub: 'set'; id: string | undefined; text: string | undefined }
  | { kind: 'text'; sub: 'resize'; id: string | undefined; w: number | undefined; h: number | undefined }
  | { kind: 'image'; sub: 'add'; path: string | undefined; at: { x: number; y: number } | undefined }
  | { kind: 'image'; sub: 'replace'; id: string | undefined; path: string | undefined }
  | { kind: 'image'; sub: 'resize'; id: string | undefined; w: number | undefined; h: number | undefined }
  | { kind: 'image'; sub: 'clear'; id: string | undefined }
  | { kind: 'say'; text: string }
  | { kind: 'hear' }
  | { kind: 'help' };

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

export class SysParser {
  static parse(argv: string[]): SysCommand | null {
    const [cmd, sub, ...rest] = argv;

    if (!cmd || cmd === 'help') return { kind: 'help' };
    if (cmd === 'say')  return { kind: 'say', text: [sub, ...rest].filter(Boolean).join(' ') };
    if (cmd === 'hear') return { kind: 'hear' };

    if (cmd === 'board') {
      if (sub === 'show' || sub === 'save' || sub === 'load') {
        return { kind: 'board', sub, path: rest[0] };
      }
    }

    if (cmd === 'node') {
      if (sub === 'list')   return { kind: 'node', sub: 'list' };
      if (sub === 'remove') return { kind: 'node', sub: 'remove', id: rest[0] };
      if (sub === 'add') {
        const atStr = flag(rest, 'at');
        const at = atStr ? parseAt(atStr) : undefined;
        return { kind: 'node', sub: 'add', nodeKind: rest[0], at };
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
      if (sub === 'list')  return { kind: 'todo', sub: 'list' };
      if (sub === 'check') return { kind: 'todo', sub: 'check', id: rest[0] };
      if (sub === 'add') {
        return { kind: 'todo', sub: 'add', text: rest[0], tag: flag(rest, 'tag') };
      }
    }

    if (cmd === 'habit') {
      if (sub === 'add')    return { kind: 'habit', sub: 'add', name: rest[0] };
      if (sub === 'streak') return { kind: 'habit', sub: 'streak', name: rest[0] };
      if (sub === 'done') {
        return { kind: 'habit', sub: 'done', name: rest[0], date: flag(rest, 'date') };
      }
    }

    if (cmd === 'edge') {
      if (sub === 'list')   return { kind: 'edge', sub: 'list' };
      if (sub === 'remove') return { kind: 'edge', sub: 'remove', id: rest[0] };
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
