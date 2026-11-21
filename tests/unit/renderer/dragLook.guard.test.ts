/**
 * Decision 61 — ONE drag look for plans. Every place that starts dragging a
 * plan (the `application/krnl-task` payload) goes through DropGhost.tsx's
 * startCarry: no browser drag picture of its own, no second preview. The owner
 * found three different looks once; this keeps a fourth from creeping back.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT = join(__dirname, '..', '..', '..', 'src', 'renderer');

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== '__tests__') out.push(...files(p)); }
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

describe('one drag look for plans (Decision 61)', () => {
  const sources = files(ROOT).filter((f) => /setData\(\s*'application\/krnl-task'/.test(readFileSync(f, 'utf8')));

  it('finds the places that drag plans', () => {
    const names = sources.map((f) => relative(ROOT, f).replace(/\\/g, '/'));
    expect(names).toEqual(expect.arrayContaining([
      'components/nodes/CalendarNode/WeekView.tsx',
      'components/nodes/CalendarNode/MonthView.tsx',
      'components/nodes/TodoNode/index.tsx',
      'components/nodes/TaskNode/index.tsx',
    ]));
  });

  it('each one carries the plan with startCarry and sets no drag picture of its own', () => {
    for (const f of sources) {
      const src = readFileSync(f, 'utf8');
      const name = relative(ROOT, f);
      expect(src, `${name} should use startCarry`).toMatch(/startCarry\(/);
      expect(src, `${name} sets its own drag picture`).not.toMatch(/setDragImage\(/);
    }
  });
});
