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
    expect(card).toContain("{gridOpen && monthBlock('when')}");
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
    expect(s).toContain("const headerLeft = 'Timer';");
    expect(s).not.toContain("'TIME LOG'");
    expect(s).not.toContain('DEEP WORK');
    expect(s).toContain("m === 'pomodoro' ? 'Sessions' : 'Stopwatch'");
    const bar = readFileSync(join(process.cwd(), 'src/renderer/components/Station/StationToolbar.tsx'), 'utf8');
    expect(bar).not.toMatch(/'(Record|Pomo)'/);
  });
  it('the Timer shows one progress row (the session dots), not two counters', () => {
    expect(src('PomoNode/index.tsx')).not.toContain('CycleCounter');
  });
  it('Analytics: pages are a row of icons in the time row, the current one named (owner, 2026-11-20)', () => {
    expect(src('AnalyticsNode/index.tsx')).toContain('<div className="kw-range" style={toolbarStyle}>');
    const nav = src('AnalyticsNode/PageNav.tsx');
    expect(nav).toContain('data-testid={`analytics-page-${p.id}`}');
    expect(nav).toContain('data-testid="analytics-page-label"');
    expect(nav).not.toContain('AppSelect');
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

describe('Cards are a list you read; the Timer is a clock first (window-frame.md; owner pick A)', () => {
  const root = join(process.cwd(), 'src/renderer');
  const read = (f: string): string => readFileSync(join(root, f), 'utf8');
  it('every card puts its settings in one filled block, a line each', () => {
    for (const f of ['components/ui/WhenPopover.tsx', 'components/nodes/CalendarNode/EventCard.tsx', 'components/nodes/HabitNode/HabitAddAsk.tsx', 'components/ui/SpanEditor.tsx']) {
      expect(read(f), f).toContain('<CardGroup>');
    }
  });
  it('words are set in the reading font; the card file draws no outlined boxes', () => {
    expect(read('styles/tokens.css')).toContain("--font-read:  'Geist'");
    const card = read('components/ui/addCard.tsx');
    expect(card).toContain("const READ = 'var(--font-read)'");
    expect(card).not.toContain('inset 0 0 0 1px');
    expect(card).not.toContain("textTransform: 'uppercase'");
  });
  it('the plan card: the day is one line of at most four choices, named in full', () => {
    const c = read('components/ui/WhenPopover.tsx');
    expect(c).toContain("['tmrw', 'Tomorrow', tomorrow]");
    expect(c).toContain('<div style={cardDays}>');
  });
  it('the Timer face: the time, today as one line; no total tiles', () => {
    const d = read('components/nodes/PomoNode/ObserveDash.tsx');
    expect(d).toContain('data-testid="pomo-observe-today"');
    expect(d).toContain('export function TimerClock(');
    expect(d).not.toContain("'work today'");
    expect(read('styles/window-frame.css')).toContain('.pomo-body[data-idle="true"] .pomo-what:has(> [data-testid="pomo-planned-now"])');
  });
});

describe('Aligned and unified (owner list, 2026-11-20)', () => {
  const root = join(process.cwd(), 'src/renderer');
  const read = (f: string): string => readFileSync(join(root, f), 'utf8');
  it('header and time-row controls keep one height (no 24 px segment inside a 22 px switch)', () => {
    const css = read('styles/window-frame.css');
    expect(css).toContain('.kw-views > button { min-height: 0; }');
    expect(css).toContain('.kw-btn.clock-day-today {');
  });
  it('the Timer body fills its window in both layouts, so nothing is left empty under START', () => {
    expect(read('components/nodes/PomoNode/index.tsx')).toContain("gap: bodyGap, flex: '1 1 auto', minHeight: 0 }}>");
  });
  it('a card shows a time range as "start – end" after the field, not a grey "to" before it', () => {
    const c = read('components/nodes/CalendarNode/EventCard.tsx');
    expect(c).toContain('data-testid="event-end"');
    expect(c).not.toContain('`to ${end}`');
  });
  it('the plan popup and the task picker use filled buttons in the reading font', () => {
    expect(read('components/ui/TaskInfoPopup.tsx')).toContain("fontFamily: 'var(--font-read)', fontSize: 13, whiteSpace: 'nowrap'");
    const p = read('components/nodes/PomoNode/DoingPicker.tsx');
    expect(p).not.toContain("textTransform: 'uppercase'");
    expect(p).toContain("'Or a kind of work'");
  });
  it('the Year view has the standard time row and names its colours', () => {
    const y = read('components/nodes/CalendarNode/YearView.tsx');
    expect(y).toContain('data-testid="calendar-year-today"');
    expect(y).toContain('data-testid="calendar-year-legend"');
  });
});

describe('The window standard: one header, time row and footer (owner pick, 2026-11-20)', () => {
  const root = join(process.cwd(), 'src/renderer');
  const read = (f: string): string => readFileSync(join(root, f), 'utf8');
  const css = read('styles/window-frame.css');
  it('sizes: header 40, time row 36, footer 48; words in the reading font, in normal letters', () => {
    expect(css).toContain('.kw-head { height: 40px; padding: 0 12px 0 16px; font-family: var(--font-read);');
    expect(css).toContain('.kw-range { height: 36px;');
    expect(css).toContain('.kw-foot { height: 48px;');
    expect(css).toContain('.kw-title { font-family: var(--font-read); font-size: 13.5px; font-weight: 600; letter-spacing: 0; text-transform: none;');
  });
  it('the view switch is a quiet filled bar with the chosen view lifted (not outlined, not lime)', () => {
    expect(css).toContain('.kw-views { height: 28px; padding: 2px; border: 0; border-radius: 8px; background: var(--paper-2);');
    expect(css).toContain(".kw-views > button[aria-selected='true'] { background: var(--paper-3); color: var(--ink); font-weight: 600; }");
  });
  it('icon and footer buttons have no outline', () => {
    expect(css).toContain('.kw-btn { height: 28px; min-width: 28px; padding: 0; border: 0;');
    expect(css).toContain('.kw-action { height: 34px; border: 0;');
  });
  it('a header is the name, then one fact: Todos and Habits no longer put the fact inside the name', () => {
    expect(read('components/nodes/TodoNode/index.tsx')).toContain('<span className="kw-title">Todos</span>');
    expect(read('components/nodes/HabitNode/index.tsx')).toContain('<span className="kw-title">Habits</span>');
  });
  it('the slot badge over a window header in the Free layout is not drawn', () => {
    expect(read('components/nodes/MotherFrame/index.tsx')).toContain('const SHOW_SLOT_BADGE: boolean = false;');
  });
});

describe('Timer A: one face, two layers (owner pick and corrections, 2026-11-20)', () => {
  const root = join(process.cwd(), 'src/renderer/components/nodes/PomoNode');
  const read = (f: string): string => readFileSync(join(root, f), 'utf8');
  it('both modes draw the same clock; there is no choice of faces', () => {
    const s = read('index.tsx');
    expect(s).toContain('const oneFace = !observe;');
    expect(s).toContain('<TimerClock text={clockText} blink={running} />');
  });
  it('no line of words under the time, and the time never dims: the state is said in the header', () => {
    const d = read('ObserveDash.tsx');
    expect(d).not.toContain("'Not running'");
    expect(d).not.toContain("'On break'");
    expect(d).not.toContain('dim');
    expect(read('index.tsx')).toContain('<span className="kw-ctx" data-testid="pomo-observe-status" role="status"');
    expect(read('index.tsx')).toContain('<div className="pomo-what" data-testid="pomo-what"');
  });
  it('a plan due now is one pill (no card, no underlined link)', () => {
    const c = read('PlannedNowChip.tsx');
    expect(c).not.toContain('pick something else</');
    expect(c).not.toContain('inset 0 -1px 0');
    expect(c).toContain("borderRadius: 999, background: 'var(--paper-2)'");
  });
  it('footer buttons are in normal letters; settings are a list with a stepper per line', () => {
    const s = read('index.tsx');
    expect(s).not.toMatch(/>\s*(START|STOP|BREAK|NEW|EXTEND|CANCEL|SAVE)\s*</);
    expect(s).toContain('data-testid={`pomo-settings-${key}-inc`}');
    expect(read('display.ts')).toContain("case 'running': return 'Pause';");
  });
});

describe('Two styles, one clock, no small extras (owner, 2026-11-20)', () => {
  const root = join(process.cwd(), 'src/renderer');
  const read = (f: string): string => readFileSync(join(root, f), 'utf8');
  it('only Paper and Pro are offered, in Settings; the canvas panel has no style button', () => {
    expect(read('components/ChassisLayer/dockRegistry.tsx')).toContain("export const VISIBLE_DOCK_STYLES: DockStyle[] = ['classic', 'pro'];");
    expect(read('components/TopBar/SettingsModal.tsx')).toContain('data-testid={`settings-style-${s}`}');
    expect(read('components/Dock/index.tsx')).toContain('const SHOW_STYLE_PICKER: boolean = false;');
    expect(read('components/ChassisLayer/useDockStyle.ts')).toContain('VISIBLE_DOCK_STYLES.includes(v as DockStyle)');
  });
  it('the Timer has one clock: no face picker in its settings', () => {
    const s = read('components/nodes/PomoNode/index.tsx');
    expect(s).not.toContain('data-testid="pomo-face-picker"');
    expect(s).toContain('const oneFace = !observe;');
  });
  it('the plan card has no second pane: the deadline opens under its line', () => {
    const c = read('components/ui/WhenPopover.tsx');
    expect(c).toContain('data-testid="when-deadline-open"');
    expect(c).toContain("{monthBlock('deadline')}");
    expect(c).not.toContain('data-testid="when-tab-when"');
  });
  it('no helper line or underlined link on the habit card; no gap chips on Log time', () => {
    const h = read('components/nodes/HabitNode/HabitAddAsk.tsx');
    expect(h).not.toContain('data-testid="habit-ask-calendar"');
    expect(h).not.toContain('data-testid="habit-ask-goal-help"');
    expect(read('components/ui/SpanEditor.tsx')).not.toContain('<LogTimeGaps');
  });
});

describe('Separate boards (Decision 49, boards.md)', () => {
  const root = join(process.cwd(), 'src');
  const read = (f: string): string => readFileSync(join(root, f), 'utf8');
  it('the top bar shows the board menu, not the canvas menu', () => {
    const bar = read('renderer/components/TopBar/index.tsx');
    // In Easy and Advanced alike (owner, 2026-11-21): no mode hides it.
    expect(bar).toContain('<BoardSwitcher />');
    expect(bar).not.toContain('<BoardSwitcher quiet');
    expect(bar).not.toContain('<CanvasSwitcher');
  });
  it('the menu has no explanatory note, and a new board asks: empty, or copy my habits', () => {
    const m = read('renderer/components/TopBar/BoardSwitcher.tsx');
    expect(m).toContain("'Start empty'");
    expect(m).toContain("'Copy my habits'");
    expect(m).not.toMatch(/on every (canvas|board)/i);
  });
  it('one timer at a time: the Timer checks the other boards before it starts', () => {
    expect(read('renderer/components/nodes/PomoNode/index.tsx')).toContain("(state.status === 'idle' || state.status === 'done') && blockedByOtherBoard()");
    expect(read('renderer/components/TopBar/BoardSwitcher.tsx')).toContain('data-testid="board-recording-chip"');
  });
  it('the window cannot save its old board over the new one while a switch is in flight', () => {
    const h = read('main/ipc/handlers.ts');
    expect(h).toContain("if (boardsSwitching) return; // the window is about to reload onto another board");
    expect(h).toContain('boardsSwitching = false;');
  });
  it('krnl has the board commands', () => {
    const reg = read('shared/cli/commandRegistry.ts');
    for (const u of ['board list [--json]', 'board new <name> [--copy-habits]', 'board switch <id|name>', 'board rename <id|name> <new name>', 'board delete <id|name>']) expect(reg).toContain(u);
  });
});

describe('Visual bugs fixed (owner list, 2026-11-20)', () => {
  const root = join(process.cwd(), 'src');
  const read = (f: string): string => readFileSync(join(root, f), 'utf8');
  it('Timer header: opening settings closes the spans log, so there is never a second ×', () => {
    expect(read('renderer/components/nodes/PomoNode/index.tsx')).toContain('else { setLogOpen(false); openGear(); }');
  });
  it('the top bar follows the window standard: reading font, normal letters, no outlines', () => {
    const css = read('renderer/styles/window-frame.css');
    expect(css).toContain('[data-testid="topbar"] .krnl-topbar-btn {');
    expect(css).toContain('[data-testid="topbar-panel-toggles"] .krnl-panel-toggle {');
    // Decision 54 — the Station / Free switch became the layout menu.
    const t = read('renderer/components/ui/LayoutMenu.tsx');
    expect(t).toContain('data-testid="layout-menu"');
    expect(read('shared/stationLayouts.ts')).toContain("label: 'Free'");
  });
  it('no second frame inside a window: Analytics draws no border of its own, Pro light has no inset highlight', () => {
    expect(read('renderer/components/nodes/AnalyticsNode/index.tsx')).toContain("borderRadius: 'calc(var(--k-mother-radius, 8px) - 1px)'");
    expect(read('renderer/themes/manifests.ts')).toContain("'--k-mother-shadow': '0 0 0 1px #cfcfca, 0 18px 36px rgba(0,0,0,0.10)',");
  });
  it('the window buttons take the top bar colours (no dark block in a light theme)', () => {
    expect(read('main/ipc/handlers.ts')).toContain("ipcMain.handle('window:titleBarColors'");
    expect(read('renderer/components/TopBar/index.tsx')).toContain('window.krnl.titleBarColors(bg, ink)');
  });
});

describe('The Timer clock, the layout switch and a flat Analytics header (owner, 2026-11-20)', () => {
  const root = join(process.cwd(), 'src/renderer');
  const read = (f: string): string => readFileSync(join(root, f), 'utf8');
  it('the time is set in the clock font, grows with the window, and its colon is two drawn dots centred on the digits', () => {
    const d = read('components/nodes/PomoNode/ObserveDash.tsx');
    expect(d).toContain("text.length > 5 ? 'clamp(44px, 14cqw, 112px)' : 'clamp(60px, 20cqw, 152px)'");
    expect(d).toContain("alignItems: 'center', fontFamily: 'var(--font-clock)'");
    expect(d).toContain('data-testid="pomo-colon" role="presentation"');
  });
  it('Fit sits before the layout menu, so the menu never moves when Fit appears', () => {
    const bar = read('components/TopBar/index.tsx');
    expect(bar.indexOf('testId="topbar-fit"')).toBeGreaterThan(0);
    expect(bar.indexOf('testId="topbar-fit"')).toBeLessThan(bar.indexOf('<LayoutMenu />'));
  });
  it('the layout menu lists every layout as a radio item with a drawing of it (Decision 54)', () => {
    const m = read('components/ui/LayoutMenu.tsx');
    expect(m).toContain('role="menuitemradio"');
    expect(m).toContain('<LayoutGlyph rects={o.glyph}');
  });
  it('the Analytics header is flat: no gradient, no shadow', () => {
    const a = read('components/nodes/AnalyticsNode/index.tsx');
    expect(a).toContain('The same flat header as every window: no gradient, no shadow');
    expect(a).not.toContain('inset 0 -1px 0 rgba(255,255,255,0.03)');
  });
});
