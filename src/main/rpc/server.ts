// RPC server — TNF1–TNF4.
// Listens on a named pipe (Windows) or Unix domain socket (POSIX).
// Wire format: line-delimited JSON.
//   Request:  { v: 1, token: string, id: string, argv: string[] }
//   Response: { v: 1, id: string, kind: 'stdout'|'stderr'|'exit', data?: string, code?: number }

import * as net from 'net';
import * as os from 'os';
import * as crypto from 'crypto';
import { SysFacade } from '../../sys/SysFacade';
import type { CliDispatchFn } from '../../sys/SysFacade';

export interface RpcServer {
  socketPath: string;
  token: string;
  close(): void;
}

interface RpcRequest {
  v: number;
  token: string;
  id: string;
  argv: string[];
}

interface RpcFrame {
  v: 1;
  id: string;
  kind: 'stdout' | 'stderr' | 'exit';
  data?: string;
  code?: number;
}

function makeSockPath(): string {
  const pid = process.pid;
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\krnl0-${pid}`;
  }
  return `${os.tmpdir()}/krnl0-${pid}.sock`;
}

function writeFrame(socket: net.Socket, frame: RpcFrame): void {
  if (!socket.destroyed) {
    socket.write(JSON.stringify(frame) + '\n');
  }
}

// Single-flight mutex: serialise concurrent requests so board.json is never
// written concurrently. Promise chain — each request waits for the previous.
let chain: Promise<void> = Promise.resolve();

export function createRpcServer(boardPath: string, getDispatch?: () => CliDispatchFn | null): RpcServer {
  const socketPath = makeSockPath();
  // TNF2: token never persists to disk
  const token = crypto.randomBytes(32).toString('hex');

  const server = net.createServer((socket) => {
    let buf = '';

    socket.on('data', (chunk: Buffer) => {
      buf += chunk.toString('utf8');
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        let req: RpcRequest;
        try {
          req = JSON.parse(trimmed) as RpcRequest;
        } catch {
          // malformed — ignore
          continue;
        }

        // TNF9: token mismatch → single exit frame, close immediately
        if (req.token !== token) {
          writeFrame(socket, { v: 1, id: req.id ?? '', kind: 'exit', code: 126 });
          socket.end();
          return;
        }

        // Capture for closure
        const reqId = req.id;
        const argv = req.argv;

        chain = chain.then(async () => {
          const dispatch = getDispatch?.() ?? null;
          const facade = new SysFacade({
            boardPath,
            ...(dispatch ? { cliDispatch: dispatch } : {}),
          });
          let result: { ok: boolean; message?: string };
          try {
            result = await facade.run(argv);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            writeFrame(socket, { v: 1, id: reqId, kind: 'stderr', data: msg });
            writeFrame(socket, { v: 1, id: reqId, kind: 'exit', code: 1 });
            return;
          }

          if (result.message) {
            const kind = result.ok ? 'stdout' : 'stderr';
            writeFrame(socket, { v: 1, id: reqId, kind, data: result.message });
          }
          writeFrame(socket, { v: 1, id: reqId, kind: 'exit', code: result.ok ? 0 : 1 });
        });
      }
    });

    socket.on('error', () => {
      // client disconnected mid-stream — ignore
    });
  });

  server.listen(socketPath);

  return {
    socketPath,
    token,
    close: () => {
      server.close();
    },
  };
}
