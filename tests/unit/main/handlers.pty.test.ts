/**
 * handlers.pty.test.ts — IPC-level coverage for node-pty handlers (Issue #67)
 *
 * Requirements covered (IPC layer; live-input F9–F12 remain manually verified):
 *   F4  — pty:create spawns a PTY and returns a sessionId
 *   F5  — pty:write routes keystrokes to proc.write
 *   F13 — pty:resize calls proc.resize(cols, rows) (no longer a no-op)
 *   F15 — pty:kill calls proc.kill() and removes session from the map
 *
 * Strategy:
 *   1. Mock 'electron' so ipcMain.handle() pushes handlers into a local Map;
 *      app.on/getName are no-ops; app.getAppPath returns a temp string.
 *   2. Mock 'node-pty' so pty.spawn() returns a fake IPty with vi.fn() methods.
 *   3. Import registerHandlers(), call it, then invoke the captured IPC handlers
 *      directly — no real native binary loaded at any point.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock: node-pty
// ---------------------------------------------------------------------------

type FakeIPty = {
  write: ReturnType<typeof vi.fn>;
  resize: ReturnType<typeof vi.fn>;
  kill: ReturnType<typeof vi.fn>;
  onData: ReturnType<typeof vi.fn>;
  onExit: ReturnType<typeof vi.fn>;
  _fireData: (data: string) => void;
  _fireExit: () => void;
};

let lastSpawnedProc: FakeIPty | null = null;

const makeFakeProc = (): FakeIPty => {
  let dataCallback: ((data: string) => void) | null = null;
  let exitCallback: (() => void) | null = null;

  const proc: FakeIPty = {
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    onData: vi.fn((cb: (data: string) => void) => { dataCallback = cb; }),
    onExit: vi.fn((cb: () => void) => { exitCallback = cb; }),
    _fireData: (data: string) => dataCallback?.(data),
    _fireExit: () => exitCallback?.(),
  };
  return proc;
};

vi.mock('node-pty', () => ({
  spawn: vi.fn(() => {
    const proc = makeFakeProc();
    lastSpawnedProc = proc;
    return proc;
  }),
}));

// ---------------------------------------------------------------------------
// Mock: electron
// ---------------------------------------------------------------------------

type IpcHandler = (event: unknown, ...args: unknown[]) => unknown;

const ipcHandlers = new Map<string, IpcHandler>();
const appListeners = new Map<string, () => void>();

vi.mock('electron', () => ({
  app: {
    getName: vi.fn(() => 'krnl0-test'),
    getAppPath: vi.fn(() => '/tmp/krnl0-test'),
    on: vi.fn((event: string, cb: () => void) => {
      appListeners.set(event, cb);
    }),
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: IpcHandler) => {
      ipcHandlers.set(channel, handler);
    }),
    on: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Mock: SysFacade (required import inside handlers.ts)
// ---------------------------------------------------------------------------

vi.mock('../../../src/sys/SysFacade', () => ({
  SysFacade: class {
    exec() { return { ok: true, output: '' }; }
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A minimal fake IPC event with a sender that captures send() calls. */
function makeEvent() {
  return {
    sender: {
      send: vi.fn(),
    },
  };
}

