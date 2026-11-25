/**
 * Option cards never get a fixed column count (owner, 2026-11-25: on a phone
 * "Overnight" and "Crisp" ran past their cards). `.st-choices` fits as many
 * columns as there is room for (launch.css); an inline gridTemplateColumns
 * would squeeze the cards again on a narrow screen.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '../../../src/renderer');
const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? files(p) : p.endsWith('.tsx') ? [p] : [];
});

describe('option cards fit the screen', () => {
  it('no .st-choices sets its own columns', () => {
    const bad: string[] = [];
    for (const f of files(ROOT)) {
      for (const line of readFileSync(f, 'utf8').split('\n')) {
        if (line.includes('className="st-choices"') && /gridTemplateColumns/.test(line)) bad.push(`${f}: ${line.trim()}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('the grid wraps by width and a card never shrinks below its words', () => {
    const css = readFileSync(join(ROOT, 'styles/launch.css'), 'utf8');
    expect(css).toMatch(/\.st-choices \{[^}]*repeat\(auto-fit, minmax\(min\(100%, \d+px\), 1fr\)\)/);
    expect(css).toMatch(/\.st-choice \{ min-width: 0; overflow-wrap: break-word; \}/);
  });
});
