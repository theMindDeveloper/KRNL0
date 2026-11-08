// Decision 41 — the orb asks Claude Code (`claude -p --output-format
// stream-json --include-partial-messages`). This turns its JSON lines into
// the few things the orb shows. Pure: no process, no IO.

export type AskEvent =
  | { type: 'text'; text: string }          // more of the answer, as it is written
  | { type: 'tool'; label: string }         // a krnl command it ran ("krnl todo list")
  | { type: 'session'; sessionId: string }  // the conversation, to continue it
  | { type: 'done'; text: string; sessionId?: string }
  | { type: 'error'; code: AskErrorCode; message: string };

export type AskErrorCode = 'not-installed' | 'not-signed-in' | 'timeout' | 'cancelled' | 'failed';

export const ASK_MESSAGES: Record<Exclude<AskErrorCode, 'failed'>, string> = {
  'not-installed': 'Claude Code isn\'t installed on this computer. Install it from claude.com/claude-code, then ask again.',
  'not-signed-in': 'Claude Code isn\'t signed in yet. Open the Terminal, run "claude" once and sign in, then ask again.',
  timeout: 'That took too long (over 3 minutes), so I stopped. Try a shorter question.',
  cancelled: 'Stopped.',
};

type Json = Record<string, unknown>;
const obj = (v: unknown): Json | null => (v && typeof v === 'object' ? (v as Json) : null);

/** A tool call as one short line: the krnl command itself, else the tool's name. */
export function toolLabel(name: unknown, input: unknown): string {
  const cmd = obj(input)?.['command'];
  if (typeof cmd === 'string' && cmd.trim()) return cmd.trim().split('\n')[0]!.slice(0, 80);
  return typeof name === 'string' ? name : 'a tool';
}

const SIGNED_OUT = /not (?:logged|signed) in|please run \/login|invalid api key|authentication|unauthorized|\/login/i;

/** One stream-json line → what the orb shows (zero or more events). */
export function parseClaudeLine(line: string): AskEvent[] {
  const s = line.trim();
  if (!s) return [];
  let e: Json;
  try { e = JSON.parse(s) as Json; } catch { return []; }
  const type = e['type'];
  if (type === 'system' && e['subtype'] === 'init' && typeof e['session_id'] === 'string') {
    return [{ type: 'session', sessionId: e['session_id'] }];
  }
  if (type === 'stream_event') {
    const ev = obj(e['event']);
    const delta = obj(ev?.['delta']);
    if (ev?.['type'] === 'content_block_delta' && delta?.['type'] === 'text_delta' && typeof delta['text'] === 'string') {
      return [{ type: 'text', text: delta['text'] }];
    }
    return [];
  }
  if (type === 'assistant') {
    // Text already arrived as deltas; the full message only adds tool calls.
    const content = obj(e['message'])?.['content'];
    if (!Array.isArray(content)) return [];
    return content
      .map(obj)
      .filter((c): c is Json => !!c && c['type'] === 'tool_use')
      .map((c) => ({ type: 'tool' as const, label: toolLabel(c['name'], c['input']) }));
  }
  if (type === 'result') {
    const text = typeof e['result'] === 'string' ? e['result'] : '';
    const sessionId = typeof e['session_id'] === 'string' ? e['session_id'] : undefined;
    if (e['is_error'] === true || (typeof e['subtype'] === 'string' && e['subtype'] !== 'success')) {
      if (SIGNED_OUT.test(text)) return [{ type: 'error', code: 'not-signed-in', message: ASK_MESSAGES['not-signed-in'] }];
      return [{ type: 'error', code: 'failed', message: text.trim() || `Claude stopped (${String(e['subtype'] ?? 'error')}).` }];
    }
    return [{ type: 'done', text, ...(sessionId ? { sessionId } : {}) }];
  }
  return [];
}

/** What went wrong when the process ended without a result. */
export function exitError(stderr: string, code: number | null): AskEvent {
  if (SIGNED_OUT.test(stderr)) return { type: 'error', code: 'not-signed-in', message: ASK_MESSAGES['not-signed-in'] };
  if (/not recognized as an internal or external command|command not found|ENOENT/i.test(stderr)) {
    return { type: 'error', code: 'not-installed', message: ASK_MESSAGES['not-installed'] };
  }
  const last = stderr.trim().split('\n').filter(Boolean).pop() ?? '';
  return { type: 'error', code: 'failed', message: last ? `Claude stopped: ${last.slice(0, 200)}` : `Claude stopped (exit ${code ?? '?'}).` };
}

/** A session id we accept back from the renderer (it goes on the command line). */
export function isSessionId(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
