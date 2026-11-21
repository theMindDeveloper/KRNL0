// The web app on a phone or an iPad (Decision 51, Decision 56). One shell,
// two arrangements of the board's own windows:
//   phone   header · one view · tab bar (Today, Calendar, Habits, Insights, Canvas)
//   tablet  side rail with the same views · two-column Today
// Today answers "what now?": the date, your day in time order with the item
// going on now (or next) opened out, then the Timer, Plans, Habits and Clock.
// While the timer runs, Today offers Focus: the Timer on its own, full size.
// The open view is this browser's own (sessionStorage), never synced.

import { useEffect, useMemo, useState } from 'react';
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
import type { TodoItem } from '../nodes/TodoNode/types';
import { MotherWindow } from './MotherWindow';
import { DayList, useDayAgenda } from './DayList';
import { dayLine } from './dayAgenda';
import type { FormFactor } from './useFormFactor';
import logo from '../../assets/launch/logo.webp';
import './mobile.css';

type View = 'today' | 'calendar' | 'habits' | 'insights' | 'canvas';

const VIEWS: ReadonlyArray<{ id: View; phone: string; tablet: string; d: string }> = [
  { id: 'today', phone: 'Today', tablet: 'Today', d: 'M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM4 9h16M8 3v4M16 3v4M12 14h.01' },
  { id: 'calendar', phone: 'Calendar', tablet: 'Week', d: 'M4 5h16v15H4zM4 9h16M9.5 9v11M14.5 9v11' },
  { id: 'habits', phone: 'Habits', tablet: 'Habits', d: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 17l2 2 4-4' },
  { id: 'insights', phone: 'Insights', tablet: 'Insights', d: 'M5 20V10M10 20V4M15 20v-7M20 20v-4' },
  { id: 'canvas', phone: 'Canvas', tablet: 'Canvas', d: 'M4 5h6v5H4zM14 14h6v5h-6zM10 7.5h3a2 2 0 0 1 2 2V14' },
];

const VIEW_KEY = 'krnl0-web-view';
const readView = (): View => {
  try {
    const v = sessionStorage.getItem(VIEW_KEY);
    if (v && VIEWS.some((x) => x.id === v)) return v as View;
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

/** How many rows the Plans window shows (for its height). */
function usePlansListed(): number {
  const items = useBoardStore((s) => (s.board?.nodes.find((n) => n.isMother && n.kind === 'todo')?.state as { items?: TodoItem[] } | undefined)?.items);
  return useMemo(() => {
    const today = ymd(new Date());
    return (items ?? []).filter((i) => !i.archivedAt && !(i as { droppedAt?: string }).droppedAt)
      .filter((i) => !i.done || (i.completedAt !== null && ymd(new Date(i.completedAt)) === today)).length;
  }, [items]);
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
  const { fitView, getNodes } = useReactFlow();
  // After the cards are measured: a fit before that frames nothing.
  const measured = useNodesInitialized();
  useEffect(() => {
    if (canvasFitted || !measured) return;
    const id = window.setTimeout(() => {
      const tasks = phone ? getNodes().filter((n) => n.type === 'task').map((n) => ({ id: n.id })) : [];
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
  }, [fitView, getNodes, phone, measured]);
  return null;
}

const CAL_VIEW_KEY = 'krnl0-web-calendar-view';
const CAL_TODAY_KEY = 'krnl0-web-calendar-today';
type CalView = 'day' | 'week' | 'month' | 'year';

function CalendarView({ ff }: { ff: Exclude<FormFactor, 'desktop'> }) {
  // A phone shows one day by default; its choice stays on this phone (the
  // stored view is the desktop's and is never changed from here).
  const [calView, setCalView] = useState<CalView>(() => {
    try { const v = sessionStorage.getItem(CAL_VIEW_KEY); if (v === 'day' || v === 'week' || v === 'month' || v === 'year') return v; } catch { /* private window */ }
    return 'day';
  });
  const phoneCal = ff === 'phone' ? {
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
  if (ff === 'phone') return <div className="m-fill m-cal m-enter" data-testid="m-calendar"><MotherWindow kind="calendar" label="Calendar" {...phoneCal} /></div>;
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

function PhoneToday({ onFocus, onOpenCalendar }: { onFocus: () => void; onOpenCalendar: () => void }) {
  const line = useTodayLine();
  const listed = usePlansListed();
  const habits = useBoardStore((s) => ((s.board?.nodes.find((n) => n.isMother && n.kind === 'habit')?.state as { habits?: Array<{ archived?: boolean; kind?: string }> } | undefined)?.habits ?? []).filter((h) => !h.archived && h.kind !== 'routine').length);
  // The windows fill what they get: give each the height its rows need.
  const plansH = Math.min(620, Math.max(250, 150 + listed * 34));
  const habitsH = Math.min(560, Math.max(230, 150 + habits * 56));
  const now = new Date();
  return (
    <div className="m-scroll m-enter" data-testid="m-today">
      <header className="m-headline">
        <h1>
          <span>{now.toLocaleDateString(undefined, { weekday: 'long' })}</span>{' '}
          <span className="m-headline__date">{now.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}</span>
        </h1>
        <div className="m-headline__row">
          <p data-testid="m-today-line">{line}</p>
          <FocusPill onOpen={onFocus} />
        </div>
      </header>
      <DayList onOpenCalendar={onOpenCalendar} />
      <div className="m-slot m-slot--timer"><MotherWindow kind="pomo" label="Timer" /></div>
      <div className="m-slot" style={{ height: plansH }}><MotherWindow kind="todo" label="Plans" /></div>
      <div className="m-slot" style={{ height: habitsH }}><MotherWindow kind="habit" label="Habits" /></div>
      <div className="m-slot m-slot--clock"><MotherWindow kind="clock" label="Clock" /></div>
    </div>
  );
}

function TabletToday() {
  return (
    <div className="m-today-grid" data-testid="m-today">
      <div className="m-col">
        <div className="m-slot m-slot--timer"><MotherWindow kind="pomo" label="Timer" /></div>
        <div className="m-grow"><MotherWindow kind="todo" label="Plans" /></div>
      </div>
      <div className="m-col">
        <div className="m-grow"><MotherWindow kind="calendar" label="Calendar" /></div>
        <div className="m-slot m-slot--habits-tab"><MotherWindow kind="habit" label="Habits" /></div>
      </div>
    </div>
  );
}

function ViewBody({ view, ff, onFocus, onOpenCalendar }: { view: View; ff: Exclude<FormFactor, 'desktop'>; onFocus: () => void; onOpenCalendar: () => void }) {
  switch (view) {
    case 'today': return ff === 'phone' ? <PhoneToday onFocus={onFocus} onOpenCalendar={onOpenCalendar} /> : <TabletToday />;
    case 'calendar': return <CalendarView ff={ff} />;
    case 'habits': return <div className="m-fill m-enter"><MotherWindow kind="habit" label="Habits" /></div>;
    case 'insights': return <div className="m-fill m-enter"><MotherWindow kind="analytics" label="Insights" /></div>;
    case 'canvas': return <div className="m-fill m-canvas" data-testid="m-canvas"><EmbeddedCanvasCell /><FitOnFirstOpen phone={ff === 'phone'} /></div>;
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

export function MobileShell({ ff }: { ff: Exclude<FormFactor, 'desktop'> }) {
  const easy = useEasyMode();
  const boardReady = useBoardStore((s) => !!s.board);
  const [view, setViewState] = useState<View>(readView);
  const [focus, setFocus] = useState(false);
  const [settings, setSettings] = useState(false);
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
  // Focus closes by itself when the timer stops.
  useEffect(() => { if (!reading) setFocus(false); }, [reading]);
  // Help › What's new › "Show me" and others open Settings by event (as on the desktop).
  useEffect(() => {
    const open = (): void => setSettings(true);
    window.addEventListener('krnl:open-settings', open);
    return () => window.removeEventListener('krnl:open-settings', open);
  }, []);

  if (!boardReady) return <div className="m-shell" />;

  const nav = VIEWS.map((v) => (
    <button
      key={v.id}
      type="button"
      className={`m-nav__item${view === v.id ? ' on' : ''}`}
      aria-current={view === v.id ? 'page' : undefined}
      onClick={() => setView(v.id)}
      data-testid={`m-nav-${v.id}`}
    >
      <Icon d={v.d} />
      <span>{ff === 'phone' ? v.phone : v.tablet}</span>
    </button>
  ));

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
      {ff === 'tablet' && (
        <nav className="m-rail" aria-label="Views">
          <img src={logo} alt="KRNL0" className="m-logo m-logo--rail" />
          {nav}
          <span className="m-spacer" />
          {settingsButton}
        </nav>
      )}

      <div className="m-main">
        <header className="m-head">
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
        </header>
        <main className="m-body">
          <ViewBody view={view} ff={ff} onFocus={() => setFocus(true)} onOpenCalendar={openCalendarToday} />
        </main>
      </div>

      {ff === 'phone' && <nav className="m-tabbar" aria-label="Views">{nav}</nav>}

      {settings && <SettingsModal theme={theme} onTheme={chooseTheme} onClose={() => setSettings(false)} />}
    </div>
    </MothersElsewhereContext.Provider>
  );
}
