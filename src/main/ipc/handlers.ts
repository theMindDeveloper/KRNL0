import { ipcMain } from 'electron';
import { randomUUID } from 'crypto';
import * as pty from 'node-pty';

// Active pty sessions keyed by sessionId
const ptySessions = new Map<string, pty.IPty>();

export function registerHandlers(): void {
  ipcMain.handle('board:load', async () => {
    // TODO (Week 1): read ~/Documents/krnl0/board.json, validate with BoardSchema
    return null;
  });

  ipcMain.handle('sys:run', async (_event, argv: string[]) => {
    // TODO (Week 4): spawn sys CLI process, capture stdout, return SysResult
    void argv;
    return { ok: false, message: 'sys not yet implemented' };
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

  // pty:create — spawn a shell and return a sessionId
  ipcMain.handle('pty:create', (event, cols: number, rows: number) => {
    const sessionId = randomUUID();
    const shell =
      process.platform === 'win32'
        ? (process.env['COMSPEC'] ?? 'powershell.exe')
        : (process.env['SHELL'] ?? '/bin/zsh');

    const cwd =
      process.env['HOME'] ??
      process.env['USERPROFILE'] ??
      process.cwd();

    const proc = pty.spawn(shell, [], {
      name: 'xterm-color',
      cols,
      rows,
      cwd,
      env: process.env as Record<string, string>,
    });

    proc.onData((data) => {
      event.sender.send(`pty:data:${sessionId}`, data);
    });

    proc.onExit(() => {
      ptySessions.delete(sessionId);
      event.sender.send(`pty:exit:${sessionId}`);
    });

    ptySessions.set(sessionId, proc);
    return sessionId;
  });

  // pty:write — send keystrokes to an active session
  ipcMain.handle('pty:write', (_event, sessionId: string, data: string) => {
    ptySessions.get(sessionId)?.write(data);
  });

  // pty:resize — resize an active session's pty dimensions
  ipcMain.handle('pty:resize', (_event, sessionId: string, cols: number, rows: number) => {
    ptySessions.get(sessionId)?.resize(cols, rows);
  });
}
