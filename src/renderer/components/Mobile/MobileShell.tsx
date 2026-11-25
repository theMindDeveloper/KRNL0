// The web app on a phone or an iPad (Decision 51, Decision 56, Decision 67).
// One shell, three arrangements of the board's own windows:
//   phone   header · one view · tab bar (Today, Todos, Calendar, Habits, More)
//   dock    a phone on its side: slim rail (Today, Todos, Week, Habits, More) ·
//           two windows you choose, side by side, and the Timer pill
//   tablet  side rail (Today, Week, Habits, Insights, Canvas) · two-column
//           Today whose four windows you choose
// More (phone and dock) is a small popup, not a page.
// Today on a phone (design "KRNL0 phone Today", direction A, 2026-11-22) fits
// one screen: the date and one line, the Clock with the day's plans as arcs,
// the day's items as small chips, and one compact Timer card. Todos have their
// own tab; Insights and Canvas sit under More. Focus: the Timer on its own.
// The open view is this browser's own (sessionStorage), never synced.

import { useEffect, useRef, useState } from 'react';
import { useNodesInitialized, useReactFlow } from '@xyflow/react';
import { CANVAS_FIT_PADDING } from '../Canvas/fitPadding';
import { useBoardStore } from '../../store/boardStore';
import { useEasyMode } from '../../store/uiMode';
import { BoardSwitcher } from '../TopBar/BoardSwitcher';
import { SettingsModal, type Theme } from '../TopBar/SettingsModal';
import { SaveSyncBadge } from '../Sync/SyncChip';
import { EmbeddedCanvasCell } from '../Station/EmbeddedCanvasCell';
import { MothersElsewhereContext, setMothersElsewhere } from '../Station/useStationViewportGate';
import { makeCommandHandler } from '../Canvas/commandDispatch';
import { pomoClock, formatElapsed, formatRemaining, isObserve } from '../nodes/PomoNode/derive';
import type { PomoConfig, PomoState } from '../nodes/PomoNode/types';
import { MotherWindow } from './MotherWindow';
import { toneOf, useDayAgenda } from './DayList';
import { dayLine, type AgendaItem, type DayAgenda } from './dayAgenda';
import type { FormFactor } from './useFormFactor';
import { Popover, TimerPill, WindowSlots, useSlots } from './WindowSlots';
import type { MotherKind } from './MotherWindow';
import { CalendarMinHourContext, DOCK_MIN_HOUR } from '../nodes/CalendarNode/minHour';
import logo from '../../assets/launch/logo.webp';
import './mobile.css';

type View = 'today' | 'todos' | 'calendar' | 'habits' | 'insights' | 'canvas' | 'more';

