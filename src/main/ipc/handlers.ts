import { app, ipcMain } from 'electron';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { randomUUID } from 'crypto';
import { spawn as spawnChild, type ChildProcessWithoutNullStreams } from 'child_process';
import { SysFacade } from '../../sys/SysFacade';

// Board location — isolated per Electron app name so multiple worktrees
// (e.g. main vs feat/new-features) don't share the same board.json.
// Override with KRNL0_BOARD_DIR for explicit per-instance dev paths.
const BOARD_DIR = process.env.KRNL0_BOARD_DIR
  ?? join(homedir(), 'Documents', app.getName());
const BOARD_PATH = join(BOARD_DIR, 'board.json');

// Active shell sessions keyed by sessionId (child_process — no native deps needed)
const ptySessions = new Map<string, ChildProcessWithoutNullStreams>();

function seedBoard() {
  return {
    version: 1,
    schemaVersion: 1,
    savedAt: new Date().toISOString(),
    viewport: { x: 0, y: 220, zoom: 1 },
    nodes: [
      {
        id: 'mother-pomo',
        kind: 'pomo',
        position: { x: -808, y: 0 },
        isMother: true,
        state: { status: 'idle', startedAt: null, durationMin: 25, label: '', sessionsCompleted: 0, history: [] },
        config: { shortBreakMin: 5, longBreakMin: 15, sessionsUntilLongBreak: 4 },
      },
      {
        id: 'mother-todo',
        kind: 'todo',
        position: { x: -396, y: 0 },
        isMother: true,
        state: { items: [] },
        config: { showCompleted: true, maxVisible: 50 },
      },
      {
        id: 'mother-habit',
        kind: 'habit',
        position: { x: 16, y: 0 },
        isMother: true,
        state: { habits: [] },
        config: { maxHabits: 5, weekStartsOn: 'monday' },
      },
      {
        id: 'mother-term',
        kind: 'term',
        position: { x: 428, y: 0 },
        isMother: true,
        state: { sessionId: null, title: 'Terminal' },
        config: { shell: 'default', fontSize: 13 },
      },
    ],
    edges: [],
  };
}

const NEW_MOTHER_POSITIONS: Record<string, { x: number; y: number }> = {
  'mother-pomo':  { x: -808, y: 0 },
  'mother-todo':  { x: -396, y: 0 },
  'mother-habit': { x:   16, y: 0 },
  'mother-term':  { x:  428, y: 0 },
};

function migrateMotherPositions(board: unknown): Record<string, unknown> {
  if (
    typeof board !== 'object' ||
    board === null ||
    !('nodes' in board) ||
    !Array.isArray((board as { nodes: unknown }).nodes)
  ) {
    return typeof board === 'object' && board !== null
      ? (board as Record<string, unknown>)
      : {};
  }
  const b = board as {
    nodes: unknown[];
    viewport?: { x: number; y: number; zoom: number };
  };
  b.nodes = b.nodes.map((n) => {
    if (typeof n !== 'object' || n === null || !('id' in n)) return n;
    const node = n as { id: string; position?: { x: number; y: number }; isMother?: boolean };
    const newPos = NEW_MOTHER_POSITIONS[node.id];
    if (newPos) {
      return { ...node, position: newPos, isMother: true };
    }
    return node;
  });
  if (b.viewport) {
    b.viewport = { ...b.viewport, x: 0, y: 220, zoom: 1 };
  }
  return b as Record<string, unknown>;
}

/**
 * Re-chain task nodes by createdAt order. Removes any edge into a task
 * (including illegal mother→task edges) and rebuilds task[i-1] → task[i].
 * The first task has no inbound edge.
 */
