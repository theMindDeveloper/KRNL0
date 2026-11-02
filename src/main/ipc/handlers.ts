import { app, ipcMain, BrowserWindow, clipboard } from 'electron';
import { existsSync } from 'fs';
import { join, sep } from 'path';
import { homedir } from 'os';
import { randomUUID } from 'crypto';
import * as pty from 'node-pty';
import { SysFacade } from '../../sys/SysFacade';
import { loadBoardFrom, saveBoardTo, seedBoard, RendererRevGuard } from '../persistence/board';
import { notifyBoardChanged } from '../boardIo';
import { mergeBoards } from '../../shared/boardMerge';
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

// Board location. `npm run dev` (scripts/dev.mjs) sets KRNL0_BOARD_DIR to the
// worktree's own .krnl0-data/, which is what isolates worktrees from each
// other. Without it (packaged builds, `npm run dev:shared`) every instance
// shares ~/Documents/<app name>/ — the app name is the same in all worktrees.
const BOARD_DIR = process.env.KRNL0_BOARD_DIR
  ?? join(homedir(), 'Documents', app.getName());
const BOARD_PATH = join(BOARD_DIR, 'board.json');

// Expose the resolved path to SysFacade and CLI invocations (sys habit ...)
// so they read/write the same board.json the renderer does.
process.env['KRNL0_BOARD_PATH'] = BOARD_PATH;

// Active PTY sessions keyed by sessionId
const ptySessions = new Map<string, pty.IPty>();
// Which renderer owns each session. A reload, navigation or renderer crash
// never runs the old page's cleanup, so main kills that page's shells itself;
// otherwise every reload leaves another shell running until the app quits.
const ptyOwner = new Map<string, number>();
const watchedSenders = new Set<number>();

function killSessionsOf(senderId: number): void {
  for (const [sid, owner] of ptyOwner) {
    if (owner !== senderId) continue;
    try { ptySessions.get(sid)?.kill(); } catch { /* already gone */ }
    ptySessions.delete(sid);
    ptyOwner.delete(sid);
  }
}

function watchSender(sender: Electron.WebContents): void {
  if (watchedSenders.has(sender.id)) return;
  watchedSenders.add(sender.id);
  const id = sender.id;
  sender.on('did-start-navigation', (_e, _url, isInPlace, isMainFrame) => {
    if (isMainFrame && !isInPlace) killSessionsOf(id);
  });
  sender.on('render-process-gone', () => killSessionsOf(id));
  sender.once('destroyed', () => {
    killSessionsOf(id);
    watchedSenders.delete(id);
  });
}

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

// Lost-update guard: the renderer saves the whole board, so a save made from a
// board loaded before a CLI write would revert that write. Track the revision
// the renderer last saw; a stale save is refused and the renderer reloads.
const rendererRev = new RendererRevGuard(BOARD_PATH);
// The board the renderer's next save is derived from — the common ancestor
// for a three-way merge when that save turns out to be stale. After a merge
// it is the renderer's own last save until the renderer reloads, because
// saves already in flight were made before it saw the merged board.
let rendererBase: Record<string, unknown> | null = null;
let awaitingReload = false;
const asBoard = (b: unknown): Record<string, unknown> | null =>
  typeof b === 'object' && b !== null && !Array.isArray(b) ? (b as Record<string, unknown>) : null;

function saveBoard(data: unknown) {
  saveBoardTo(BOARD_PATH, data);
}

function hasOpenRenderer(): boolean {
  return BrowserWindow.getAllWindows().length > 0;
}