const VIEWS: ReadonlyArray<{ id: View; phone: string; tablet: string; d: string }> = [
  { id: 'today', phone: 'Today', tablet: 'Today', d: 'M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM4 9h16M8 3v4M16 3v4M12 14h.01' },
  { id: 'todos', phone: 'Todos', tablet: 'Todos', d: 'M4 4h5v5H4zM5.5 6.5l1 1 1.5-2M12 6.5h8M4 15h5v5H4zM12 17.5h8' },
  { id: 'calendar', phone: 'Calendar', tablet: 'Week', d: 'M4 5h16v15H4zM4 9h16M9.5 9v11M14.5 9v11' },
  { id: 'habits', phone: 'Habits', tablet: 'Habits', d: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 17l2 2 4-4' },
  { id: 'insights', phone: 'Insights', tablet: 'Insights', d: 'M5 20V10M10 20V4M15 20v-7M20 20v-4' },
  { id: 'canvas', phone: 'Canvas', tablet: 'Canvas', d: 'M4 5h6v5H4zM14 14h6v5h-6zM10 7.5h3a2 2 0 0 1 2 2V14' },
  { id: 'more', phone: 'More', tablet: 'More', d: 'M4.5 12h1M11.5 12h1M18.5 12h1' },
];
const viewOf = (id: View) => VIEWS.find((v) => v.id === id)!;
/** The phone's tab bar and the sideways phone's rail; Insights and Canvas open from More. */
const PHONE_TABS: View[] = ['today', 'todos', 'calendar', 'habits', 'more'];
type Shell = Exclude<FormFactor, 'desktop'>;
/** Phone and sideways phone: small screens, More holds the rest. */
const small = (ff: Shell): boolean => ff !== 'tablet';
/** The iPad's rail (its Today already holds the Plans). */
const TABLET_RAIL: View[] = ['today', 'calendar', 'habits', 'insights', 'canvas'];

const VIEW_KEY = 'krnl0-web-view';
const readView = (): View => {
  try {
    const v = sessionStorage.getItem(VIEW_KEY);
    // More is a popup now, never a page of its own.
    if (v && v !== 'more' && VIEWS.some((x) => x.id === v)) return v as View;
  } catch { /* private window */ }
  return 'today';
};

function Icon({ d, size = 22 }: { d: string; size?: number }) {
  return (
    <svg className="m-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const GEAR = 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14.3 3h-4l-.4 2.5a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5.5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2l.4 2.7h4l.4-2.7a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z';
const BACK = 'M15 6l-6 6 6 6';
const EXPAND = 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5';

// ── Small pieces of state for the headline and Focus ────────────────────────

const ymd = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The line under the date: plans done today and the day's events (dayAgenda.ts). */
function useTodayLine(): string {
  return dayLine(useDayAgenda().agenda);
}

/** The timer's live reading while it runs, or null when it is idle. */
function useTimerReading(): { text: string; label: string } | null {
  const easy = useEasyMode();
  const pomo = useBoardStore((s) => s.board?.nodes.find((n) => n.isMother && n.kind === 'pomo') ?? null);
  const [now, setNow] = useState(() => Date.now());
  const state = pomo?.state as PomoState | undefined;
  const active = !!state && (state.status === 'running' || state.status === 'paused' || state.status === 'break');
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [active]);
  if (!pomo || !state || !active) return null;
  const config = (pomo.config ?? {}) as PomoConfig;
  const clock = pomoClock(state, config, now);
  if (state.status === 'break') return { text: formatElapsed(clock.breakElapsedMs), label: 'Break' };
  const text = isObserve(config, easy) ? formatElapsed(clock.liveWorkMs) : formatRemaining(clock.remainingMs);
  return { text, label: state.status === 'paused' ? 'Paused' : 'Focus' };
}

function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'));
  const choose = (t: Theme): void => {
    setTheme(t);
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('krnl0-theme', t); } catch { /* private window */ }
  };
  return [theme, choose];
}

// ── The views ───────────────────────────────────────────────────────────────

/**
 * The first time the canvas opens on this page, frame the cards (later visits
 * keep where you were). A phone has no map in the corner, so only the tool
 * dock on the left needs room; and as cards can lie far apart, a phone frames
 * the plan cards (what you act on) at a readable size; you pan to the rest.
 */
