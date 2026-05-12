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

const root = process.cwd();
const slug = basename(root);
const dataDir = join(root, '.krnl0-data');
mkdirSync(dataDir, { recursive: true });

process.env.KRNL0_BOARD_DIR ??= dataDir;
process.env.KRNL0_USER_DATA ??= join(dataDir, 'electron');

console.log(`[dev] isolated for worktree "${slug}"`);
console.log(`[dev] KRNL0_BOARD_DIR = ${process.env.KRNL0_BOARD_DIR}`);
console.log(`[dev] KRNL0_USER_DATA = ${process.env.KRNL0_USER_DATA}`);

const cmd = process.platform === 'win32' ? 'electron-vite.cmd' : 'electron-vite';
const child = spawn(cmd, ['dev'], {
  stdio: 'inherit',
  env: process.env,
  shell: false,
});
child.on('exit', (code) => process.exit(code ?? 0));
