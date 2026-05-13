#!/usr/bin/env node
/**
 * scripts/dev.mjs — per-worktree-isolated electron-vite dev.
 *
 * Why: every git worktree on this machine otherwise shares
 *   - `~/Documents/krnl0/board.json`   (KRNL0 data)
 *   - `%APPDATA%/krnl0/` or `~/Library/Application Support/krnl0/`  (Chromium cache + userData)
 * That causes (1) cross-branch board state leaks and (2) `cache_util_win`
 * "Access is denied" errors when more than one branch's app runs at once.
 *
 * This script sets `KRNL0_BOARD_DIR` and `KRNL0_USER_DATA` to paths inside
 * the current worktree before spawning electron-vite, so each worktree
 * gets its own data. Honors pre-set env vars if the user wants to point
 * elsewhere.
 */

import { spawn } from 'node:child_process';
import { join, basename } from 'node:path';
import { mkdirSync } from 'node:fs';
import { portFor } from './dev-port.mjs';

const root = process.cwd();
const slug = basename(root);
const dataDir = join(root, '.krnl0-data');
mkdirSync(dataDir, { recursive: true });

process.env.KRNL0_BOARD_DIR ??= dataDir;
process.env.KRNL0_USER_DATA ??= join(dataDir, 'electron');

// Per-worktree Vite dev-server port. Deterministic hash of the absolute
// worktree root so the same worktree always boots on the same port (stable
// URLs across restarts). Range 5174–5273; 5173 stays reserved as the
// no-isolation fallback default.
process.env.KRNL0_DEV_PORT ??= String(portFor(root));

// Critical: ELECTRON_RUN_AS_NODE leaks from some shells (Claude Code sessions,
// Anthropic helper scripts, manual exports). When set, Electron boots as a
// plain Node process — `require('electron')` returns the binary path string,
// `process.type` is undefined, and the main bundle crashes at top level on
// `electron.app.X is undefined`. Always clear it before launching dev.
delete process.env.ELECTRON_RUN_AS_NODE;

console.log(`[dev] isolated for worktree "${slug}"`);
console.log(`[dev] KRNL0_BOARD_DIR = ${process.env.KRNL0_BOARD_DIR}`);
console.log(`[dev] KRNL0_USER_DATA = ${process.env.KRNL0_USER_DATA}`);
console.log(`[dev] KRNL0_DEV_PORT  = ${process.env.KRNL0_DEV_PORT}`);

// On Windows, electron-vite.cmd is a shell shim — spawn cannot exec .cmd
// files directly under Node 22+ without shell:true (EINVAL otherwise).
const isWin = process.platform === 'win32';
const child = spawn('electron-vite', ['dev'], {
  stdio: 'inherit',
  env: process.env,
  shell: isWin,
});
child.on('exit', (code) => process.exit(code ?? 0));