let canvasFitted = false;
function FitOnFirstOpen({ phone }: { phone: boolean }) {
  const { fitView, getNodes, getNodesBounds } = useReactFlow();
  // After the cards are measured: a fit before that frames nothing.
  const measured = useNodesInitialized();
  useEffect(() => {
    if (canvasFitted || !measured) return;
    const id = window.setTimeout(() => {
      // A plan card's node type is its kind, 'todo.task' ('task' matched none,
      // so a phone framed every card at 55% and opened on empty canvas).
      let cards = phone ? getNodes().filter((n) => n.type === 'todo.task' && !n.hidden) : [];
      // Cards too far apart to read together: framing them all centred on the
      // empty space between them. Start at the first card (top, then left)
      // and the cards that fit beside it; you pan to the rest.
      if (phone && cards.length > 1) {
        const roomW = Math.max(120, window.innerWidth - 92) / 0.55;
        const roomH = Math.max(160, window.innerHeight - 200) / 0.55;
        const all = getNodesBounds(cards);
        if (all.width > roomW || all.height > roomH) {
          const first = [...cards].sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x)[0]!;
          const near = cards.filter((n) => n.position.x >= first.position.x - 40 && n.position.x + (n.measured?.width ?? 0) <= first.position.x + roomW
            && n.position.y >= first.position.y - 40 && n.position.y + (n.measured?.height ?? 0) <= first.position.y + roomH);
          cards = near.length > 0 ? near : [first];
        }
      }
      const tasks = cards.map((n) => ({ id: n.id }));
      try {
        void fitView({
          padding: phone ? { top: '24px', right: '20px', bottom: '72px', left: '72px' } : CANVAS_FIT_PADDING,
          duration: 300,
          maxZoom: 1,
          // Five cards side by side fit a phone only at 25%, where nothing can
          // be read: stay readable and centred on them instead.
          ...(phone ? { minZoom: 0.55 } : {}),
          ...(tasks.length > 0 ? { nodes: tasks } : {}),
        });
        canvasFitted = true;
      } catch { /* not ready: Fit is in the corner */ }
    }, 80);
    return () => window.clearTimeout(id);
  }, [fitView, getNodes, getNodesBounds, phone, measured]);
  return null;
}

const CAL_VIEW_KEY = 'krnl0-web-calendar-view';
const CAL_TODAY_KEY = 'krnl0-web-calendar-today';
type CalView = 'day' | 'week' | 'month' | 'year';

function CalendarView({ ff }: { ff: Shell }) {
  // A phone shows one day by default, a phone on its side the week; the
  // choice stays on this phone (the stored view is the desktop's and is never
  // changed from here).
  const [calView, setCalView] = useState<CalView>(() => {
    try { const v = sessionStorage.getItem(CAL_VIEW_KEY); if (v === 'day' || v === 'week' || v === 'month' || v === 'year') return v; } catch { /* private window */ }
    return ff === 'dock' ? 'week' : 'day';
  });
  const phoneCal = small(ff) ? {
    configOverride: { view: calView },
    intercept: (command: string, args: Record<string, unknown>): boolean => {
      if (command !== 'calendar.setView') return false;
      const v = args.view;
      if (v === 'day' || v === 'week' || v === 'month' || v === 'year') {
        setCalView(v);
        try { sessionStorage.setItem(CAL_VIEW_KEY, v); } catch { /* private window */ }
      }
      return true;
    },
  } : {};
  // A phone opens the Calendar on today, once a visit (after that it stays
  // where you went). The date it shows is the board's, as on the desktop.
  useEffect(() => {
    try { if (sessionStorage.getItem(CAL_TODAY_KEY) === '1') return; sessionStorage.setItem(CAL_TODAY_KEY, '1'); } catch { /* private window: every time */ }
    const cal = useBoardStore.getState().board?.nodes.find((n) => n.isMother && n.kind === 'calendar');
    const anchor = (cal?.state as { anchorDate?: string } | undefined)?.anchorDate;
    const todayYmd = ymd(new Date());
    if (cal && anchor !== todayYmd) makeCommandHandler(cal.id)('calendar.setAnchor', { date: todayYmd });
  }, []);
  // Decision 56 - the phone gives the Calendar the whole screen (the Clock is
  // on Today); an iPad has room for both side by side.
  if (small(ff)) return <div className="m-fill m-cal m-enter" data-testid="m-calendar"><MotherWindow kind="calendar" label="Calendar" {...phoneCal} /></div>;
  return (
    <div className="m-fill m-cal-split m-enter" data-testid="m-calendar">
      <div className="m-grow"><MotherWindow kind="calendar" label="Calendar" /></div>
      <div className="m-grow"><MotherWindow kind="clock" label="Clock" /></div>
    </div>
  );
}

