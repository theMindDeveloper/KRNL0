// Integration tests for the RPC server — T9, TNF2, TNF3, TNF9.
//
// Strategy: createRpcServer() binds a real socket, then net.createConnection()
// sends line-delimited JSON frames and reads back the response frames.
// No DOM, no real Electron — electron module is mocked at module load time
// to prevent boardIo.ts from calling app.getName() before any window exists.

import { describe, it, expect, afterAll, beforeAll, vi } from 'vitest';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

// ── Electron mock — must be declared before any import that transitively uses it ──
// boardIo.ts calls app.getName() at module-load time via:
//   server.ts → SysFacade → sys/commands/text.ts → boardIo.ts → electron
vi.mock('electron', () => ({
  app: {
    getName: vi.fn(() => 'krnl0-test'),
    getAppPath: vi.fn(() => os.tmpdir()),
    on: vi.fn(),
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
  },
}));

import { createRpcServer } from '../../../src/main/rpc/server';
import type { RpcServer } from '../../../src/main/rpc/server';

// ── helpers ────────────────────────────────────────────────────────────────

/** Write a single request, collect all response frames until an exit frame. */
function rpcExchange(
  socketPath: string,
  request: Record<string, unknown>,
  timeoutMs = 5000,
): Promise<Array<{ kind: string; data?: string; code?: number; id?: string }>> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ path: socketPath });
    const frames: Array<{ kind: string; data?: string; code?: number; id?: string }> = [];
    let buf = '';

    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('RPC exchange timed out'));
    }, timeoutMs);

    socket.on('connect', () => {
      socket.write(JSON.stringify(request) + '\n');
    });

    socket.on('data', (chunk: Buffer) => {
      buf += chunk.toString('utf8');
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const frame = JSON.parse(trimmed) as { kind: string; data?: string; code?: number; id?: string };
          frames.push(frame);
          if (frame.kind === 'exit') {
            clearTimeout(timer);
            socket.destroy();
            resolve(frames);
          }
        } catch {
          // ignore malformed
        }
      }
    });

    socket.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    socket.on('close', () => {
      clearTimeout(timer);
      // If we already resolved via exit frame this is a no-op; otherwise
      // resolve with what we have (e.g. connection closed by server after 126).
      resolve(frames);
    });
  });
}

// ── setup ──────────────────────────────────────────────────────────────────

let server: RpcServer;
// Use a real temp board.json path — SysFacade.run(['task','list']) will read it
const boardPath = path.join(os.tmpdir(), `krnl0-test-rpc-board-${process.pid}.json`);

beforeAll(() => {
  // Write a minimal valid board so taskList doesn't error
  const minimalBoard = JSON.stringify({ nodes: [], edges: [] });
  fs.writeFileSync(boardPath, minimalBoard, 'utf8');
  server = createRpcServer(boardPath);
});

afterAll(() => {
  server.close();
  try { fs.unlinkSync(boardPath); } catch { /* best-effort */ }
});

// ── TNF2 — token is a 64-char hex string ──────────────────────────────────

