#!/usr/bin/env node
// Clear the local board.json (and optionally Electron userData) for this
// app instance. After running, the next `npm run dev` will re-seed a fresh
// board via seedBoard() in src/main/ipc/handlers.ts.
//
// Usage:
//   node scripts/reset-board.mjs            # this worktree's board (.krnl0-data/)
//   node scripts/reset-board.mjs --hard     # also wipe this worktree's Electron userData
//   node scripts/reset-board.mjs --shared   # the shared ~/Documents board used by
//                                           # `npm run dev:shared` and packaged builds
//
// Resolves the same paths scripts/dev.mjs gives `npm run dev` (per-worktree
// isolation, AGENTS.md rule 10), so a reset in one worktree never touches
// another worktree's board:
//   BOARD_DIR  = $KRNL0_BOARD_DIR ?? <worktree>/.krnl0-data/
//   userData   = $KRNL0_USER_DATA ?? <worktree>/.krnl0-data/electron/
// With --shared: ~/Documents/<package.json#name>/ and the OS userData folder.

import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = JSON.parse(readFileSync(join(HERE, '..', 'package.json'), 'utf8'));
const APP_NAME = PKG.name;

const shared = process.argv.includes('--shared');
const hard = process.argv.includes('--hard');
const worktreeData = join(process.cwd(), '.krnl0-data');

const boardDir = process.env.KRNL0_BOARD_DIR
  ?? (shared ? join(homedir(), 'Documents', APP_NAME) : worktreeData);
const boardFile = join(boardDir, 'board.json');

let removed = 0;

if (existsSync(boardFile)) {
  rmSync(boardFile);
  console.log(`✓ removed ${boardFile}`);
  removed += 1;
} else {
  console.log(`(no board file at ${boardFile})`);
}

if (hard) {
  const userDataDir = process.env.KRNL0_USER_DATA ?? (!shared
    ? join(worktreeData, 'electron')
    : process.platform === 'win32'
      ? join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), APP_NAME)
      : process.platform === 'darwin'
        ? join(homedir(), 'Library', 'Application Support', APP_NAME)
        : join(homedir(), '.config', APP_NAME));

  if (existsSync(userDataDir)) {
    rmSync(userDataDir, { recursive: true, force: true });
    console.log(`✓ removed Electron userData at ${userDataDir}`);
    removed += 1;
  } else {
    console.log(`(no userData at ${userDataDir})`);
  }
}

console.log(
  removed > 0
    ? `\nDone. Next \`npm run dev\` will re-seed a fresh board.`
    : `\nNothing to remove. App "${APP_NAME}" already has no local state.`
);
