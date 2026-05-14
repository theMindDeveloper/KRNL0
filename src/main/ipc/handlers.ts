import { app, ipcMain, BrowserWindow } from 'electron';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { randomUUID } from 'crypto';
import * as pty from 'node-pty';
import { SysFacade } from '../../sys/SysFacade';
import { loadBoardFrom, saveBoardTo } from '../persistence/board';
import { renderMotd } from '../rpc/motd';
import type { RpcServer } from '../rpc/server';

// Read version once at module load (package.json is bundled into resources).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const APP_VERSION: string = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pkg = require('../../../package.json') as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
})();

// Board location — isolated per Electron app name so multiple worktrees
// (e.g. main vs feat/new-features) don't share the same board.json.
// Override with KRNL0_BOARD_DIR for explicit per-instance dev paths.
const BOARD_DIR = process.env.KRNL0_BOARD_DIR
  ?? join(homedir(), 'Documents', app.getName());
const BOARD_PATH = join(BOARD_DIR, 'board.json');

// Expose the resolved path to SysFacade and CLI invocations (sys habit ...)
// so they read/write the same board.json the renderer does.
process.env['KRNL0_BOARD_PATH'] = BOARD_PATH;

// Active PTY sessions keyed by sessionId
const ptySessions = new Map<string, pty.IPty>();

// Phase 2: renderer-coupled dispatch. Set by registerHandlers().
// Used by SysFacade for viewport/undo/redo/theme commands.
export type CliDispatchFn = (
  command: string,
  args: Record<string, unknown>,
) => Promise<{ ok: boolean; message: string; exitCode?: number }>;

let cliDispatchFn: CliDispatchFn | null = null;

export function getCliDispatch(): CliDispatchFn | null {
  return cliDispatchFn;
}

function loadBoard() {
  return loadBoardFrom(BOARD_PATH);
}

function saveBoard(data: unknown) {
  saveBoardTo(BOARD_PATH, data);
}

function broadcastBoardReload(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('board:reload');
  }
}

function hasOpenRenderer(): boolean {
  return BrowserWindow.getAllWindows().length > 0;
}

