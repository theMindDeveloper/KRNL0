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
      isDestroyed: vi.fn(() => false),
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

/** pty:create now returns { sessionId, motd }. Helper to extract sessionId. */
async function createSession(cols = 80, rows = 24, event = makeEvent()): Promise<string> {
  const result = await invoke('pty:create', event, cols, rows) as { sessionId: string; motd: string };
  return result.sessionId;
}

describe('F4 — pty:create', () => {
  it('calls pty.spawn with shell-appropriate args and returns { sessionId, motd }', async () => {
    const { spawn } = await import('node-pty');
    const event = makeEvent();

    // Force a POSIX shell to assert the no-flag path; PowerShell gets -NoLogo
    // (covered by a separate test below).
    const prev = process.env['KRNL0_SHELL'];
    process.env['KRNL0_SHELL'] = '/bin/zsh';
    try {
      const result = await invoke('pty:create', event, 80, 24) as { sessionId: string; motd: string };

      expect(spawn).toHaveBeenCalled();
      const spawnCall = (spawn as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(spawnCall[1]).toEqual([]);
      // cols / rows forwarded
      expect(spawnCall[2]).toMatchObject({ cols: 80, rows: 24 });

      expect(typeof result.sessionId).toBe('string');
      expect(result.sessionId.length).toBeGreaterThan(0);
      expect(typeof result.motd).toBe('string');
    } finally {
      if (prev === undefined) delete process.env['KRNL0_SHELL'];
      else process.env['KRNL0_SHELL'] = prev;
    }
  });

  it('passes -NoLogo to PowerShell and disables PSReadLine prediction by default', async () => {
    const { spawn } = await import('node-pty');
    const event = makeEvent();

    const prevShell = process.env['KRNL0_SHELL'];
    const prevKeep = process.env['KRNL0_KEEP_PSREADLINE_PREDICTION'];
    process.env['KRNL0_SHELL'] = 'powershell.exe';
    delete process.env['KRNL0_KEEP_PSREADLINE_PREDICTION'];
    try {
      await invoke('pty:create', event, 80, 24);
      const spawnCall = (spawn as ReturnType<typeof vi.fn>).mock.calls[0];
      const args = spawnCall[1] as string[];
      expect(args).toContain('-NoLogo');
      expect(args).toContain('-NoExit');
      expect(args).toContain('-Command');
      expect(args.some((a) => a.includes('PredictionSource None'))).toBe(true);
    } finally {
      if (prevShell === undefined) delete process.env['KRNL0_SHELL'];
      else process.env['KRNL0_SHELL'] = prevShell;
      if (prevKeep !== undefined) process.env['KRNL0_KEEP_PSREADLINE_PREDICTION'] = prevKeep;
    }
  });

  it('passes -NoLogo to pwsh (PowerShell Core) as well', async () => {
    const { spawn } = await import('node-pty');
    const event = makeEvent();

    const prev = process.env['KRNL0_SHELL'];
    process.env['KRNL0_SHELL'] = 'pwsh.exe';
    try {
      await invoke('pty:create', event, 80, 24);
      const spawnCall = (spawn as ReturnType<typeof vi.fn>).mock.calls[0];
      const args = spawnCall[1] as string[];
      expect(args).toContain('-NoLogo');
    } finally {
      if (prev === undefined) delete process.env['KRNL0_SHELL'];
      else process.env['KRNL0_SHELL'] = prev;
    }
  });

  it('preserves PSReadLine prediction when KRNL0_KEEP_PSREADLINE_PREDICTION=1', async () => {
    const { spawn } = await import('node-pty');
    const event = makeEvent();

    const prevShell = process.env['KRNL0_SHELL'];
    const prevKeep = process.env['KRNL0_KEEP_PSREADLINE_PREDICTION'];
    process.env['KRNL0_SHELL'] = 'powershell.exe';
    process.env['KRNL0_KEEP_PSREADLINE_PREDICTION'] = '1';
    try {
      await invoke('pty:create', event, 80, 24);
      const spawnCall = (spawn as ReturnType<typeof vi.fn>).mock.calls[0];
      const args = spawnCall[1] as string[];
      expect(args).toEqual(['-NoLogo']);
      expect(args).not.toContain('-Command');
    } finally {
      if (prevShell === undefined) delete process.env['KRNL0_SHELL'];
      else process.env['KRNL0_SHELL'] = prevShell;
      if (prevKeep === undefined) delete process.env['KRNL0_KEEP_PSREADLINE_PREDICTION'];
      else process.env['KRNL0_KEEP_PSREADLINE_PREDICTION'] = prevKeep;
    }
  });

  it('registers onData which forwards to event.sender.send with the right channel', async () => {
    const event = makeEvent();
    const sessionId = await createSession(80, 24, event);

    expect(lastSpawnedProc).not.toBeNull();
    lastSpawnedProc!._fireData('hello pty');

    expect(event.sender.send).toHaveBeenCalledWith(
      `pty:data:${sessionId}`,
      'hello pty',
    );
  });

  it('registers onExit which sends pty:exit:<sessionId> and removes session', async () => {
    const event = makeEvent();
    const sessionId = await createSession(80, 24, event);

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
    const sessionId = await createSession();
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
    const sessionId = await createSession();
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
    const sessionId = await createSession();
    const proc = lastSpawnedProc!;

    await invoke('pty:kill', makeEvent(), sessionId);

    expect(proc.kill).toHaveBeenCalledTimes(1);
  });

  it('removes the session so subsequent pty:write is a no-op', async () => {
    const sessionId = await createSession();
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