function FocusPill({ onOpen }: { onOpen: () => void }) {
  const reading = useTimerReading();
  const pomoId = useBoardStore((s) => s.board?.nodes.find((n) => n.isMother && n.kind === 'pomo')?.id ?? null);
  // Idle: one tap starts the timer from the top of Today (the Timer window is further down).
  if (!reading) {
    if (!pomoId) return null;
    return (
      <button type="button" className="m-chip" onClick={() => makeCommandHandler(pomoId)('pomo.start', {})} data-testid="m-timer-start">
        <svg className="m-icon" width={14} height={14} viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10-6.5z" fill="currentColor" stroke="none" /></svg>
        <span>Start timer</span>
      </button>
    );
  }
  return (
    <button type="button" className="m-chip m-chip--live" onClick={onOpen} data-testid="m-focus-open">
      <span className="m-dot m-dot--acid" aria-hidden="true" />
      <span className="m-num">{reading.text}</span>
      <span>{reading.label}</span>
      <Icon d={EXPAND} size={14} />
    </button>
  );
}

const hhmm = (min: number): string => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** The line under the date: the day so far, and what is on now or next. */
function phoneDayLine(a: DayAgenda): string {
  const base = dayLine(a);
  if (!a.focus) return base;
  const { item, state } = a.focus;
  return `${base} · ${state === 'now' ? 'now' : 'next'} ${item.title} at ${hhmm(item.startMin)}`;
}

/** The day's timed items, small, in one row (every one readable: the row scrolls sideways). */
function DayChips({ items, onOpenCalendar }: { items: AgendaItem[]; onOpenCalendar: () => void }) {
  if (items.length === 0) {
    return (
      <div className="m-daychips" data-testid="m-day">
        <button type="button" className="m-daychip m-daychip--quiet" onClick={onOpenCalendar} data-testid="m-day-calendar">Nothing timed today · Calendar</button>
      </div>
    );
  }
  return (
    <div className="m-daychips" data-testid="m-day" role="list" aria-label="Your day">
      {items.map((it, i) => (
        <button
          key={it.id}
          type="button"
          role="listitem"
          className={`m-daychip${it.done ? ' m-daychip--done' : ''}`}
          onClick={onOpenCalendar}
          {...(i === 0 ? { 'data-testid': 'm-day-calendar' } : {})}
        >
          <span className="m-dot" style={{ background: toneOf(it) }} />
          <span className="m-num">{hhmm(it.startMin)}</span>
          <span>{it.title}</span>
        </button>
      ))}
    </div>
  );
}

/** One compact Timer (design A): what it reads, what it is for, and one button. Its full window is Focus. */
function TimerCard({ onFocus }: { onFocus: () => void }) {
  const easy = useEasyMode();
  const pomo = useBoardStore((s) => s.board?.nodes.find((n) => n.isMother && n.kind === 'pomo') ?? null);
  const reading = useTimerReading();
  if (!pomo) return null;
  const state = pomo.state as PomoState;
  const config = (pomo.config ?? {}) as PomoConfig;
  const observe = isObserve(config, easy);
  const run = makeCommandHandler(pomo.id);
  const sessionMin = config.sessionMin ?? 25;
  const label = reading ? reading.label : observe ? 'Stopwatch' : `Focus · ${sessionMin} min`;
  const text = reading ? reading.text : observe ? '00:00' : formatRemaining(sessionMin * 60_000);
  const what = state.label?.trim() || 'What are you doing?';
  const action = state.status === 'idle'
    ? { word: 'Start', testId: 'm-timer-start', go: () => run('pomo.start', {}) }
    : state.status === 'paused'
      ? { word: 'Resume', testId: 'm-timer-resume', go: () => run('pomo.resume', {}) }
      : state.status === 'running' && !observe
        ? { word: 'Pause', testId: 'm-timer-pause', go: () => run('pomo.pause', {}) }
        : { word: 'Open', testId: 'm-timer-open', go: onFocus };
  return (
    <section className="m-timercard" aria-label="Timer" data-testid="m-timer-card">
      <div className="m-timercard__read">
        <span className="m-timercard__label">{label}</span>
        <button type="button" className="m-timercard__digits m-num" onClick={onFocus} aria-label={`Timer ${text}, open it`} {...(reading ? { 'data-testid': 'm-focus-open' } : {})}>{text}</button>
        <button type="button" className="m-timercard__what" onClick={onFocus} data-testid="m-timer-what">
          <span>{what}</span>
          <svg width={13} height={13} viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" /></svg>
        </button>
      </div>
      <button type="button" className="m-timercard__go" onClick={action.go} data-testid={action.testId}>
        {action.word === 'Start' || action.word === 'Resume'
          ? <svg width={16} height={16} viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" fill="currentColor" /></svg>
          : null}
        {action.word}
      </button>
    </section>
  );
}

