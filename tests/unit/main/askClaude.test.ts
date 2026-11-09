/** Decision 41 — the orb asks Claude Code (orb-ask.md F1–F8). */
import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import { askClaude, claudeArgs } from '../../../src/main/assistant/askClaude';
import { parseClaudeLine, exitError, isSessionId, type AskEvent } from '../../../src/shared/assistant/claudeStream';

const SID = 'f72264ff-ed99-489b-b6f7-614992698518';
const line = (o: unknown) => `${JSON.stringify(o)}\n`;

/** A fake `claude` process: we write its stdout/stderr and close it. */
function fakeProc() {
  const proc = new EventEmitter() as EventEmitter & { stdout: PassThrough; stderr: PassThrough; stdin: PassThrough; kill: () => void; killed?: boolean };
  proc.stdout = new PassThrough();
  proc.stderr = new PassThrough();
  proc.stdin = new PassThrough();
  proc.kill = vi.fn(() => { proc.killed = true; });
  return proc;
}
const flush = () => new Promise((r) => setTimeout(r, 10));

describe('stream parser', () => {
  it('F1: text arrives as deltas; the result ends it with the session', () => {
    expect(parseClaudeLine(JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'hel' } } }))).toEqual([{ type: 'text', text: 'hel' }]);
    expect(parseClaudeLine(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'hello', session_id: SID }))).toEqual([{ type: 'done', text: 'hello', sessionId: SID }]);
    expect(parseClaudeLine(JSON.stringify({ type: 'system', subtype: 'init', session_id: SID }))).toEqual([{ type: 'session', sessionId: SID }]);
  });
  it('F3: a krnl command shows as its own line', () => {
    const e = parseClaudeLine(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'x' }, { type: 'tool_use', name: 'Bash', input: { command: 'krnl todo list\nmore' } }] } }));
    expect(e).toEqual([{ type: 'tool', label: 'krnl todo list' }]);
  });
  it('F6: errors say what to do', () => {
    expect(parseClaudeLine(JSON.stringify({ type: 'result', subtype: 'success', is_error: true, result: 'Invalid API key · Please run /login' }))[0]).toMatchObject({ type: 'error', code: 'not-signed-in' });
    expect(exitError("'claude' is not recognized as an internal or external command", 1)).toMatchObject({ code: 'not-installed' });
    expect(exitError('boom\nlast line', 2)).toMatchObject({ code: 'failed', message: 'Claude stopped: last line' });
    expect(parseClaudeLine('not json')).toEqual([]);
  });
  it('only a real session id goes back on the command line', () => {
    expect(isSessionId(SID)).toBe(true);
    expect(isSessionId('x; rm -rf /')).toBe(false);
    expect(claudeArgs('x; rm')).not.toContain('--resume');
    expect(claudeArgs(SID)).toEqual(expect.arrayContaining(['--resume', SID]));
  });
});

describe('askClaude', () => {
  const run = (extra: Partial<Parameters<typeof askClaude>[0]> = {}) => {
    const proc = fakeProc();
    const events: AskEvent[] = [];
    let args: string[] = [];
    let stdin = '';
    proc.stdin.on('data', (c: Buffer) => { stdin += c.toString(); });
    const cancel = askClaude({
      prompt: 'what is on today?', cwd: '/app/claude', env: {}, onEvent: (e) => events.push(e),
      spawnFn: ((_cmd: string, a: string[]) => { args = a; return proc; }) as never,
      platform: 'linux',
      ...extra,
    });
    return { proc, events, cancel, get args() { return args; }, get stdin() { return stdin; } };
  };

  it('F8 + F2: the question goes on stdin; only krnl is allowed', async () => {
    const r = run();
    await flush();
    expect(r.stdin).toBe('what is on today?');
    expect(r.args).not.toContain('what is on today?');
    expect(r.args).toEqual(expect.arrayContaining(['-p', '--allowedTools', 'Bash(krnl:*)', '--include-partial-messages']));
  });

  it('F1 + F3: streams text and tools, ends once with done', async () => {
    const r = run();
    r.proc.stdout.write(line({ type: 'system', subtype: 'init', session_id: SID }));
    r.proc.stdout.write(line({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'You have ' } } }));
    r.proc.stdout.write(line({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'krnl todo list' } }] } }));
    // a line split across chunks still parses
    const last = line({ type: 'result', subtype: 'success', is_error: false, result: 'You have 2 plans.', session_id: SID });
    r.proc.stdout.write(last.slice(0, 20));
    r.proc.stdout.write(last.slice(20));
    await flush();
    r.proc.emit('close', 0);
    expect(r.events.map((e) => e.type)).toEqual(['session', 'text', 'tool', 'done']);
  });

  it('F6: claude missing → not installed', async () => {
    const r = run();
    const err = Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' });
    r.proc.emit('error', err);
    r.proc.emit('close', -2);
    expect(r.events).toEqual([expect.objectContaining({ type: 'error', code: 'not-installed' })]);
  });

  it('F5: a slow answer stops; Stop cancels; each ends once', async () => {
    const slow = run({ timeoutMs: 20 });
    await new Promise((res) => setTimeout(res, 40));
    expect(slow.events).toEqual([expect.objectContaining({ code: 'timeout' })]);
    expect(slow.proc.kill).toHaveBeenCalled();
    slow.proc.emit('close', 1);
    expect(slow.events).toHaveLength(1);

    const r = run();
    r.cancel();
    r.proc.emit('close', null);
    expect(r.events).toEqual([expect.objectContaining({ code: 'cancelled' })]);
  });
});
