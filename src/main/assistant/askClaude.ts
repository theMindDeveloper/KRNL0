// Decision 41 — run one question through Claude Code for the orb.
//
// `claude -p` reads the question on stdin (never a command-line argument:
// no quoting, no injection), answers as stream-json, and may run only `krnl`
// commands. It runs where the terminal runs Claude (the app's claude/ folder,
// so it reads the in-app assistant instructions) with the same environment
// (krnl on PATH, the app's RPC credentials).

import { spawn as nodeSpawn, type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio } from 'child_process';
import { ASK_MESSAGES, exitError, isSessionId, parseClaudeLine, type AskEvent } from '../../shared/assistant/claudeStream';

export interface AskClaudeOptions {
  prompt: string;
  /** Continue this conversation. */
  resume?: string | undefined;
  cwd: string;
  env: Record<string, string>;
  onEvent: (e: AskEvent) => void;
  timeoutMs?: number;
  /** For tests. */
  spawnFn?: (cmd: string, args: string[], opts: SpawnOptionsWithoutStdio) => ChildProcessWithoutNullStreams;
  platform?: NodeJS.Platform;
}

export const ASK_TIMEOUT_MS = 3 * 60_000;

/** The orb's panel is small: short, plain answers (added to the in-app instructions). */
export const ORB_STYLE = "You are answering in KRNL0's orb chat panel, a small box. Reply in one to three short plain sentences. No markdown tables, no headings, no code blocks unless asked. Say what you changed on the board, if anything.";

export function claudeArgs(resume?: string): string[] {
  return [
    '-p',
    '--output-format', 'stream-json',
    '--verbose',
    '--include-partial-messages',
    // Only krnl: it can read and change the board, nothing else on the computer.
    '--allowedTools', 'Bash(krnl:*)',
    '--append-system-prompt', ORB_STYLE,
    ...(resume && isSessionId(resume) ? ['--resume', resume] : []),
  ];
}

/** Starts the question; returns a function that cancels it. Every run ends with exactly one done or error event. */
export function askClaude(o: AskClaudeOptions): () => void {
  const spawnFn = o.spawnFn ?? ((cmd, args, opts) => nodeSpawn(cmd, args, opts));
  const isWin = (o.platform ?? process.platform) === 'win32';
  let ended = false;
  const end = (e: AskEvent): void => {
    if (ended) return;
    ended = true;
    clearTimeout(timer);
    o.onEvent(e);
  };

  let child: ChildProcessWithoutNullStreams;
  try {
    // On Windows `claude` is a .cmd shim, which needs the shell; every argument
    // here is a fixed flag or a checked session id, the question goes on stdin.
    // Through the shell, arguments are joined unquoted: quote the ones with
    // spaces (all fixed text without quote marks; the question is on stdin).
    const args = claudeArgs(o.resume).map((x) => (isWin && /\s/.test(x) ? `"${x}"` : x));
    child = spawnFn('claude', args, { cwd: o.cwd, env: o.env, shell: isWin, windowsHide: true });
  } catch (err) {
    o.onEvent({ type: 'error', code: 'not-installed', message: ASK_MESSAGES['not-installed'] });
    void err;
    return () => {};
  }

  const timer = setTimeout(() => {
    end({ type: 'error', code: 'timeout', message: ASK_MESSAGES.timeout });
    try { child.kill(); } catch { /* already gone */ }
  }, o.timeoutMs ?? ASK_TIMEOUT_MS);

  let buf = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    buf += chunk;
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      for (const e of parseClaudeLine(line)) {
        if (e.type === 'done' || e.type === 'error') end(e);
        else if (!ended) o.onEvent(e);
      }
    }
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => { stderr = (stderr + chunk).slice(-4000); });
  child.on('error', (err: NodeJS.ErrnoException) => {
    end(err.code === 'ENOENT' ? { type: 'error', code: 'not-installed', message: ASK_MESSAGES['not-installed'] } : exitError(String(err.message), null));
  });
  child.on('close', (code) => {
    for (const e of parseClaudeLine(buf)) if (e.type === 'done' || e.type === 'error') end(e);
    end(exitError(stderr, code));
  });

  child.stdin.on('error', () => { /* the process may close stdin early on errors */ });
  child.stdin.end(o.prompt);

  return () => {
    end({ type: 'error', code: 'cancelled', message: ASK_MESSAGES.cancelled });
    try { child.kill(); } catch { /* already gone */ }
  };
}

export type ClaudeStatus = 'ready' | 'not-installed' | 'not-signed-in' | 'unknown';

/**
 * Is Claude Code here and signed in? `claude auth status --json` — free, no
 * question asked. Only the status leaves this function (never the account).
 */
export function claudeStatus(o: { cwd: string; env: Record<string, string>; spawnFn?: AskClaudeOptions['spawnFn']; platform?: NodeJS.Platform; timeoutMs?: number }): Promise<ClaudeStatus> {
  const spawnFn = o.spawnFn ?? ((cmd, args, opts) => nodeSpawn(cmd, args, opts));
  const isWin = (o.platform ?? process.platform) === 'win32';
  return new Promise((resolve) => {
    let done = false;
    const finish = (s: ClaudeStatus) => { if (!done) { done = true; clearTimeout(timer); resolve(s); } };
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawnFn('claude', ['auth', 'status', '--json'], { cwd: o.cwd, env: o.env, shell: isWin, windowsHide: true });
    } catch { finish('not-installed'); return; }
    const timer = setTimeout(() => { finish('unknown'); try { child.kill(); } catch { /* gone */ } }, o.timeoutMs ?? 15_000);
    let out = '';
    let err = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (c: string) => { out += c; });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (c: string) => { err += c; });
    child.stdin.end();
    child.on('error', (e: NodeJS.ErrnoException) => finish(e.code === 'ENOENT' ? 'not-installed' : 'unknown'));
    child.on('close', () => {
      if (/not recognized as an internal or external command|command not found/i.test(err + out)) { finish('not-installed'); return; }
      try {
        const j = JSON.parse(out.slice(out.indexOf('{'))) as { loggedIn?: unknown };
        finish(j.loggedIn === true ? 'ready' : 'not-signed-in');
      } catch { finish('unknown'); }
    });
  });
}
