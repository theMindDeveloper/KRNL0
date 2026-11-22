/**
 * Decisions 61 and 63 — ONE drag for everything carried onto the Calendar.
 * Plans, events and habits are carried by calendarDrag.ts (it follows the
 * pointer every frame and draws the one look: the ghost, its time line, the
 * small box). The browser's drag is not used for them: it moves in ~50 ms
 * steps and shows the system's grey box beside the pointer. The owner found
 * three different looks once and a laggy drag later; this keeps either from
 * creeping back.
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
const rel = (f: string) => relative(ROOT, f).replace(/\\/g, '/');

describe('one drag for plans (Decisions 61, 63)', () => {
  const all = files(ROOT);

  it('no plan or habit is carried by the browser drag', () => {
    const browser = all.filter((f) => /setData\(\s*'application\/krnl-(task|habit)'/.test(readFileSync(f, 'utf8'))).map(rel);
    expect(browser).toEqual([]);
  });

  it('every place that carries a plan starts the one engine', () => {
    const engine = all.filter((f) => /beginCalendarDrag\(/.test(readFileSync(f, 'utf8'))).map(rel);
    expect(engine).toEqual(expect.arrayContaining([
      'components/nodes/CalendarNode/WeekView.tsx',
      'components/nodes/CalendarNode/MonthView.tsx',
      'components/nodes/TodoNode/index.tsx',
      'components/nodes/TaskNode/index.tsx',
      'components/nodes/HabitNode/index.tsx',
    ]));
  });

  it('only the engine opens the small box', () => {
    const carry = all.filter((f) => /\bstartCarry\(/.test(readFileSync(f, 'utf8'))).map(rel).sort();
    expect(carry).toEqual(['components/nodes/CalendarNode/DropGhost.tsx', 'components/nodes/CalendarNode/calendarDrag.ts']);
  });
});