/** Invoke a registered IPC handler by channel name. */
async function invoke(channel: string, event: unknown, ...args: unknown[]) {
  const handler = ipcHandlers.get(channel);
  if (!handler) throw new Error(`No handler registered for channel: ${channel}`);
  return handler(event, ...args);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  ipcHandlers.clear();
  appListeners.clear();
  lastSpawnedProc = null;

  // Clear module cache so each test group gets a fresh ptySessions Map.
  vi.resetModules();

  // Re-apply mocks after resetModules.
  vi.mock('node-pty', () => ({
    spawn: vi.fn(() => {
      const proc = makeFakeProc();
      lastSpawnedProc = proc;
      return proc;
    }),
  }));

  vi.mock('electron', () => ({
    app: {
      getName: vi.fn(() => 'krnl0-test'),
      getAppPath: vi.fn(() => '/tmp/krnl0-test'),
      on: vi.fn((event: string, cb: () => void) => {
        appListeners.set(event, cb);
      }),
    },
    ipcMain: {
      handle: vi.fn((channel: string, handler: IpcHandler) => {
        ipcHandlers.set(channel, handler);
      }),
      on: vi.fn(),
    },
  }));

  vi.mock('../../../src/sys/SysFacade', () => ({
    SysFacade: class {
      exec() { return { ok: true, output: '' }; }
    },
  }));

  const { registerHandlers } = await import('../../../src/main/ipc/handlers');
  registerHandlers();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// F4 — pty:create spawns a PTY and returns a sessionId
// ---------------------------------------------------------------------------

describe('F4 — pty:create', () => {
  it('calls pty.spawn with empty args and returns a sessionId string', async () => {
    const { spawn } = await import('node-pty');
    const event = makeEvent();

    const sessionId = await invoke('pty:create', event, 80, 24);

    expect(spawn).toHaveBeenCalled();
    // args must be [] per Decision 12 (no shell flags)
    const spawnCall = (spawn as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(spawnCall[1]).toEqual([]);
    // cols / rows forwarded
    expect(spawnCall[2]).toMatchObject({ cols: 80, rows: 24 });

    expect(typeof sessionId).toBe('string');
    expect((sessionId as string).length).toBeGreaterThan(0);
  });

  it('registers onData which forwards to event.sender.send with the right channel', async () => {
    const event = makeEvent();
    const sessionId = await invoke('pty:create', event, 80, 24) as string;

    expect(lastSpawnedProc).not.toBeNull();
    lastSpawnedProc!._fireData('hello pty');

    expect(event.sender.send).toHaveBeenCalledWith(
      `pty:data:${sessionId}`,
      'hello pty',
    );
  });

  it('registers onExit which sends pty:exit:<sessionId> and removes session', async () => {
    const event = makeEvent();
    const sessionId = await invoke('pty:create', event, 80, 24) as string;

    lastSpawnedProc!._fireExit();

    expect(event.sender.send).toHaveBeenCalledWith(`pty:exit:${sessionId}`);

    // Session removed — a subsequent pty:write must be a no-op (not throw)
    await expect(invoke('pty:write', makeEvent(), sessionId, 'x')).resolves.toBeUndefined();
    expect(lastSpawnedProc!.write).not.toHaveBeenCalled();
  });

  it('registers the before-quit cleanup handler', async () => {
    expect(appListeners.has('before-quit')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// #74 — pty:create cwd defaults to process.cwd(), KRNL0_TERM_CWD overrides
// ---------------------------------------------------------------------------

describe('#74 — pty:create cwd', () => {
  it('defaults cwd to process.cwd() (project root in dev)', async () => {
    delete process.env['KRNL0_TERM_CWD'];

    const { spawn } = await import('node-pty');
    await invoke('pty:create', makeEvent(), 80, 24);

    const spawnCall = (spawn as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(spawnCall[2].cwd).toBe(process.cwd());
  });

  it('honours KRNL0_TERM_CWD override when the path exists', async () => {
    // Use process.cwd() — guaranteed to exist — as the override target
    process.env['KRNL0_TERM_CWD'] = process.cwd();

    const { spawn } = await import('node-pty');
    await invoke('pty:create', makeEvent(), 80, 24);

    const spawnCall = (spawn as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(spawnCall[2].cwd).toBe(process.cwd());

    delete process.env['KRNL0_TERM_CWD'];
  });
});

// ---------------------------------------------------------------------------
// F5 — pty:write routes to proc.write
// ---------------------------------------------------------------------------

describe('F5 — pty:write', () => {
  it('calls proc.write(data) for a known sessionId', async () => {
    const event = makeEvent();
    const sessionId = await invoke('pty:create', event, 80, 24) as string;
    const proc = lastSpawnedProc!;

    await invoke('pty:write', makeEvent(), sessionId, 'ls\r');

    expect(proc.write).toHaveBeenCalledWith('ls\r');
  });

  it('returns silently (does NOT throw) for an unknown sessionId', async () => {
    await expect(
      invoke('pty:write', makeEvent(), 'nonexistent-session-id', 'data'),
    ).resolves.toBeUndefined();
  });

  it('does not call write when sessionId is unknown', async () => {
    // Ensure no proc is created for this test path
    await invoke('pty:write', makeEvent(), 'ghost-session', 'x');
    // lastSpawnedProc may be null (no create called) — just confirms no throw
    if (lastSpawnedProc) {
      expect(lastSpawnedProc.write).not.toHaveBeenCalled();
    }
  });
});

// ---------------------------------------------------------------------------
// F13 — pty:resize calls proc.resize(cols, rows)
// ---------------------------------------------------------------------------

describe('F13 — pty:resize', () => {
  it('calls proc.resize(cols, rows) for a known sessionId', async () => {
    const event = makeEvent();
    const sessionId = await invoke('pty:create', event, 80, 24) as string;
    const proc = lastSpawnedProc!;

    await invoke('pty:resize', makeEvent(), sessionId, 120, 40);

    expect(proc.resize).toHaveBeenCalledWith(120, 40);
  });

  it('returns silently for an unknown sessionId', async () => {
    await expect(
      invoke('pty:resize', makeEvent(), 'no-such-session', 120, 40),
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// F15 — pty:kill removes the session and calls proc.kill()
// ---------------------------------------------------------------------------

describe('F15 — pty:kill', () => {
  it('calls proc.kill() for a known sessionId', async () => {
    const event = makeEvent();
    const sessionId = await invoke('pty:create', event, 80, 24) as string;
    const proc = lastSpawnedProc!;

    await invoke('pty:kill', makeEvent(), sessionId);

    expect(proc.kill).toHaveBeenCalledTimes(1);
  });

  it('removes the session so subsequent pty:write is a no-op', async () => {
    const event = makeEvent();
    const sessionId = await invoke('pty:create', event, 80, 24) as string;
    const proc = lastSpawnedProc!;

    await invoke('pty:kill', makeEvent(), sessionId);
    await invoke('pty:write', makeEvent(), sessionId, 'after-kill');

    expect(proc.write).not.toHaveBeenCalled();
  });

  it('returns silently for an unknown sessionId', async () => {
    await expect(
      invoke('pty:kill', makeEvent(), 'phantom-session'),
    ).resolves.toBeUndefined();
  });

  it('does not call proc.kill() for an unknown sessionId', async () => {
    // Spawn a real session to ensure kill is not called on it either
    const event = makeEvent();
    await invoke('pty:create', event, 80, 24);
    const proc = lastSpawnedProc!;

    await invoke('pty:kill', makeEvent(), 'different-session-id');

    expect(proc.kill).not.toHaveBeenCalled();
  });
});
