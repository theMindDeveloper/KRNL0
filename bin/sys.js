#!/usr/bin/env node
// T25: Deprecated alias for krnl. Writes a note to stderr then delegates.
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

process.stderr.write('sys is deprecated; use krnl\n');

const __dirname = dirname(fileURLToPath(import.meta.url));
const krnl = join(__dirname, 'krnl.js');
const child = spawn(process.execPath, [krnl, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
});
child.on('exit', (code) => process.exit(code ?? 0));
