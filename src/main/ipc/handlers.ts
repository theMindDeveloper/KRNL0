import { ipcMain } from 'electron';

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
}
