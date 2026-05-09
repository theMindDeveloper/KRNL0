export type SysCommand =
  | { kind: 'board'; sub: 'show' | 'save' | 'load'; path?: string }
  | { kind: 'node'; sub: 'list' | 'add' | 'remove'; nodeKind?: string; id?: string; at?: { x: number; y: number } }
  | { kind: 'pomo'; sub: 'start' | 'stop' | 'status'; label?: string; minutes?: number }
  | { kind: 'todo'; sub: 'add' | 'check' | 'list'; text?: string; id?: string; tag?: string }
  | { kind: 'habit'; sub: 'add' | 'done' | 'streak'; name?: string; date?: string }
  | { kind: 'edge'; sub: 'add' | 'remove' | 'list'; from?: string; to?: string; id?: string; args?: Record<string, string> }
  | { kind: 'say'; text: string }
  | { kind: 'hear' }
  | { kind: 'help' };

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
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
        return {
          kind: 'pomo', sub: 'start',
          label: flag(rest, 'label'),
          minutes: flag(rest, 'minutes') !== undefined ? Number(flag(rest, 'minutes')) : undefined,
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
