// #291 — main (and the sys commands it runs) is bundled into one file,
// out/main/index.js. A runtime require('../…') keeps its source-relative path
// and finds nothing in a packaged app ("Cannot find module '../../main/boardIo'").
// Use a static import instead.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT = join(__dirname, '..', '..', '..');

// out/main/index.js → ../../package.json is app.asar/package.json, so this one resolves.
const ALLOWED = new Set(["src/sys/SysFacade.ts:require('../../package.json')"]);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === '__tests__' ? [] : files(p);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });
}

describe('bundled main has no source-relative require (#291)', () => {
  it('src/main and src/sys use static imports', () => {
    const bad: string[] = [];
    for (const f of [...files(join(ROOT, 'src', 'main')), ...files(join(ROOT, 'src', 'sys'))]) {
      const rel = relative(ROOT, f).split('\\').join('/');
      for (const m of readFileSync(f, 'utf8').matchAll(/require\((['"])\.\.?\/[^'"]*\1\)/g)) {
        const key = `${rel}:${m[0].replace(/"/g, "'")}`;
        if (!ALLOWED.has(key)) bad.push(key);
      }
    }
    expect(bad).toEqual([]);
  });
});