function PhoneToday({ onFocus, onOpenCalendar }: { onFocus: () => void; onOpenCalendar: () => void }) {
  const { agenda } = useDayAgenda();
  const now = new Date();
  return (
    <div className="m-today-a m-enter" data-testid="m-today">
      <header className="m-headline">
        <h1>
          <span>{now.toLocaleDateString(undefined, { weekday: 'long' })}</span>{' '}
          <span className="m-headline__date">{now.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}</span>
        </h1>
        <p className="m-headline__line" data-testid="m-today-line">{phoneDayLine(agenda)}</p>
      </header>
      {/* The Clock shows the day's plans as arcs: your day on the clock. */}
      <div className="m-today-a__clock"><MotherWindow kind="clock" label="Clock" /></div>
      <DayChips items={agenda.items} onOpenCalendar={onOpenCalendar} />
      <TimerCard onFocus={onFocus} />
    </div>
  );
}

const MORE_ROWS: Array<{ id: View; hint: string }> = [
  { id: 'insights', hint: 'Where your time went' },
  { id: 'canvas', hint: 'Your board, free to arrange' },
];

/** More (phone and sideways phone): a small popup at its tab, a tap opens the pick. */
function MorePopup({ at, ff, onOpen, onSettings, onClose }: { at: DOMRect; ff: Shell; onOpen: (v: View) => void; onSettings: () => void; onClose: () => void }) {
  return (
    <Popover anchor={at} side={ff === 'dock' ? 'right' : 'above'} label="More" onClose={onClose} testId="m-more">
      {MORE_ROWS.map((r) => (
        <button key={r.id} type="button" role="menuitem" className="m-pop__item" onClick={() => { onOpen(r.id); onClose(); }} data-testid={`m-more-${r.id}`}>
          <Icon d={viewOf(r.id).d} size={20} />
          <span className="m-pop__text"><strong>{viewOf(r.id).phone}</strong><span>{r.hint}</span></span>
        </button>
      ))}
      {/* The sideways phone has no header: Settings is here. */}
      {ff === 'dock' && (
        <button type="button" role="menuitem" className="m-pop__item" onClick={() => { onSettings(); onClose(); }} data-testid="m-more-settings">
          <Icon d={GEAR} size={20} />
          <span className="m-pop__text"><strong>Settings</strong><span>How KRNL0 looks and sounds</span></span>
        </button>
      )}
    </Popover>
  );
}

/** iPad Today: four windows in two columns, each one yours to choose (its name). */
const TABLET_SLOTS: MotherKind[] = ['pomo', 'todo', 'calendar', 'habit'];
const slotClass = (k: MotherKind): string => (k === 'pomo' ? 'm-slot m-slot--timer' : k === 'habit' ? 'm-slot m-slot--habits-tab' : 'm-grow');
function TabletToday() {
  const [slots, choose] = useSlots('krnl0-web-tablet-slots', TABLET_SLOTS);
  return (
    <WindowSlots slots={slots} onChoose={choose} render={(slot) => (
      <div className="m-today-grid" data-testid="m-today">
        <div className="m-col">
          <div className={slotClass(slots[0]!)}>{slot(0)}</div>
          <div className={slotClass(slots[1]!)}>{slot(1)}</div>
        </div>
        <div className="m-col">
          <div className={slotClass(slots[2]!)}>{slot(2)}</div>
          <div className={slotClass(slots[3]!)}>{slot(3)}</div>
        </div>
      </div>
    )} />
  );
}