export function registerHandlers(rpcServer?: RpcServer): void {
  ipcMain.handle('board:load', async () => {
    return loadBoard();
  });

  ipcMain.handle('board:save', async (_event, data: unknown) => {
    saveBoard(data);
  });

  ipcMain.handle('board:saveViewport', async (_event, viewport: unknown) => {
    const board = loadBoard();
    const merged = typeof board === 'object' && board !== null
      ? { ...(board as Record<string, unknown>), viewport, savedAt: new Date().toISOString() }
      : { viewport, savedAt: new Date().toISOString() };
    saveBoard(merged);
  });

  ipcMain.handle('sys:run', async (_event, argv: string[]) => {
    const facade = new SysFacade({
      boardPath: BOARD_PATH,
      hasOpenRenderer,
      onBoardChanged: broadcastBoardReload,
      ...(cliDispatchFn ? { cliDispatch: cliDispatchFn } : {}),
    });
    const result = await facade.run(argv);
    return { ok: result.ok, message: result.message ?? '' };
  });

  // cli:dispatch — main→renderer command dispatch for renderer-coupled commands.
  // Used by Phase 2 CLI commands (viewport/undo/redo/theme/marquee/node.move).
  // Main sends cli:dispatch:request to all windows, waits up to 5s for reply.
  const pendingCliDispatches = new Map<string, {
    resolve: (result: { ok: boolean; message: string }) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();

  ipcMain.on('cli:dispatch:reply', (_event, id: string, ok: boolean, message: string) => {
    const pending = pendingCliDispatches.get(id);
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingCliDispatches.delete(id);
    pending.resolve({ ok, message });
  });

  /**
   * Dispatch a command to the renderer. Returns ok=false + exit-code 2 if no
   * renderer window is open (T27, T28, T31).
   */
  async function cliDispatch(
    command: string,
    args: Record<string, unknown>,
  ): Promise<{ ok: boolean; message: string; exitCode?: number }> {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length === 0) {
      return {
        ok: false,
        message: `${command} requires an open renderer window`,
        exitCode: 2,
      };
    }
    const id = randomUUID();
    const result = await new Promise<{ ok: boolean; message: string }>((resolve) => {
      const timer = setTimeout(() => {
        pendingCliDispatches.delete(id);
        resolve({ ok: false, message: `cli:dispatch timeout for ${command}` });
      }, 5000);
      pendingCliDispatches.set(id, { resolve, timer });
      for (const win of windows) {
        win.webContents.send('cli:dispatch:request', id, command, args);
      }
    });
    return result;
  }

  // Expose cliDispatch on the facade so sys:run can use it for Phase 2 commands.
  // We attach it to the ipcMain context via a module-level variable.
  cliDispatchFn = cliDispatch;

  ipcMain.handle('brain:ask', async (_event, prompt: string) => {
    // TODO (Week 5): route to active BrainProvider instance (created by BrainFactory)
    void prompt;
    return '';
  });

  ipcMain.handle('voice:startListening', async () => {
    // TODO (Week 5): begin mic capture, buffer audio
  });

  ipcMain.handle('voice:stopListening', async () => {
    // TODO (Week 5): stop mic, pass buffer to WhisperProvider.transcribe(), return transcript
    return '';
  });

  ipcMain.handle('voice:speak', async (_event, text: string) => {
    // TODO (Week 6): invoke PiperProvider.speak(text)
    void text;
  });

  // pty:create — spawn a real PTY-backed shell via node-pty (Decision 12 / Decision 18)
  ipcMain.handle('pty:create', (event, cols: number, rows: number) => {
    const sessionId = randomUUID();

    // Default shell selection (Decision 12 §Default shell):
    //   Windows  — PowerShell (modern shell, proper TTY behaviour, ANSI colors,
    //              history, tab completion). cmd.exe is intentionally NOT the
    //              default — its TTY semantics are inferior and it requires
    //              extra translation layers (see PR #70 for the 0x7f→0x08 hack
    //              that was only needed because of cmd.exe).
    //   POSIX    — $SHELL, falling back to /bin/zsh.
    //   Override — KRNL0_SHELL env var wins on every platform; set it to
    //              "cmd.exe", "pwsh.exe", "/bin/bash", etc. as needed.
    const isWin = process.platform === 'win32';
    const shell = process.env['KRNL0_SHELL']
      ?? (isWin ? 'powershell.exe' : (process.env['SHELL'] ?? '/bin/zsh'));

    // Working directory (issue #74): default to the project root so
    // `claude` and other CLIs can read CLAUDE.md and board.json without an
    // explicit `cd`. process.cwd() is the repo root in dev (electron-vite
    // is launched from there) and the resources/install dir in a packaged
    // build. KRNL0_TERM_CWD overrides for users who want a fixed directory.
    let cwd = process.env['KRNL0_TERM_CWD'] ?? process.cwd();
    try {
      if (!existsSync(cwd)) {
        cwd = process.env['USERPROFILE'] ?? process.env['HOME'] ?? homedir();
      }
    } catch {
      cwd = homedir();
    }

    // node-pty throws a bare "posix_spawnp failed." on POSIX with no errno
    // attached, which is useless when the user is reporting the bug from a
    // screenshot. Surface every input that could be at fault so the next
    // failure tells us *what* failed, not just *that* spawn failed. Decision
    // 12 §Re-affirmed forbids fallback paths (silent fallback hides bugs),
    // so we fail loudly with a rich message instead of trying alternates.
    let shellExists = false;
    try { shellExists = isWin ? true : existsSync(shell); } catch { /* ignore */ }
    let cwdExists = false;
    try { cwdExists = existsSync(cwd); } catch { /* ignore */ }

    // Build child environment: inherit process.env, then prepend KRNL0_CLI_DIR
    // to PATH so the krnl binary is reachable (T7), and inject RPC credentials.
    const isWin32 = process.platform === 'win32';
    const pathKey = isWin32 ? 'Path' : 'PATH';
    const existingPath = (process.env[pathKey] ?? process.env['PATH'] ?? '');
    const cliDir = process.env['KRNL0_CLI_DIR'] ?? '';
    const newPath = cliDir ? `${cliDir}${isWin32 ? ';' : ':'}${existingPath}` : existingPath;
    const childEnv: Record<string, string> = Object.fromEntries(
      Object.entries(process.env).filter(([, v]) => v !== undefined) as [string, string][],
    );
    if (cliDir) childEnv[pathKey] = newPath;
    if (rpcServer) {
      childEnv['KRNL0_RPC_SOCKET'] = rpcServer.socketPath;
      childEnv['KRNL0_RPC_TOKEN']  = rpcServer.token;
    }
    childEnv['KRNL0_MAIN_PID'] = String(process.pid);

    // PowerShell launch flags:
    //  -NoLogo : suppress the multi-line copyright banner that would
    //            otherwise dominate the terminal viewport.
    //  -NoExit -File "krnl-init.ps1" : load profile, then run our init
    //            script (which lives in $KRNL0_CLI_DIR), then drop to
    //            interactive. The script disables PSReadLine's inline
    //            prediction feature (the "first-2-chars-then-gap" visual
    //            artifact users reported) but KEEPS PSReadLine itself
    //            loaded so syntax coloring, tab completion, and screen
    //            clearing (cls / Clear-Host) all work normally.
    //
    // Why a file and not -Command: node-pty's Windows command-line
    // serialization mangles -Command payloads that contain braces or
    // quotes. Passing -File path-to-a-script.ps1 is just a path — a
    // single safe argv item with no quoting hazards.
    //
    // Opt-out: KRNL0_KEEP_PSREADLINE_PREDICTION=1 in env before app
    // launch, or `Set-PSReadLineOption -PredictionSource History` at
    // the prompt.
    //
    // Only applies to powershell.exe / pwsh.exe; cmd.exe and POSIX shells
    // ignore these flags.
    const shellArgs: string[] = (() => {
      const base = shell.toLowerCase();
      const isPwsh = base.endsWith('powershell.exe') || base.endsWith('pwsh.exe')
        || base === 'powershell' || base === 'pwsh';
      if (!isPwsh) return [];
      const args = ['-NoLogo'];
      const cliDir = process.env['KRNL0_CLI_DIR'];
      if (cliDir && process.env['KRNL0_KEEP_PSREADLINE_PREDICTION'] !== '1') {
        args.push('-NoExit', '-File', join(cliDir, 'krnl-init.ps1'));
      }
      return args;
    })();

    let proc: pty.IPty;
    try {
      proc = pty.spawn(shell, shellArgs, {
        cols,
        rows,
        cwd,
        env: childEnv,
        name: 'xterm-color',
      });
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      const diag = [
        `[pty:create] spawn failed`,
        `  platform : ${process.platform} ${process.arch}`,
        `  shell    : ${shell} (exists=${shellExists})`,
        `  cwd      : ${cwd} (exists=${cwdExists})`,
        `  $SHELL   : ${process.env['SHELL'] ?? '<unset>'}`,
        `  KRNL0_SHELL : ${process.env['KRNL0_SHELL'] ?? '<unset>'}`,
        `  KRNL0_TERM_CWD : ${process.env['KRNL0_TERM_CWD'] ?? '<unset>'}`,
        `  error    : ${e?.message ?? String(err)}`,
        e?.code ? `  code     : ${e.code}` : '',
        typeof e?.errno === 'number' ? `  errno    : ${e.errno}` : '',
      ].filter(Boolean).join('\n');
      // Visible in `npm run dev` terminal — primary diagnostic surface.
      console.error(diag);
      // Propagate to renderer so session.ts can render it inside the xterm
      // body. Devtools-only diagnostics are useless when the user is
      // debugging from a screenshot.
      throw new Error(diag);
    }

    // Guard every send against a destroyed sender — during app quit the PTY
    // can emit one last chunk after the BrowserWindow's webContents has been
    // torn down, raising "Object has been destroyed" in node-pty's emitter
    // and crashing the main process with an Uncaught Exception dialog.
    const safeSend = (channel: string, ...args: unknown[]): void => {
      if (event.sender.isDestroyed()) return;
      try {
        event.sender.send(channel, ...args);
      } catch {
        // Race: sender destroyed between isDestroyed check and send.
      }
    };

    proc.onData((data: string) => {
      safeSend(`pty:data:${sessionId}`, data);
    });

    proc.onExit(() => {
      ptySessions.delete(sessionId);
      safeSend(`pty:exit:${sessionId}`);
    });

    ptySessions.set(sessionId, proc);

    // T1–T6: build MOTD and include in the reply so the renderer writes it
    // synchronously before subscribing to pty:data (avoids any IPC race).
    // Pass rows so renderMotd falls back to the compact form on short viewports
    // (otherwise the 9-row wide banner scrolls into scrollback when the shell
    // prompt arrives).
    const motd = process.env['KRNL0_NO_MOTD'] === '1'
      ? ''
      : renderMotd({ version: APP_VERSION, sessionId, cols, rows });
    return { sessionId, motd };
  });

  // pty:write — send keystrokes directly to the PTY (not stdin.write)
  ipcMain.handle('pty:write', (_event, sessionId: string, data: string) => {
    const proc = ptySessions.get(sessionId);
    if (!proc) return;
    proc.write(data);
  });

  // pty:resize — resize the underlying PTY (no longer a no-op, F13)
  ipcMain.handle('pty:resize', (_event, sessionId: string, cols: number, rows: number) => {
    const proc = ptySessions.get(sessionId);
    if (!proc) return;
    proc.resize(cols, rows);
  });

  // pty:kill — terminate the PTY process for a session (F15)
  ipcMain.handle('pty:kill', (_event, sessionId: string) => {
    const proc = ptySessions.get(sessionId);
    if (proc) {
      proc.kill();
      ptySessions.delete(sessionId);
    }
  });

  // Clean up all PTY sessions on app quit (Decision 12 §7)
  app.on('before-quit', () => {
    ptySessions.forEach((p) => p.kill());
    ptySessions.clear();
  });
}