function migrateTaskChain(board: Record<string, unknown>): Record<string, unknown> {
  const nodes = board['nodes'];
  if (!Array.isArray(nodes)) return board;
  const edges = board['edges'];
  const edgeArr = Array.isArray(edges) ? edges : [];

  type TaskNodeShape = { id: string; kind: string; state?: { createdAt?: string } };
  const tasks = nodes.filter((n: unknown): n is TaskNodeShape => {
    return typeof n === 'object' && n !== null && (n as { kind?: unknown }).kind === 'todo.task';
  });
  if (tasks.length === 0) {
    // Still strip any orphan task-targeting edges (none expected, but defensive)
    board['edges'] = edgeArr;
    return board;
  }

  const taskIds = new Set(tasks.map((t) => t.id));

  // Sort by createdAt ascending (oldest first)
  const sorted = [...tasks].sort((a, b) => {
    const ca = a.state?.createdAt ?? '';
    const cb = b.state?.createdAt ?? '';
    return ca < cb ? -1 : ca > cb ? 1 : 0;
  });

  // Drop ALL edges where target is a task — clean slate
  type EdgeShape = { id: string; from: { nodeId: string; event: string }; to: { nodeId: string; command: string }; enabled?: boolean };
  const cleaned = edgeArr.filter((e: unknown) => {
    if (typeof e !== 'object' || e === null) return false;
    const ed = e as { to?: { nodeId?: string } };
    return !taskIds.has(ed.to?.nodeId ?? '');
  }) as EdgeShape[];

  // Add chain edges
  for (let i = 1; i < sorted.length; i++) {
    cleaned.push({
      id: `edge-chain-${sorted[i]!.id}`,
      from: { nodeId: sorted[i - 1]!.id, event: 'task.next' },
      to: { nodeId: sorted[i]!.id, command: 'task.activate' },
      enabled: true,
    });
  }
  board['edges'] = cleaned;
  return board;
}

// Heal nodes saved with empty / partial state (e.g. created via dock before
// kind-aware spawn defaults landed). Without this, a TodoNode whose state was
// persisted as `{}` crashes the renderer with "state.items is not iterable".
const STATE_DEFAULTS: Record<string, () => Record<string, unknown>> = {
  pomo: () => ({
    status: 'idle',
    startedAt: null,
    durationMin: 25,
    breakMin: 5,
    label: '',
    sessionsCompleted: 0,
    history: [],
  }),
  todo: () => ({ items: [] }),
  habit: () => ({ habits: [] }),
  term: () => ({ sessionId: null, title: 'Terminal' }),
};

function migrateNodeStates(board: Record<string, unknown>): Record<string, unknown> {
  const nodes = board['nodes'];
  if (!Array.isArray(nodes)) return board;
  board['nodes'] = nodes.map((n: unknown) => {
    if (typeof n !== 'object' || n === null || !('kind' in n)) return n;
    const node = n as { kind: string; state?: Record<string, unknown> };
    const defaults = STATE_DEFAULTS[node.kind];
    if (!defaults) return node;
    return { ...node, state: { ...defaults(), ...(node.state ?? {}) } };
  });
  return board;
}

function loadBoard() {
  try {
    if (existsSync(BOARD_PATH)) {
      const raw = readFileSync(BOARD_PATH, 'utf-8');
      const parsed: unknown = JSON.parse(raw);
      return migrateNodeStates(migrateTaskChain(migrateMotherPositions(parsed)));
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
    const facade = new SysFacade();
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

  // pty:create — spawn a persistent shell using child_process (no native deps)
  ipcMain.handle('pty:create', (event, _cols: number, _rows: number) => {
    const sessionId = randomUUID();

    const isWin = process.platform === 'win32';
    const shell = isWin
      ? (process.env['COMSPEC'] ?? 'powershell.exe')
      : (process.env['SHELL'] ?? '/bin/bash');
    const args = isWin ? ['-NoLogo', '-NoExit', '-Command', '-'] : ['-i'];

    const cwd =
      process.env['USERPROFILE'] ??
      process.env['HOME'] ??
      process.cwd();

    const proc = spawnChild(shell, args, {
      cwd,
      env: { ...process.env, TERM: 'xterm-color' },
      stdio: ['pipe', 'pipe', 'pipe'],
    }) as ChildProcessWithoutNullStreams;

    proc.stdout.on('data', (data: Buffer) => {
      event.sender.send(`pty:data:${sessionId}`, data.toString());
    });

    proc.stderr.on('data', (data: Buffer) => {
      event.sender.send(`pty:data:${sessionId}`, data.toString());
    });

    proc.on('exit', () => {
      ptySessions.delete(sessionId);
      event.sender.send(`pty:exit:${sessionId}`);
    });

    ptySessions.set(sessionId, proc);
    return sessionId;
  });

  // pty:write — send keystrokes to the shell stdin
  ipcMain.handle('pty:write', (_event, sessionId: string, data: string) => {
    ptySessions.get(sessionId)?.stdin.write(data);
  });

  // pty:resize — no-op (resize supported when node-pty is wired in a future phase)
  ipcMain.handle('pty:resize', (_event, _sessionId: string, _cols: number, _rows: number) => {
    // TODO (Phase 3+): wire node-pty for full PTY resize support
  });

  // pty:kill — terminate the shell process for a session (F4b)
  ipcMain.handle('pty:kill', (_event, sessionId: string) => {
    const proc = ptySessions.get(sessionId);
    if (proc) {
      proc.kill();
      ptySessions.delete(sessionId);
    }
  });
}