/** The sideways phone's Today (design D): two windows you choose, and the Timer pill while neither is the Timer. */
const DOCK_SLOTS: MotherKind[] = ['todo', 'clock'];
function DockToday({ onFocus }: { onFocus: () => void }) {
  const [slots, choose] = useSlots('krnl0-web-dock-slots', DOCK_SLOTS);
  const reading = useTimerReading();
  return (
    <WindowSlots slots={slots} onChoose={choose} render={(slot) => (
      <div className="m-dock m-enter" data-testid="m-today">
        <div className="m-grow">{slot(0)}</div>
        <div className="m-grow">{slot(1)}</div>
        {!slots.includes('pomo') && <TimerPill reading={reading} onOpen={onFocus} />}
      </div>
    )} />
  );
}

function ViewBody({ view, ff, onFocus, onOpenCalendar }: { view: View; ff: Shell; onFocus: () => void; onOpenCalendar: () => void }) {
  switch (view) {
    case 'more':
    case 'today': return ff === 'phone' ? <PhoneToday onFocus={onFocus} onOpenCalendar={onOpenCalendar} /> : ff === 'dock' ? <DockToday onFocus={onFocus} /> : <TabletToday />;
    case 'todos': return <div className="m-fill m-enter" data-testid="m-todos"><MotherWindow kind="todo" label="Todos" /></div>;
    case 'calendar': return <CalendarView ff={ff} />;
    case 'habits': return <div className="m-fill m-enter"><MotherWindow kind="habit" label="Habits" /></div>;
    case 'insights': return <div className="m-fill m-enter"><MotherWindow kind="analytics" label="Insights" /></div>;
    case 'canvas': return <div className="m-fill m-canvas" data-testid="m-canvas"><EmbeddedCanvasCell /><FitOnFirstOpen phone={small(ff)} /></div>;
  }
}

/** Focus (design PhoneFocus): the Timer alone, full size, with a way back. */
function Focus({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="m-focus" role="dialog" aria-modal="true" aria-label="Focus" data-testid="m-focus">
      <header className="m-focus__head">
        <button type="button" className="m-icon-btn" aria-label="Back to today" onClick={onClose}><Icon d={BACK} /></button>
        <span className="m-cap">Focus</span>
        <SaveSyncBadge />
      </header>
      <div className="m-grow"><MotherWindow kind="pomo" label="Timer" /></div>
    </div>
  );
}

// ── The shell ───────────────────────────────────────────────────────────────

