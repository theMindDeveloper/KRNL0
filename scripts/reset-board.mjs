#!/usr/bin/env node
// Clear the local board.json (and optionally Electron userData) for this
// app instance. After running, the next `npm run dev` will re-seed a fresh
// board via seedBoard() in src/main/ipc/handlers.ts.
//
// Usage:
//   node scripts/reset-board.mjs            # delete board.json only
//   node scripts/reset-board.mjs --hard     # also wipe Electron userData
//
// Resolves the same paths handlers.ts uses:
//   BOARD_DIR  = $KRNL0_BOARD_DIR ?? ~/Documents/<package.json#name>/
//   userData   = OS-default Electron userData folder for <package.json#name>

import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = JSON.parse(readFileSync(join(HERE, '..', 'package.json'), 'utf8'));
const APP_NAME = PKG.name;

const boardDir = process.env.KRNL0_BOARD_DIR ?? join(homedir(), 'Documents', APP_NAME);
const boardFile = join(boardDir, 'board.json');

const hard = process.argv.includes('--hard');

let removed = 0;

if (existsSync(boardFile)) {
  rmSync(boardFile);
  console.log(`✓ removed ${boardFile}`);
  removed += 1;
} else {
  console.log(`(no board file at ${boardFile})`);
}

if (hard) {
  const userDataDir =
    process.platform === 'win32'
      ? join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), APP_NAME)
      : process.platform === 'darwin'
        ? join(homedir(), 'Library', 'Application Support', APP_NAME)
        : join(homedir(), '.config', APP_NAME);

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