export function registerHandlers(rpcServer?: RpcServer): void {
  ipcMain.handle('board:load', async () => {
    const board = loadBoard();
    rendererRev.sync();
    rendererBase = asBoard(board);
    awaitingReload = false;
    return board;
  });

  ipcMain.handle('board:save', async (_event, data: unknown) => {
    if (rendererRev.isStale() || awaitingReload) {
      // A newer write landed (sys CLI / the AI terminal) after the renderer's
      // last load. Saving as-is would revert it, refusing would drop the
      // user's edit: merge both onto the common base, then let the renderer
      // reload the result (its board:load re-syncs the revision).
      const mine = asBoard(data);
      const theirs = asBoard(loadBoard());
      if (rendererBase && mine && theirs) {
        saveBoard(mergeBoards(rendererBase, mine, theirs));
        rendererRev.sync();
        rendererBase = mine;
        awaitingReload = true;
      }
      notifyBoardChanged();
      return;
    }
    saveBoard(data);
    rendererRev.sync();
    rendererBase = asBoard(data);
  });

  // Factory reset — overwrite board.json with a fresh canonical seed and return
  // the loaded (migrated/validated) board so the renderer can adopt it directly.
  // Destructive and intentional: the renderer gates this behind a hold-to-confirm.
  ipcMain.handle('board:reset', async () => {
    saveBoard(seedBoard());
    const board = loadBoard();
    rendererRev.sync();
    rendererBase = asBoard(board);
    awaitingReload = false;
    return board;
  });

  ipcMain.handle('board:saveViewport', async (_event, viewport: unknown) => {
    // A pan is never worth risking the board: if it can't be read right now
    // (locked by antivirus / sync), skip this viewport write.
    let board: unknown;
    try {
      board = loadBoard();
    } catch (err) {
      console.warn('[board] viewport not saved:', err instanceof Error ? err.message : err);
      return;
    }
    const merged = typeof board === 'object' && board !== null
      ? { ...(board as Record<string, unknown>), viewport, savedAt: new Date().toISOString() }
      : { viewport, savedAt: new Date().toISOString() };
    // Merges onto the current file, so it never loses a write itself — but it
    // bumps the revision, which must not make the renderer's next save stale.
    const wasInSync = !rendererRev.isStale();
    saveBoard(merged);
    if (wasInSync) rendererRev.sync();
  });

  ipcMain.handle('sys:run', async (_event, argv: string[]) => {
    const facade = new SysFacade({
      boardPath: BOARD_PATH,
      hasOpenRenderer,
      onBoardChanged: notifyBoardChanged,
      ...(cliDispatchFn ? { cliDispatch: cliDispatchFn } : {}),
    });
    try {
      const result = await facade.run(argv);
      return { ok: result.ok, message: result.message ?? '' };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  });

  // cli:dispatch — main→renderer command dispatch for renderer-coupled commands.
  // Used by Phase 2 CLI commands (viewport/undo/redo/theme/marquee/node.move).
  // Main sends cli:dispatch:request to one window and waits up to 15s for a reply.
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
    // One window only: broadcasting ran the command once per window.
    const target = BrowserWindow.getFocusedWindow() ?? windows[0]!;
    const result = await new Promise<{ ok: boolean; message: string }>((resolve) => {
      const timer = setTimeout(() => {
        pendingCliDispatches.delete(id);
        // The request was delivered; only the confirmation is missing, so the
        // command may well have run. Say so — a blind retry could run it twice.
        resolve({
          ok: false,
          message: `${command}: the app did not confirm within 15s — it may still have run. Check the board before retrying.`,
        });
      }, 15_000);
      pendingCliDispatches.set(id, { resolve, timer });
      target.webContents.send('cli:dispatch:request', id, command, args);
    });
    return result;
  }

  // Expose cliDispatch on the facade so sys:run can use it for Phase 2 commands.
  // We attach it to the ipcMain context via a module-level variable.
  cliDispatchFn = cliDispatch;

  ipcMain.handle('clipboard:readText', () => clipboard.readText());
  ipcMain.handle('clipboard:writeText', (_event, text: string) => {
    clipboard.writeText(text);
  });

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

    // Resolve where claude/CLAUDE.md lives BEFORE picking cwd — we want the
    // shell to start inside that dir so Claude Code auto-discovers CLAUDE.md
    // from its first cwd. In packaged builds app.getAppPath() returns the
    // path INSIDE app.asar (an archive file) which external processes can't
    // read; electron-builder's asarUnpack extracts claude/ to a real on-disk
    // sibling at app.asar.unpacked/, so we rewrite the segment.
    let claudeHome = process.env['KRNL0_CLAUDE_HOME']
      ?? join(app.getAppPath(), 'claude');
    const asarSegment = `${sep}app.asar${sep}`;
    if (claudeHome.includes(asarSegment)) {
      claudeHome = claudeHome.replace(asarSegment, `${sep}app.asar.unpacked${sep}`);
    }
    let claudeHomeExists = false;
    try { claudeHomeExists = existsSync(claudeHome); } catch { /* ignore */ }

    // Working directory (issue #74): start the shell inside claudeHome so
    // `claude` discovers CLAUDE.md on first invocation. The PowerShell
    // function in krnl-init.ps1 and bin/claude POSIX shim still do a per-
    // command CWD hop for follow-up calls if the user navigates elsewhere
    // — but on macOS path_helper re-prepends standard paths to PATH at
    // shell startup, pushing our cliDir (and therefore the shim) behind
    // the real claude binary in /usr/local/bin. Starting in claudeHome
    // sidesteps that race for the common case.
    //
    // KRNL0_TERM_CWD wins if the user wants a fixed location.
    let cwd = process.env['KRNL0_TERM_CWD']
      ?? (claudeHomeExists ? claudeHome : process.cwd());
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

    // Make the shell behave like a modern terminal (iTerm2 / Ghostty / Alacritty).
    // xterm.js renders 24-bit colour, but ncurses-based tools read $TERM and
    // $COLORTERM to decide whether to emit true-colour escape sequences. Without
    // these the shell falls back to the 8/16-colour palette and tools like
    // `claude`, `htop`, `nvim`, and `bat` look washed out.
    if (!isWin) {
      childEnv['TERM'] = childEnv['TERM'] ?? 'xterm-256color';
      childEnv['COLORTERM'] = 'truecolor';
      // Identifies the host terminal to apps that adapt UI per terminal
      // (e.g. claude, gh, fzf). Mirroring the iTerm convention is the
      // most-compatible option.
      childEnv['TERM_PROGRAM'] = 'KRNL0';
      childEnv['LANG'] = childEnv['LANG'] ?? 'en_US.UTF-8';
    }

    // Export KRNL0_CLAUDE_HOME so the krnl-init.ps1 PowerShell function and
    // bin/claude POSIX shim can do a per-command CWD hop when the user has
    // navigated away from claudeHome. claudeHome itself was computed above
    // (before the cwd block) so both pieces of logic see the same value.
    if (claudeHomeExists) childEnv['KRNL0_CLAUDE_HOME'] = claudeHome;

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
      if (isPwsh) {
        const args = ['-NoLogo'];
        const cliDir = process.env['KRNL0_CLI_DIR'];
        if (cliDir && process.env['KRNL0_KEEP_PSREADLINE_PREDICTION'] !== '1') {
          args.push('-NoExit', '-File', join(cliDir, 'krnl-init.ps1'));
        }
        return args;
      }
      // POSIX: spawn as a *login* shell so /etc/zprofile + ~/.zprofile run,
      // including macOS's path_helper which adds /usr/local/bin, /usr/bin,
      // etc. Without -l the shell inherits launchd's minimal PATH (when the
      // app is opened from Finder) and homebrew binaries (eza, brew-managed
      // claude, ripgrep, …) end up missing even though .zshrc loads.
      // bash, zsh, sh, and dash all accept -l. fish doesn't, so skip there.
      if (process.platform !== 'win32') {
        const shellBase = base.split(/[\\/]/).pop() ?? '';
        if (shellBase === 'zsh' || shellBase === 'bash' || shellBase === 'sh' || shellBase === 'dash') {
          return ['-l'];
        }
      }
      return [];
    })();

    // Belt-and-suspenders for macOS: if the user's shell rc later wipes
    // PATH (common with conda init replacing the prepended /opt/homebrew
    // entries), make sure the well-known homebrew + system paths are at
    // least *in* the env we hand to the shell so tools like eza, fzf,
    // ripgrep stay reachable from a fresh KRNL0 terminal.
    if (process.platform === 'darwin') {
      const standardMacPaths = [
        '/opt/homebrew/bin',     // Apple Silicon homebrew
        '/opt/homebrew/sbin',
        '/usr/local/bin',        // Intel homebrew + manual installs
        '/usr/local/sbin',
        '/usr/bin',
        '/bin',
        '/usr/sbin',
        '/sbin',
      ];
      const currentPath = (childEnv['PATH'] ?? '').split(':').filter(Boolean);
      for (const p of standardMacPaths) {
        if (!currentPath.includes(p)) currentPath.push(p);
      }
      childEnv['PATH'] = currentPath.join(':');
    }

    let proc: pty.IPty;
    try {
      proc = pty.spawn(shell, shellArgs, {
        cols,
        rows,
        cwd,
        env: childEnv,
        // 256-colour terminfo entry — matches the COLORTERM=truecolor hint
        // and unlocks the rich colour palette used by claude, fzf, nvim, etc.
        name: 'xterm-256color',
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
      ptyOwner.delete(sessionId);
      safeSend(`pty:exit:${sessionId}`);
    });

    ptySessions.set(sessionId, proc);
    ptyOwner.set(sessionId, event.sender.id);
    watchSender(event.sender);

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
      ptyOwner.delete(sessionId);
    }
  });

  // Clean up all PTY sessions on app quit (Decision 12 §7)
  app.on('before-quit', () => {
    ptySessions.forEach((p) => p.kill());
    ptySessions.clear();
  });
}