export function MobileShell({ ff }: { ff: Shell }) {
  const easy = useEasyMode();
  const boardReady = useBoardStore((s) => !!s.board);
  const [view, setViewState] = useState<View>(readView);
  const [focus, setFocus] = useState(false);
  const [settings, setSettings] = useState(false);
  const [more, setMore] = useState<DOMRect | null>(null);
  const [theme, chooseTheme] = useTheme();
  const reading = useTimerReading();
  const todayLine = useTodayLine();
  useEffect(() => { setMothersElsewhere(true); return () => setMothersElsewhere(false); }, []);

  const setView = (v: View): void => {
    setViewState(v);
    try { sessionStorage.setItem(VIEW_KEY, v); } catch { /* private window */ }
  };
  // A row of "Your day": the Calendar on today, as a day.
  const openCalendarToday = (): void => {
    try { sessionStorage.setItem(CAL_VIEW_KEY, 'day'); } catch { /* private window */ }
    const cal = useBoardStore.getState().board?.nodes.find((n) => n.isMother && n.kind === 'calendar');
    if (cal) makeCommandHandler(cal.id)('calendar.setAnchor', { date: ymd(new Date()) });
    setView('calendar');
  };
  // Focus closes by itself when a running timer stops (opened while idle, it stays).
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !reading) setFocus(false);
    wasRunning.current = !!reading;
  }, [reading]);
  // Help › What's new › "Show me" and others open Settings by event (as on the desktop).
  useEffect(() => {
    const open = (): void => setSettings(true);
    window.addEventListener('krnl:open-settings', open);
    return () => window.removeEventListener('krnl:open-settings', open);
  }, []);

  if (!boardReady) return <div className="m-shell" />;

  // On a phone, Insights and Canvas live under More: the More tab stays marked there.
  const tabOf = (v: View): View => (small(ff) && (v === 'insights' || v === 'canvas') ? 'more' : v);
  const nav = (small(ff) ? PHONE_TABS : TABLET_RAIL).map(viewOf).map((v) => (
    <button
      key={v.id}
      type="button"
      className={`m-nav__item${tabOf(view) === v.id ? ' on' : ''}${v.id === 'more' && more ? ' open' : ''}`}
      aria-current={tabOf(view) === v.id ? 'page' : undefined}
      {...(v.id === 'more' ? { 'aria-haspopup': 'menu' as const, 'aria-expanded': !!more } : {})}
      onClick={(e) => { if (v.id === 'more') setMore(more ? null : e.currentTarget.getBoundingClientRect()); else setView(v.id); }}
      data-testid={`m-nav-${v.id}`}
    >
      <Icon d={v.d} />
      <span>{ff === 'phone' ? v.phone : v.tablet}</span>
    </button>
  ));
  const morePopup = more && <MorePopup at={more} ff={ff} onOpen={setView} onSettings={() => setSettings(true)} onClose={() => setMore(null)} />;

  const settingsButton = (
    <button type="button" className="m-icon-btn" aria-label="Settings" onClick={() => setSettings(true)} data-testid="m-settings"><Icon d={GEAR} /></button>
  );

  // Focus takes the place of the views (never on top of them): one Timer window
  // at a time, as on the desktop — two would both act when a session ends.
  if (focus) {
    return (
      <MothersElsewhereContext.Provider value={true}>
        <div className={`m-shell m-shell--${ff}`} data-testid={`m-shell-${ff}`}>
          <Focus onClose={() => setFocus(false)} />
          {settings && <SettingsModal theme={theme} onTheme={chooseTheme} onClose={() => setSettings(false)} />}
        </div>
      </MothersElsewhereContext.Provider>
    );
  }

  return (
    <MothersElsewhereContext.Provider value={true}>
    <div className={`m-shell m-shell--${ff}`} data-testid={`m-shell-${ff}`}>
      {ff !== 'phone' && (
        <nav className="m-rail" aria-label="Views">
          <img src={logo} alt="KRNL0" className="m-logo m-logo--rail" />
          {nav}
          <span className="m-spacer" />
          {ff === 'tablet' && settingsButton}
        </nav>
      )}

      <div className="m-main">
        {/* A phone on its side has no room for a header: the rail and More hold it all. */}
        {ff !== 'dock' && <header className="m-head">
          {ff === 'phone' && <img src={logo} alt="KRNL0" className="m-logo" />}
          {ff === 'tablet' && (
            <div className="m-head__title">
              <h1>{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</h1>
              <p>{todayLine}</p>
            </div>
          )}
          <BoardSwitcher />
          {/* The app's own saved badge, on the left as in the top bar: saved and synced. */}
          <SaveSyncBadge />
          <span className="m-spacer" />
          {ff === 'tablet' && view === 'today' && <FocusPill onOpen={() => setFocus(true)} />}
          {ff === 'phone' && settingsButton}
        </header>}
        <main className="m-body">
          {/* A phone on its side is too short to fit a day: an hour keeps 20 px and the hours scroll. */}
          <CalendarMinHourContext.Provider value={ff === 'dock' ? DOCK_MIN_HOUR : 0}>
            <ViewBody view={view} ff={ff} onFocus={() => setFocus(true)} onOpenCalendar={openCalendarToday} />
          </CalendarMinHourContext.Provider>
        </main>
      </div>

      {ff === 'phone' && <nav className="m-tabbar" aria-label="Views">{nav}</nav>}
      {morePopup}

      {settings && <SettingsModal theme={theme} onTheme={chooseTheme} onClose={() => setSettings(false)} />}
    </div>
    </MothersElsewhereContext.Provider>
  );
}
