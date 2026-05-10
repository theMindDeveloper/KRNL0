import { ipcMain } from 'electron';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const BOARD_DIR = join(homedir(), 'Documents', 'krnl0');
const BOARD_PATH = join(BOARD_DIR, 'board.json');

function seedBoard() {
  return {
    version: 1,
    schemaVersion: 1,
    savedAt: new Date().toISOString(),
    viewport: { x: 0, y: 160, zoom: 1 },
    nodes: [
      {
        id: 'mother-pomo',
        kind: 'pomo',
        position: { x: 0, y: 0 },
        isMother: true,
        state: { status: 'idle', startedAt: null, durationMin: 25, label: '', sessionsCompleted: 0, history: [] },
        config: { shortBreakMin: 5, longBreakMin: 15, sessionsUntilLongBreak: 4 },
      },
      {
        id: 'mother-todo',
        kind: 'todo',
        position: { x: -480, y: 0 },
        isMother: true,
        state: { items: [] },
        config: { showCompleted: true, maxVisible: 50 },
      },
      {
        id: 'mother-habit',
        kind: 'habit',
        position: { x: 480, y: 0 },
        isMother: true,
        state: { habits: [] },
        config: { maxHabits: 5, weekStartsOn: 'monday' },
      },
      {
        id: 'mother-term',
        kind: 'term',
        position: { x: 0, y: 320 },
        isMother: true,
        state: { sessionId: null, title: 'Terminal' },
        config: { shell: 'default', fontSize: 13 },
      },
    ],
    edges: [],
  };
}

function loadBoard() {
  try {
    if (existsSync(BOARD_PATH)) {
      const raw = readFileSync(BOARD_PATH, 'utf-8');
      return JSON.parse(raw);
    }
  } catch {
    // fall through to seed
  }
  return seedBoard();
}

function saveBoard(data: unknown) {
  try {
    if (!existsSync(BOARD_DIR)) mkdirSync(BOARD_DIR, { recursive: true });
    writeFileSync(BOARD_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch {
    // best-effort
  }
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
    saveBoard({ ...board, viewport, savedAt: new Date().toISOString() });
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
