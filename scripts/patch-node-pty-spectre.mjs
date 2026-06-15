#!/usr/bin/env node
/**
 * node-pty's binding.gyp requests Spectre-mitigated MSVC libs (MSB8040) which
 * many Windows dev boxes don't have installed. Strip the flag so native rebuilds
 * can compile without the optional VS component.
 */
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', 'node-pty');
if (!existsSync(root)) process.exit(0);

const SPECTRE_BLOCK = /,?\s*'msvs_configuration_attributes'\s*:\s*\{\s*'SpectreMitigation'\s*:\s*'Spectre'\s*\}/g;
const SPECTRE_VCX = /\s*<SpectreMitigation>Spectre<\/SpectreMitigation>\r?\n/g;

let changed = false;

for (const rel of ['binding.gyp', 'deps/winpty/src/winpty.gyp']) {
  const path = join(root, rel);
  if (!existsSync(path)) continue;
  const before = readFileSync(path, 'utf8');
  const after = before.replace(SPECTRE_BLOCK, '');
  if (after !== before) {
    writeFileSync(path, after);
    changed = true;
  }
}

const buildDir = join(root, 'build');
if (existsSync(buildDir)) {
  for (const file of ['pty.vcxproj', 'conpty.vcxproj', 'conpty_console_list.vcxproj']) {
    const path = join(buildDir, file);
    if (!existsSync(path)) continue;
    const before = readFileSync(path, 'utf8');
    const after = before.replace(SPECTRE_VCX, '');
    if (after !== before) {
      writeFileSync(path, after);
      changed = true;
    }
  }
  for (const rel of [
    'deps/winpty/src/winpty.vcxproj',
    'deps/winpty/src/winpty-agent.vcxproj',
  ]) {
    const path = join(buildDir, rel);
    if (!existsSync(path)) continue;
    const before = readFileSync(path, 'utf8');
    const after = before.replace(SPECTRE_VCX, '');
    if (after !== before) {
      writeFileSync(path, after);
      changed = true;
    }
  }
  // Gyp edits require a clean configure when vcxproj was generated with Spectre on.
  if (changed) {
    rmSync(buildDir, { recursive: true, force: true });
  }
}