describe('TNF2 — token generation', () => {
  it('token is a 64-character hex string (32 random bytes)', () => {
    expect(server.token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('token is never empty', () => {
    expect(server.token.length).toBeGreaterThan(0);
  });
});

// ── TNF3 — socket path follows the OS convention ─────────────────────────

describe('TNF3 — socket path format', () => {
  it('socket path includes the current process pid', () => {
    expect(server.socketPath).toContain(String(process.pid));
  });

  it('socket path is a named pipe on Windows or a .sock file on POSIX', () => {
    if (process.platform === 'win32') {
      expect(server.socketPath).toMatch(/^\\\\\.\\/);
    } else {
      expect(server.socketPath).toMatch(/\.sock$/);
    }
  });
});

// ── T9 — valid token → exit 0 ─────────────────────────────────────────────

describe('T9 — valid token authorises the request', () => {
  it('returns at least one frame and an exit frame with code 0 for "task list"', async () => {
    const frames = await rpcExchange(server.socketPath, {
      v: 1,
      token: server.token,
      id: 'req-valid-1',
      argv: ['task', 'list'],
    });

    const exitFrame = frames.find((f) => f.kind === 'exit');
    expect(exitFrame, 'no exit frame received').toBeDefined();
    expect(exitFrame!.code).toBe(0);
  });

  it('id field on response frames matches the request id', async () => {
    const reqId = 'req-id-check-42';
    const frames = await rpcExchange(server.socketPath, {
      v: 1,
      token: server.token,
      id: reqId,
      argv: ['task', 'list'],
    });

    for (const frame of frames) {
      expect((frame as Record<string, unknown>)['id']).toBe(reqId);
    }
  });

  it('"version" returns stdout frame containing version string', async () => {
    const frames = await rpcExchange(server.socketPath, {
      v: 1,
      token: server.token,
      id: 'req-version-1',
      argv: ['version'],
    });

    const stdoutFrame = frames.find((f) => f.kind === 'stdout');
    expect(stdoutFrame, 'no stdout frame for version command').toBeDefined();
    expect(stdoutFrame!.data).toMatch(/krnl0 v\d+\.\d+\.\d+/);

    const exitFrame = frames.find((f) => f.kind === 'exit');
    expect(exitFrame!.code).toBe(0);
  });
});

// ── T9 — wrong token → single exit 126 ───────────────────────────────────

describe('T9 — wrong token closes connection with exit 126', () => {
  it('wrong token produces exit frame with code 126', async () => {
    const frames = await rpcExchange(server.socketPath, {
      v: 1,
      token: 'definitely-wrong-token-000000000000000000000000000000000000000',
      id: 'req-wrong-token',
      argv: ['task', 'list'],
    });

    const exitFrame = frames.find((f) => f.kind === 'exit');
    expect(exitFrame, 'no exit frame for wrong-token request').toBeDefined();
    expect(exitFrame!.code).toBe(126);
  });

  it('missing token (empty string) also produces exit 126', async () => {
    const frames = await rpcExchange(server.socketPath, {
      v: 1,
      token: '',
      id: 'req-empty-token',
      argv: ['task', 'list'],
    });

    const exitFrame = frames.find((f) => f.kind === 'exit');
    expect(exitFrame, 'no exit frame for empty-token request').toBeDefined();
    expect(exitFrame!.code).toBe(126);
  });

  it('malformed JSON frame does not crash the server; subsequent valid request succeeds', async () => {
    const reqId = 'req-post-malformed';
    const goodRequest = JSON.stringify({
      v: 1, token: server.token, id: reqId, argv: ['version'],
    });

    const frames = await new Promise<Array<{ kind: string; code?: number }>>((resolve, reject) => {
      const socket = net.createConnection({ path: server.socketPath });
      const collected: Array<{ kind: string; code?: number }> = [];
      let buf = '';
      const timer = setTimeout(() => { socket.destroy(); reject(new Error('timeout')); }, 5000);

      socket.on('connect', () => {
        socket.write('{not valid json}\n');
        socket.write(goodRequest + '\n');
      });

      socket.on('data', (chunk: Buffer) => {
        buf += chunk.toString('utf8');
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const frame = JSON.parse(trimmed) as { kind: string; code?: number };
            collected.push(frame);
            if (frame.kind === 'exit') {
              clearTimeout(timer);
              socket.destroy();
              resolve(collected);
            }
          } catch { /* ignore */ }
        }
      });

      socket.on('error', (err) => { clearTimeout(timer); reject(err); });
      socket.on('close', () => { clearTimeout(timer); resolve(collected); });
    });

    const exitFrame = frames.find((f) => f.kind === 'exit');
    expect(exitFrame, 'server should have survived malformed JSON and returned exit frame').toBeDefined();
    expect(exitFrame!.code).toBe(0);
  });
});

// ── TNF9 — exactly one exit frame per auth rejection ─────────────────────

describe('TNF9 — single-frame auth rejection', () => {
  it('only frames returned on token mismatch are the exit frame (code 126)', async () => {
    const frames = await rpcExchange(server.socketPath, {
      v: 1,
      token: 'bad',
      id: 'req-single-frame',
      argv: ['version'],
    });

    // All frames should have kind === 'exit'
    const nonExit = frames.filter((f) => f.kind !== 'exit');
    expect(nonExit, 'unexpected non-exit frames on token mismatch').toHaveLength(0);

    const exitFrame = frames.find((f) => f.kind === 'exit');
    expect(exitFrame).toBeDefined();
    expect(exitFrame!.code).toBe(126);
  });
});
