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

describe('One name per window; no second summary rows (window-frame.md)', () => {
  it('the Timer is called Timer in every mode; its modes are Sessions and Stopwatch', () => {
    const s = src('PomoNode/index.tsx');
    expect(s).toContain(": 'TIMER';");
    expect(s).not.toContain("'TIME LOG'");
    expect(s).not.toContain('DEEP WORK');
    expect(s).toContain("m === 'pomodoro' ? 'SESSIONS' : 'STOPWATCH'");
    const bar = readFileSync(join(process.cwd(), 'src/renderer/components/Station/StationToolbar.tsx'), 'utf8');
    expect(bar).not.toMatch(/'(Record|Pomo)'/);
  });
  it('the Timer shows one progress row (the session dots), not two counters', () => {
    expect(src('PomoNode/index.tsx')).not.toContain('CycleCounter');
  });
  it('Analytics: pages are a named list in the time row, not a row of icons', () => {
    expect(src('AnalyticsNode/index.tsx')).toContain('<div className="kw-range" style={toolbarStyle}>');
    const nav = src('AnalyticsNode/PageNav.tsx');
    expect(nav).toContain('testId="analytics-page"');
    expect(nav).toContain('data-testid="analytics-page-prev"');
    expect(nav).not.toContain('data-testid={`analytics-page-${p.id}`}');
  });
  it('Clock: named Clock; no week rings and no "now" box under the dial', () => {
    const s = src('ClockNode/index.tsx');
    expect(s).toContain('<span className="kw-title">Clock</span>');
    expect(s).not.toContain('data-testid="clock-week-marks"');
    expect(s).not.toContain('`free · ');
  });
});

describe('The bars around the windows (window-frame.md, top bar and status bar)', () => {
  const read = (rel: string): string => readFileSync(join(process.cwd(), 'src/renderer/components', rel), 'utf8');
  it('a top-bar toggle carries the name its window shows', () => {
    const bar = read('Station/StationToolbar.tsx');
    for (const name of ['Timer', 'Todos', 'Habits', 'Calendar', 'Terminal', 'Analytics', 'Clock']) expect(bar).toContain(`label: '${name}'`);
    expect(bar).not.toMatch(/label: '(Cal|Habit|Term|Todo)'/);
  });
  it('Easy: the status bar leaves out the board\'s plumbing', () => {
    const s = read('StatusBar/index.tsx');
    for (const id of ['workspace', 'claude', 'nodes', 'edges', 'zoom']) expect(s).toContain(`{!easy && <StatusItem label="${id}"`);
  });
  it('Clock: one button back to now (Today), not two', () => {
    expect(src('ClockNode/index.tsx')).not.toContain('data-testid="clock-day-now"');
  });
  it('the tucked radio shows only its tab', () => {
    expect(read('AmbientRadio/index.tsx')).toContain('const TUCK_PX = 0;');
  });
});

describe('One layout for the cards that add something (window-frame.md, cards)', () => {
  const root = join(process.cwd(), 'src/renderer/components');
  const cards = ['ui/WhenPopover.tsx', 'nodes/CalendarNode/EventCard.tsx', 'nodes/HabitNode/HabitAddAsk.tsx'].map((f) => readFileSync(join(root, f), 'utf8'));
  it('the plan card, the Calendar card and the habit card share one box, width and footer', () => {
    for (const c of cards) {
      expect(c).toContain('...cardBox, position:');
      expect(c).toContain('const W = CARD_W;');
      expect(c).toContain('cardFoot');
      expect(c).toContain('cardPrimary(');
      expect(c).toContain('<CardClose ');
    }
  });
  it('rows are a label and controls of one height; no card keeps its own sizes', () => {
    for (const c of cards) {
      expect(c).toMatch(/cardRow\b/);
      expect(c).toMatch(/cardLabel\b/);
      expect(c).toContain('style={cardTime}');
      expect(c).not.toContain("padding: 10, borderRadius: 12");
      expect(c).not.toContain('<MenuIcon name="drop" size={12} />');
    }
  });
});
