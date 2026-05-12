import { app, ipcMain, BrowserWindow } from 'electron';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { randomUUID } from 'crypto';
import * as pty from 'node-pty';
import { SysFacade } from '../../sys/SysFacade';
import { loadBoardFrom, saveBoardTo } from '../persistence/board';

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

export function registerHandlers(): void {
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
    });
    const result = await facade.run(argv);
    return { ok: result.ok, message: result.message ?? '' };
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

    let proc: pty.IPty;
    try {
      proc = pty.spawn(shell, [], {
        cols,
        rows,
        cwd,
        env: process.env,
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

    proc.onData((data: string) => {
      event.sender.send(`pty:data:${sessionId}`, data);
    });

    proc.onExit(() => {
      ptySessions.delete(sessionId);
      event.sender.send(`pty:exit:${sessionId}`);
    });

    ptySessions.set(sessionId, proc);
    return sessionId;
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
