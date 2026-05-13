#!/usr/bin/env node
// krnl — RPC client for the KRNL0 Electron main process.
// Connects to the running app's named pipe / Unix domain socket, sends a
// single request, streams stdout/stderr frames to the terminal, and exits
// with the server-supplied exit code.
//
// Transport: line-delimited JSON (same wire format as server.ts).
// Auth:      $KRNL0_RPC_TOKEN — injected by pty:create into the PTY env.
// Address:   $KRNL0_RPC_SOCKET — injected by pty:create into the PTY env.

import * as net from 'net';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

// ── Version ────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function readVersion() {
  try {
    // bin/krnl.js is one level below project root
    const pkgPath = path.join(__dirname, '..', 'package.json');
    const raw = fs.readFileSync(pkgPath, 'utf8');
    return JSON.parse(raw).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const VERSION = readVersion();

// ── Arg parsing ────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const [cmd, sub, ...rest] = argv;

// T10: krnl version
if (!cmd || cmd === 'version') {
  process.stdout.write(`krnl0 v${VERSION}\n`);
  process.exit(0);
}

// T15: krnl (no args) — short overview
if (!cmd) {
  process.stdout.write(`krnl0 v${VERSION} — canvas CLI\nRun 'krnl help' for usage.\n`);
  process.exit(0);
}

// T11: krnl whoami — diagnostic
if (cmd === 'whoami') {
  const socket = process.env['KRNL0_RPC_SOCKET'] ?? '<unset>';
  const token = process.env['KRNL0_RPC_TOKEN'];
  const pid = process.env['KRNL0_MAIN_PID'] ?? '<unset>';
  process.stdout.write(`socket : ${socket}\n`);
  process.stdout.write(`token  : ${token ? '(set)' : '(unset)'}\n`);
  process.stdout.write(`pid    : ${pid}\n`);
  if (token && socket && socket !== '<unset>') {
    // Probe the server
    probe(socket, token).then((ok) => {
      process.stdout.write(`auth   : ${ok ? '✓' : '✗'}\n`);
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
  // wait for async above
  void 0;
  return; // unreachable but satisfies linter
}

// Route to RPC
const socketPath = process.env['KRNL0_RPC_SOCKET'];
const token = process.env['KRNL0_RPC_TOKEN'];

if (!socketPath || !token) {
  process.stderr.write(
    'krnl: KRNL0_RPC_SOCKET or KRNL0_RPC_TOKEN not set.\n' +
    'Are you running inside a KRNL0 terminal session?\n',
  );
  process.exit(1);
}

const id = crypto.randomUUID();
const request = JSON.stringify({ v: 1, token, id, argv }) + '\n';

rpcCall(socketPath, token, id, argv);

// ── RPC call ───────────────────────────────────────────────────────────────

function rpcCall(sockPath, _token, reqId, _argv) {
  const socket = net.createConnection(sockPath, () => {
    socket.write(request);
  });

  let buf = '';

  socket.on('data', (chunk) => {
    buf += chunk.toString('utf8');
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let frame;
      try { frame = JSON.parse(trimmed); } catch { continue; }
      if (frame.id !== reqId) continue;
      if (frame.kind === 'stdout') {
        process.stdout.write(frame.data + '\n');
      } else if (frame.kind === 'stderr') {
        process.stderr.write(frame.data + '\n');
      } else if (frame.kind === 'exit') {
        socket.destroy();
        process.exit(frame.code ?? 0);
      }
    }
  });

  socket.on('error', (err) => {
    process.stderr.write(`krnl: cannot connect to KRNL0 app (${err.message})\n`);
    process.exit(1);
  });
}

async function probe(sockPath, tok) {
  return new Promise((resolve) => {
    const probeId = crypto.randomUUID();
    const socket = net.createConnection(sockPath, () => {
      socket.write(JSON.stringify({ v: 1, token: tok, id: probeId, argv: ['version'] }) + '\n');
    });
    socket.on('data', (chunk) => {
      const text = chunk.toString('utf8');
      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const frame = JSON.parse(trimmed);
          if (frame.id === probeId && frame.kind === 'exit') {
            socket.destroy();
            resolve(frame.code !== 126);
            return;
          }
        } catch { /* ignore */ }
      }
    });
    socket.on('error', () => resolve(false));
    setTimeout(() => { socket.destroy(); resolve(false); }, 3000);
  });
}
