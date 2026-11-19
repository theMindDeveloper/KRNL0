/**
 * The window frame (docs/04-visual-system/window-frame.md): every window uses
 * the shared header, time row and footer classes, so the same job is in the
 * same place at the same size. This reads the sources: a window that builds
 * its own header or footer again fails here.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const NODES = join(process.cwd(), 'src/renderer/components/nodes');
const src = (rel: string): string => readFileSync(join(NODES, rel), 'utf8');
const css = readFileSync(join(process.cwd(), 'src/renderer/styles/window-frame.css'), 'utf8');

const WINDOWS = ['PomoNode/index.tsx', 'TodoNode/index.tsx', 'CalendarNode/index.tsx', 'ClockNode/index.tsx', 'HabitNode/index.tsx', 'AnalyticsNode/index.tsx', 'TerminalNode/index.tsx'];

describe('Every window uses the standard header', () => {
  for (const w of WINDOWS) {
    it(w, () => {
      const lines = src(w).split('\n').filter((l) => l.includes('krnl-node-header'));
      expect(lines.length).toBeGreaterThan(0);
      for (const l of lines) expect(l, l.trim()).toContain('kw-head');
    });
  }
});

describe('Views sit in the header as one switch', () => {
  it('Calendar: DAY / WEEK / MONTH / YEAR in the header, no tabs at the bottom', () => {
    const s = src('CalendarNode/index.tsx');
    expect(s).toContain('data-testid="calendar-view-switch"');
    expect(s).toContain('kw-views');
    expect(s).not.toContain('View toggle buttons');
  });
  it('Clock: one switch (DAY / BIG CLOCK / WEEK), not loose buttons', () => {
    const s = src('ClockNode/index.tsx');
    expect(s).toContain('data-testid="clock-view-switch"');
    for (const id of ['clock-view-day', 'clock-dial-only', 'clock-week-toggle']) expect(s).toContain(`data-testid="${id}"`);
  });
  it('Habits and the Timer use the same switch', () => {
    expect(src('HabitNode/index.tsx')).toMatch(/habit-view-switch"[^>]*kw-views/);
    expect(src('PomoNode/index.tsx')).toContain('className="kw-views"');
  });
});

describe('The thing you do sits in the footer', () => {
  it('Todo, Habits, Calendar and the Timer each have the standard footer row', () => {
    expect(src('TodoNode/index.tsx')).toContain('todo-add kw-foot');
    expect(src('HabitNode/index.tsx')).toContain('habit-add kw-foot');
    expect(src('CalendarNode/WeekView.tsx')).toContain('className="kw-foot"');
    expect(src('PomoNode/index.tsx')).toContain('kw-foot pomo-foot');
  });
  it('the Calendar adds from its footer, not from a + in the time row', () => {
    const s = src('CalendarNode/WeekView.tsx');
    const foot = s.slice(s.indexOf('className="kw-foot"'));
    expect(foot.slice(0, 600)).toContain('data-testid="calendar-new"');
    expect(s.split('data-testid="calendar-new"').length - 1).toBe(1);
  });
  it('"log past time" is a button in the Timer footer, not a link under START', () => {
    const s = src('PomoNode/PomoTimeLinks.tsx');
    expect(s).toContain('className="kw-action nodrag"');
    expect(s).not.toContain('textDecoration');
  });
});

describe('One size per row', () => {
  it('header 36px, time row 32px, footer 44px', () => {
    expect(css).toMatch(/\.kw-head \{\s*height: 36px;/);
    expect(css).toMatch(/\.kw-range \{\s*height: 32px;/);
    expect(css).toMatch(/\.kw-foot \{\s*height: 44px;/);
  });
});

describe('Menus: six rows at most, the rest behind More (menus.md)', () => {
  it('a menu row can hold rarer rows, and the menu shows a way back', () => {
    const menu = readFileSync(join(process.cwd(), 'src/renderer/components/ContextMenu/index.tsx'), 'utf8');
    expect(menu).toContain('children?: ContextMenuItem[]');
    expect(menu).toContain('data-testid="menu-back"');
  });
  it('the plan menus (Todo row, board card) and the habit and event menus use More', () => {
    expect(src('TodoNode/index.tsx')).toMatch(/label: 'More', icon: <MenuIcon name="more" \/>, children: more/);
    expect(src('TaskNode/index.tsx')).toMatch(/label: 'More', icon: <MenuIcon name="more" \/>, children: moreItems/);
    expect(src('CalendarNode/WeekView.tsx')).toMatch(/label: 'More', icon: <MenuIcon name="more" \/>, children: more/);
    expect(src('HabitNode/HabitContextMenu.tsx')).toContain('testId="habit-menu-more"');
  });
  it('the board card says "Rename" and "When…" like the Todo row', () => {
    const s = src('TaskNode/index.tsx');
    expect(s).toContain("label: 'Rename'");
    expect(s).toContain("label: 'When…'");
    expect(s).not.toContain("label: 'Edit text'");
  });
});

describe('The plan card is short by default (window-frame.md, cards)', () => {
  const card = readFileSync(join(process.cwd(), 'src/renderer/components/ui/WhenPopover.tsx'), 'utf8');
  it('the month opens only when asked for, and the main button says Save', () => {
    expect(card).toContain('{gridOpen && (');
    expect(card).toContain("primaryLabel ?? 'Save ↵'");
    expect(card).not.toContain("'Done ↵'");
  });
  it('its actions are what happened, Won’t do, Delete; the rest behind More', () => {
    expect(card).toContain("const MAIN = ['done', 'wontdo', 'delete']");
    expect(card).toContain('data-testid="plan-card-more"');
  });
});
