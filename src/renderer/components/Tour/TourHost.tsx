// Runs a guided tour (tours.ts): a spotlight on what the guide talks about,
// a guide card that glides to it — the real assistant orb rides on its corner
// (tourAnchor.ts), never a second copy — and steps that wait for
// the real action. The app stays usable underneath (the dimming takes no
// pointer events). Mount once (App). Start with startTour(id) / `krnl tour start <id>`.
//
// Motion (design-tokens.md, UI rule 8): the ring never slides — it fades in
// where the target has come to rest. The card glides from where it was to the
// new spot, and the new words fade in once it has arrived.

import { Fragment, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Board } from '../../../shared/types';
import type { MotherNodeConfig } from '../../../shared/types/board';
import { useBoardStore } from '../../store/boardStore';
import { saveBoard } from '../../store/eventLog';
import { CALENDAR_REVEAL_EVENT, focusNode } from '../../store/scheduleActions';
import { beginPractice, keepPractice, practiceActive, practiceSummary, removePractice, type PracticeSummary } from '../../store/tourPractice';
import { addExamples, removeExamples } from '../../store/tourExamples';
import { isStationHidden } from '../Station/stationVisibility';
import { Z } from '../ui/layers';
import { stepsFor, tourById, type Tour } from './tours';
import { setGuideSpeaking, setTourActive, setTourAnchor } from './tourAnchor';
import { fillTour, spokenText, voiceKey } from './tourVoice';
import { voicePlayer } from '../Assistant/VoicePlayer';

// The guide's recorded voice (tourVoice.ts): ./voice/<key>.mp3, bundled by Vite.
const VOICE_CLIPS = import.meta.glob('./voice/*.mp3', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
const clipFor = (key: string): string | undefined => VOICE_CLIPS[`./voice/${key}.mp3`];
const VOICE_PREF = 'krnl:tour-voice';
const readVoicePref = (): boolean => { try { return localStorage.getItem(VOICE_PREF) !== 'off'; } catch { return true; } };
import { settingsSectionFor } from '../TopBar/SettingsModal';
import { useLayerVisibility } from '../../store/layerVisibility';
import { LineGlyph } from '../ui/LineGlyph';

export const TOUR_EVENT = 'krnl:tour';

// Which tour is running (null = none). Other overlays (the day recap) wait
// while a tour is on screen.
let activeTourId: string | null = null;
export const activeTour = (): string | null => activeTourId;

export function startTour(id: string): boolean {
  if (!tourById(id)) return false;
  window.dispatchEvent(new CustomEvent<{ id: string }>(TOUR_EVENT, { detail: { id } }));
  return true;
}

/**
 * Bring the window a step talks about into view, whatever hid it: a window
 * the user hid from the toolbar comes back (Station and Canvas alike), the
 * canvas's task / text / image layers are switched on, and on the canvas the
 * camera centres it. A step about something hidden would otherwise point at
 * nothing and its "waiting for…" could never happen.
 */
function bringIntoView(nodeId: string, focus = true): void {
  const st = useBoardStore.getState();
  const board = st.board;
  const node = board?.nodes.find((n) => n.id === nodeId);
  if (!board || !node) return;
  if (isStationHidden(node)) {
    const cfg = (node.config ?? {}) as MotherNodeConfig & Record<string, unknown>;
    st.updateNode(node.id, { config: { ...cfg, stationHidden: false } });
    const b = useBoardStore.getState().board;
    if (b) void saveBoard(b);
  }
  const layers = useLayerVisibility.getState();
  for (const l of ['tasks', 'texts', 'images'] as const) if (!layers[l]) layers.setLayer(l, true);
  if (focus && board.layoutMode !== 'station') focusNode(nodeId);
}

/** `**word**` in a step's text → a highlighted word (the thing to look at or press). */
export function renderTourText(text: string): JSX.Element {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {parts.map((p, k) => (k % 2 === 1
        ? <mark key={k} data-tour-key style={KEY_WORD}>{p}</mark>
        : <Fragment key={k}>{p}</Fragment>))}
    </>
  );
}

const KEY_WORD: React.CSSProperties = {
  background: 'color-mix(in srgb, var(--acid) 20%, transparent)',
  color: 'var(--acid-ink, var(--acid))',
  fontWeight: 700,
  padding: '0 4px',
  borderRadius: 4,
  boxDecorationBreak: 'clone',
  WebkitBoxDecorationBreak: 'clone',
};

const SETTINGS_MODAL = '[data-testid="settings-modal"]';
const GEAR_SELECTOR = '[data-testid="topbar-settings"]';

interface Rect { left: number; top: number; width: number; height: number }

const same = (a: Rect | null, b: Rect | null): boolean =>
  // 3 px: a target that pulses or hops a little still counts as resting, so
  // the words don't wait (and the card doesn't chase it).
  !!a && !!b && Math.abs(a.left - b.left) < 3 && Math.abs(a.top - b.top) < 3 && Math.abs(a.width - b.width) < 3 && Math.abs(a.height - b.height) < 3;

/** Where the card goes: below the target, else above, right, left — else the bottom-right corner. */
/**
 * The part of an element you can actually see: inside the window, not hidden
 * (display / visibility / opacity), and clipped by every scrolling or clipping
 * ancestor (a Calendar block under the grid's header counts only for what
 * shows). Null when nothing of it is visible.
 */
export function visibleBox(el: Element): Rect | null {
  const anyEl = el as Element & { checkVisibility?: (o: Record<string, boolean>) => boolean };
  if (typeof anyEl.checkVisibility === 'function' && !anyEl.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return null;
  const r = el.getBoundingClientRect();
  let l = Math.max(0, r.left);
  let t = Math.max(0, r.top);
  let rt = Math.min(window.innerWidth, r.right);
  let b = Math.min(window.innerHeight, r.bottom);
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const cs = getComputedStyle(p);
    if (/(hidden|auto|scroll|clip)/.test(`${cs.overflowX} ${cs.overflowY}`)) {
      const pr = p.getBoundingClientRect();
      l = Math.max(l, pr.left); t = Math.max(t, pr.top); rt = Math.min(rt, pr.right); b = Math.min(b, pr.bottom);
    }
    if (rt - l < 2 || b - t < 2) return null;
  }
  return rt - l >= 2 && b - t >= 2 ? { left: l, top: t, width: rt - l, height: b - t } : null;
}

/**
 * A floating panel (radio, a chat panel…) lying on top of what a step points
 * at: the nearest fixed-position ancestor of whatever covers the target's
 * visible box. Null when nothing covers it. The tour card itself never counts.
 */
export function coveringPanel(el: Element, box: Rect): HTMLElement | null {
  const pts: Array<[number, number]> = [
    [box.left + box.width / 2, box.top + box.height / 2],
    [box.left + box.width * 0.25, box.top + box.height / 2],
    [box.left + box.width * 0.75, box.top + box.height / 2],
  ];
  for (const [x, y] of pts) {
    const hit = document.elementFromPoint(x, y);
    if (!hit || el.contains(hit) || hit.contains(el) || hit.closest('[data-testid="tour-card"]')) continue;
    for (let p: HTMLElement | null = hit as HTMLElement; p && p !== document.body; p = p.parentElement) {
      if (p.contains(el)) break;
      const cs = getComputedStyle(p);
      if (cs.position !== 'fixed') continue;
      // A menu or popover the user just opened (a step says "right-click …
      // and choose …") is the step itself, never in the way: leave it alone.
      const z = Number(cs.zIndex);
      if (Number.isFinite(z) && z >= Z.popover) break;
      return p;
    }
  }
  return null;
}

/**
 * The element a step points at, found by what it is — never by where it
 * happens to sit, since every window can be moved. Of all matches, the most
 * visible one wins, preferring those inside the window the step is about.
 * `box` is null when it exists but can't be seen right now.
 */
export function findTarget(
  selector: string,
  scope: Element | null,
  text?: string,
  opts?: { keep?: Element | null; made?: readonly string[] },
): { el: Element; box: Rect | null } | null {
  let list: Element[];
  try { list = Array.from(document.querySelectorAll(selector)); } catch { return null; }
  if (text) {
    // The element itself, or its own row (a few levels up, holding no other
    // match) names the item — a PLAN button is found by its task's row.
    const named = list.filter((e) => {
      let node: Element | null = e;
      for (let up = 0; node && up < 5; up++, node = node.parentElement) {
        if (up > 0 && list.some((o) => o !== e && node!.contains(o))) return false;
        if ((node.textContent ?? '').includes(text)) return true;
      }
      return false;
    });
    if (named.length > 0) list = named;
  }
  if (list.length === 0) return null;
  const inScope = scope ? list.filter((e) => scope.contains(e)) : [];
  let pool = inScope.length > 0 ? inScope : list;
  // The one this step already points at stays, even when the camera moves and
  // another match becomes bigger on screen (the ring never jumps cards).
  if (opts?.keep && opts.keep.isConnected && pool.includes(opts.keep)) return { el: opts.keep, box: visibleBox(opts.keep) };
  // What was made during this tour (the user's new task, habit or plan — its
  // card, its row) wins over older ones, the newest first.
  if (opts?.made?.length) {
    const nodeId = (e: Element) => {
      const own = e.closest('[data-habit-row], [data-item-id], .react-flow__node');
      return own?.getAttribute('data-habit-row') ?? own?.getAttribute('data-item-id') ?? own?.getAttribute('data-id') ?? null;
    };
    for (let k = opts.made.length - 1; k >= 0; k--) {
      const mine = pool.filter((e) => nodeId(e) === opts.made![k]);
      if (mine.length > 0) { pool = mine; break; }
    }
  }
  let best: { el: Element; box: Rect | null } | null = null;
  let bestArea = -1;
  for (const el of pool) {
    const box = visibleBox(el);
    const area = box ? box.width * box.height : 0;
    if (area > bestArea) { best = { el, box }; bestArea = area; }
  }
  return best;
}

/** Every id a step could point at: board nodes, habits and Todo items (in board order, newest last). */
export function idsOnBoard(board: Board | null | undefined): string[] {
  if (!board) return [];
  const out: string[] = [];
  for (const n of board.nodes) {
    out.push(n.id);
    const s = n.state as { habits?: Array<{ id: string }>; items?: Array<{ id: string }> } | null;
    if (n.isMother && n.kind === 'habit') for (const h of s?.habits ?? []) out.push(h.id);
    if (n.isMother && n.kind === 'todo') for (const it of s?.items ?? []) out.push(it.id);
  }
  return out;
}

/**
 * Where the guide card goes: below, above, right or left of what it talks
 * about — never on top of it. When no side has room (a tall Settings section,
 * a big window), the spot on screen that covers the least of it wins.
 */
export function placeCard(r: Rect, w: number, h: number, vw = window.innerWidth, vh = window.innerHeight): { left: number; top: number } {
  // 36: the guide orb rides the card's top-left corner (half of it, 32 px,
  // sticks out), so a smaller gap would put the orb on what the step shows.
  const gap = 36;
  const m = 12;
  const clampX = (x: number) => Math.max(m, Math.min(x, vw - w - m));
  const clampY = (y: number) => Math.max(m, Math.min(y, vh - h - m));
  if (r.top + r.height + gap + h < vh - m) return { left: clampX(r.left), top: r.top + r.height + gap };
  if (r.top - gap - h > m) return { left: clampX(r.left), top: r.top - gap - h };
  if (r.left + r.width + gap + w < vw - m) return { left: r.left + r.width + gap, top: clampY(r.top) };
  if (r.left - gap - w > m) return { left: r.left - gap - w, top: clampY(r.top) };
  const overlap = (p: { left: number; top: number }): number => {
    const x = Math.max(0, Math.min(p.left + w, r.left + r.width) - Math.max(p.left, r.left));
    const y = Math.max(0, Math.min(p.top + h, r.top + r.height) - Math.max(p.top, r.top));
    return x * y;
  };
  const candidates = [
    { left: clampX(r.left), top: clampY(r.top + r.height + gap) },
    { left: clampX(r.left), top: clampY(r.top - gap - h) },
    { left: clampX(r.left + r.width + gap), top: clampY(r.top) },
    { left: clampX(r.left - gap - w), top: clampY(r.top) },
    { left: vw - w - m, top: vh - h - m },
    { left: m, top: vh - h - m },
    { left: vw - w - m, top: m },
    { left: m, top: m },
  ];
  return candidates.reduce((best, c) => (overlap(c) < overlap(best) ? c : best));
}

const todayYMD = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
/** `{today}` in a selector is today's date (`week-col-{today}`). */
const sel = (s: string | undefined): string | undefined => s?.split('{today}').join(todayYMD());

/**
 * Open the Calendar on today alone (its Day view, so today is wide and never
 * cut off at the edge) and scroll its hours to now. Returns a function that
 * puts the user's own view back.
 */
function calendarToToday(): () => void {
  const board = useBoardStore.getState().board;
  const cal = board?.nodes.find((n) => n.kind === 'calendar' && n.isMother);
  if (!cal) return () => {};
  const own = (cal.config as { view?: string }).view;
  const sendTo = (view: string): void => {
    void import('../Canvas/commandDispatch').then(({ makeCommandHandler }) => makeCommandHandler(cal.id)('calendar.setView', { view }));
  };
  void import('../Canvas/commandDispatch').then(({ makeCommandHandler }) => {
    const send = makeCommandHandler(cal.id);
    if (own !== 'day') send('calendar.setView', { view: 'day' });
    send('calendar.setAnchor', { date: todayYMD() });
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent(CALENDAR_REVEAL_EVENT, { detail: { startISO: new Date().toISOString() } }));
    }, 150);
  });
  return () => { if (own && own !== 'day') sendTo(own); };
}

/** Does the tour ask the user to make or change things (practice)? */
const practises = (t: Tour): boolean => t.steps.some((st) => !!st.waitFor && 'board' in st.waitFor);

const overlapArea = (p: { left: number; top: number }, w: number, h: number, r: Rect): number => {
  const x = Math.max(0, Math.min(p.left + w, r.left + r.width) - Math.max(p.left, r.left));
  const y = Math.max(0, Math.min(p.top + h, r.top + r.height) - Math.max(p.top, r.top));
  return x * y;
};

export function TourHost(): JSX.Element | null {
  const [tour, setTour] = useState<Tour | null>(null);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  // The second ring (where to drag FROM).
  const [rect2, setRect2] = useState<Rect | null>(null);
  // What the user did that isn't what the step needs (dropped on another day).
  const [nudge, setNudge] = useState<string | null>(null);
  // Examples the tour added to an empty board (tourExamples.ts): said on the card.
  const [examplesNote, setExamplesNote] = useState(false);
  // The tour ended with practice items left: ask to remove or keep them.
  const [practiceEnd, setPracticeEnd] = useState<PracticeSummary | null>(null);
  // The guide reads each step aloud (when a clip exists); the speaker on the card mutes it.
  const [voiceOn, setVoiceOn] = useState<boolean>(readVoicePref);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stopVoice = (): void => { const a = audioRef.current; audioRef.current = null; if (a) { a.pause(); a.src = ''; } };
  // The words show once the card has arrived at THIS step's target (or
  // straight away when the step points at nothing). Tracked per step, so the
  // next step's words never flash at the old spot.
  const [readyKey, setReadyKey] = useState('');
  const rectRef = useRef<Rect | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const startBoard = useRef<Board | null>(null);
  /** Node ids on the board when the tour began: anything else was made in it. */
  const tourStartIds = useRef<Set<string>>(new Set());
  const uiMode = useBoardStore((s) => (s.board?.uiMode === 'easy' ? 'easy' : 'advanced'));
  // The user's own mode, put back when a tour that switched modes ends
  // without the user choosing one.
  const ownMode = useRef<'easy' | 'advanced' | null>(null);
  // How the user's timer works (Record/Observe = stopwatch, Pomo = sessions): names it in the words.
  const [timer, setTimer] = useState<'stopwatch' | 'pomo'>('pomo');
  const modeChosen = useRef(false);
  // The guide opened Settings for a step; close it again when moving on.
  const openedSettings = useRef(false);
  // Last card position: the card stays where it is while the next target
  // settles, then glides there.
  const cardPos = useRef<{ left: number; top: number } | null>(null);
  /** The card's spot in the last render, for the orb (tourAnchor.ts). */
  const anchorPos = useRef<{ left: number; top: number }>({ left: 0, top: 0 });

  const closeSettings = (): void => {
    if (!openedSettings.current) return;
    openedSettings.current = false;
    const modal = document.querySelector(SETTINGS_MODAL);
    if (modal instanceof HTMLElement) modal.click(); // the backdrop closes it
  };
  const end = (): void => {
    closeSettings();
    if (ownMode.current && !modeChosen.current) useBoardStore.getState().setUiMode(ownMode.current);
    ownMode.current = null;
    modeChosen.current = false;
    cardPos.current = null;
    rectRef.current = null;
    stopVoice();
    setTour(null); setI(0); setRect(null); setRect2(null); setNudge(null); setReadyKey('');
    // The examples always go (before the question about the user's own practice).
    removeExamples();
    setExamplesNote(false);
    // Practice left behind? Ask (nothing made: just stop pausing the log).
    if (practiceActive()) {
      const sum = practiceSummary();
      if (sum.lines.length > 0) setPracticeEnd(sum);
      else keepPractice();
    }
  };
  const choose = (mode: 'easy' | 'advanced'): void => {
    modeChosen.current = true;
    useBoardStore.getState().setUiMode(mode);
    end();
  };
  useEffect(() => { activeTourId = tour?.id ?? null; }, [tour]);
  // The furthest step reached. Going Back to a step whose action was already
  // done must not wait for it again (or auto-advance at once): it shows Next.
  const [reached, setReached] = useState(0);
  useEffect(() => { if (!tour) setReached(0); else setReached((r) => Math.max(r, i)); }, [tour, i]);
  const revisit = i < reached;
  const step = tour?.steps[i];
  const last = !!tour && i === tour.steps.length - 1;
  const next = (): void => { if (!tour) return; if (last) end(); else setI(i + 1); };

  // start
  useEffect(() => {
    const on = (e: Event): void => {
      const t = tourById((e as CustomEvent<{ id: string }>).detail.id);
      if (!t) return;
      // Only the steps that exist in the user's mode (no ring on a hidden control).
      const b = useBoardStore.getState().board;
      const mode = b?.uiMode === 'easy' ? 'easy' : 'advanced';
      // The timer's buttons differ: Easy and OBSERVE are a stopwatch (Back to
      // work, Stop); POMO has End break and the ■ button.
      const pomoCfg = b?.nodes.find((n) => n.kind === 'pomo' && n.isMother)?.config as { mode?: string } | undefined;
      const timer = mode === 'easy' || pomoCfg?.mode === 'observe' ? 'stopwatch' : 'pomo';
      setTimer(timer);
      setTour({ ...t, steps: stepsFor(t, mode, timer) });
      tourStartIds.current = new Set(idsOnBoard(useBoardStore.getState().board));
      setI(0);
      setPracticeEnd(null);
      // A tour where the user makes things: what they make is practice.
      if ((practises(t) || t.examples) && !practiceActive()) beginPractice();
      // On an empty board, what the tour shows is added as examples first.
      setExamplesNote(false);
      if (t.examples) void addExamples(t.examples, mode === 'easy').then((added) => setExamplesNote(added.length > 0));
    };
    window.addEventListener(TOUR_EVENT, on);
    return () => window.removeEventListener(TOUR_EVENT, on);
  }, []);

  // entering a step: switch mode / open what it needs, bring its window into view
  useEffect(() => {
    if (!step) return;
    const st = useBoardStore.getState();
    if (step.mode) {
      const cur = st.board?.uiMode === 'easy' ? 'easy' : 'advanced';
      if (ownMode.current === null) ownMode.current = cur;
      if (cur !== step.mode) st.setUiMode(step.mode);
    }
    if (step.press === GEAR_SELECTOR) {
      // Rule: Settings opens on the page that holds what the step talks about
      // (the target is not in the page until its section is shown).
      window.dispatchEvent(new CustomEvent('krnl:open-settings', { detail: { section: settingsSectionFor(step.target) } }));
      openedSettings.current = true;
    } else if (step.press) {
      const el = document.querySelector(step.press);
      if (el instanceof HTMLElement && !document.querySelector(SETTINGS_MODAL)) {
        el.click();
        openedSettings.current = true;
      }
    } else {
      closeSettings();
    }
    // A step may announce itself (the first-day tour opens the day recap).
    if (step.event) window.dispatchEvent(new CustomEvent(step.event));
    startBoard.current = useBoardStore.getState().board;
    if (step.node) bringIntoView(step.node);
    const putViewBack = step.today ? calendarToToday() : null;
    setNudge(null);
    for (const extra of step.also ?? []) bringIntoView(extra, false);
    // Never leave the words hidden: show them anyway if the target is slow.
    const key = `${tour?.id}:${i}`;
    const t = setTimeout(() => setReadyKey(key), 500);
    return () => { clearTimeout(t); putViewBack?.(); };
  }, [tour, i]); // eslint-disable-line react-hooks/exhaustive-deps

  // follow the target (it moves with the camera / layout)
  useEffect(() => {
    if (!step) return;
    const key = `${tour?.id}:${i}`;
    // The ring is only drawn once the target has stopped moving (the camera
    // may still be gliding to it) and is on screen.
    let prev: Rect | null = null;
    let scrolled = false;
    // What this step points at, once found: it stays its target.
    let kept: Element | null = null;
    const tucked = new Set<HTMLElement>();
    const measure = (): void => {
      // The target, or (when it isn't on screen, e.g. no tasks to show a tag
      // on) the window the step is about.
      const scope = step.node ? document.querySelector(`[data-tour="${step.node}"]`) : null;
      // A step about nothing in particular while a dialog is open (the day
      // recap) is about that dialog: the card goes beside it, never on it.
      const target = sel(step.target) ?? (!step.node ? '[role="dialog"][aria-modal="true"]:not([data-testid="tour-card"])' : undefined);
      const made = idsOnBoard(useBoardStore.getState().board).filter((id) => !tourStartIds.current.has(id));
      const found = target ? findTarget(target, scope, step.targetText, { keep: kept, made }) : null;
      if (found?.box) kept = found.el;
      const from = step.from ? findTarget(step.from, null) : null;
      const fromBox = from?.box ?? null;
      setRect2((cur) => (fromBox ? (same(cur, fromBox) ? cur : fromBox) : null));
      if (found && !found.box && !scrolled) {
        // Present but scrolled out of sight inside its window (a Calendar
        // block below the fold): bring it into view once.
        scrolled = true;
        // A card on the canvas off screen: the camera goes to it (scrolling can't move the canvas).
        const card = (found.el as HTMLElement).closest?.('.react-flow__node');
        const cardId = card?.getAttribute('data-id');
        // (In Station too: its cards sit on a real canvas beside the panels.)
        if (cardId) focusNode(cardId);
        else try { (found.el as HTMLElement).scrollIntoView?.({ block: 'center', inline: 'nearest', behavior: 'smooth' }); } catch { /* never break a tour */ }
      }
      // A floating panel covering it steps aside for this step (put back when the step ends).
      if (found?.box) {
        const cover = coveringPanel(found.el, found.box);
        if (cover && !tucked.has(cover)) { cover.classList.add('krnl-tour-tucked'); tucked.add(cover); }
      }
      // The other windows the step needs stay uncovered too.
      for (const extra of step.also ?? []) {
        const w = document.querySelector(`[data-tour="${extra}"]`);
        const wb = w ? visibleBox(w) : null;
        const cover = w && wb ? coveringPanel(w, wb) : null;
        if (cover && !tucked.has(cover)) { cover.classList.add('krnl-tour-tucked'); tucked.add(cover); }
      }
      const scopeBox = scope ? visibleBox(scope) : null;
      // Not visible (yet): the window the step is about, so the ring never
      // points at an empty spot.
      const now: Rect | null = found?.box ?? scopeBox;
      const onScreen = !!now && now.left < window.innerWidth && now.top < window.innerHeight && now.left + now.width > 0 && now.top + now.height > 0;
      const still = same(now, prev);
      prev = now;
      // Same place as the ring already shows (Next on the same target): keep
      // it. Somewhere new: wait until it stops moving.
      const cur = rectRef.current;
      const nextRect = !onScreen ? null : same(cur, now) ? cur : still ? now : null;
      if (nextRect !== cur) { rectRef.current = nextRect; setRect(nextRect); }
      if (nextRect) setReadyKey(key);
    };
    measure();
    const id = setInterval(measure, 80);
    return () => {
      clearInterval(id);
      for (const t of tucked) t.classList.remove('krnl-tour-tucked');
    };
  }, [step]);

  // wait for the real action
  useEffect(() => {
    if (!step?.waitFor || revisit) return;
    const w = step.waitFor;
    let done = false;
    // A short pause so the user sees their action land before the next step.
    const advance = (): void => { if (done) return; done = true; setTimeout(() => (last ? end() : setI(i + 1)), 350); };
    if ('click' in w) {
      const on = (e: MouseEvent): void => { if (e.target instanceof Element && e.target.closest(w.click)) advance(); };
      document.addEventListener('click', on, true);
      return () => document.removeEventListener('click', on, true);
    }
    const check = (b: Board | null): void => {
      if (!b || !startBoard.current) return;
      if (w.board(b, startBoard.current)) { setNudge(null); advance(); return; }
      if (step.nudge) setNudge(step.nudge(b, startBoard.current));
    };
    check(useBoardStore.getState().board);
    return useBoardStore.subscribe((s) => check(s.board));
  }, [step, revisit]); // eslint-disable-line react-hooks/exhaustive-deps

  // the guide's voice: once this step's words show, read them (stops on the next step)
  const voiceReady = !!tour && !!step && readyKey === `${tour.id}:${i}`;
  useEffect(() => {
    stopVoice();
    if (!voiceReady || !voiceOn || !step) return;
    const mode = (ownMode.current ?? uiMode) === 'easy' ? 'easy' : 'advanced';
    const url = clipFor(voiceKey(spokenText(step.text, mode, step.say, timer)));
    if (!url) return;
    // One voice at a time: the orb's own lines (its greeting) stop for the guide.
    voicePlayer.stop();
    const a = new Audio(url);
    a.volume = 0.9;
    audioRef.current = a;
    // The orb speaks while the guide talks.
    a.addEventListener('playing', () => setGuideSpeaking(true));
    a.addEventListener('ended', () => setGuideSpeaking(false));
    a.addEventListener('pause', () => setGuideSpeaking(false));
    void a.play().catch(() => { setGuideSpeaking(false); /* autoplay refused or no audio device: stay silent */ });
    return () => stopVoice();
  }, [voiceReady, voiceOn, i, tour?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => stopVoice(), []);

  // keys: Enter / → next (when not waiting), ← back, Esc ends
  useEffect(() => {
    if (!tour) return;
    const on = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') { e.preventDefault(); end(); return; }
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || ['INPUT', 'TEXTAREA'].includes(e.target.tagName));
      if (typing) return;
      if ((e.key === 'Enter' || e.key === 'ArrowRight') && (!step?.waitFor || revisit) && !step?.choices) { e.preventDefault(); next(); }
      if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); setI(i - 1); }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  });

  // The orb keeps its own place and size during a tour (it used to ride on
  // the card's corner, small); it stays above the dimming and speaks.
  useEffect(() => {
    setTourAnchor(null);
    setTourActive(!!tour);
  }, [tour]);
  useEffect(() => () => { setTourActive(false); setTourAnchor(null); }, []);
  void anchorPos;

  if (!tour || !step) {
    if (!practiceEnd) return null;
    const W0 = Math.min(420, window.innerWidth - 24);
    const done = (keep: boolean): void => { if (keep) keepPractice(); else removePractice(); setPracticeEnd(null); };
    return createPortal(
      <div data-testid="tour-practice" role="dialog" aria-label="Practice from the tour"
        style={{
          position: 'fixed', left: window.innerWidth / 2 - W0 / 2, top: Math.max(24, window.innerHeight / 2 - 160), width: W0, boxSizing: 'border-box', zIndex: Z.tour,
          background: 'var(--paper)', border: '1px solid color-mix(in srgb, var(--acid) 45%, var(--paper-3))', borderRadius: 14,
          padding: '20px 22px 18px', display: 'flex', flexDirection: 'column', gap: 12, color: 'var(--ink)', boxShadow: '0 18px 50px rgba(0,0,0,0.45)',
        }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-2)', fontWeight: 700 }}>Practice from the tour</span>
        <div style={{ fontSize: 15, lineHeight: 1.55, fontFamily: 'var(--font-sans)' }}>
          The tour made these to show you around. They are <b>not counted</b> anywhere yet — not in Analytics, not in your history.
        </div>
        <ul data-testid="tour-practice-list" style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--ink-2)' }}>
          {practiceEnd.lines.map((l) => <li key={l}>{l}</li>)}
        </ul>
        <div style={{ fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.5 }}>Remove them to keep your board as it was. Keep them if they were real.</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" data-testid="tour-practice-keep" onClick={() => done(true)}
            style={{ fontFamily: 'var(--font-mono)', fontSize: 12, padding: '8px 16px', borderRadius: 8, cursor: 'pointer', border: '1px solid var(--paper-3)', background: 'transparent', color: 'var(--ink-2)' }}>
            Keep them
          </button>
          <button type="button" data-testid="tour-practice-remove" autoFocus onClick={() => done(false)}
            style={{ fontFamily: 'var(--font-mono)', fontSize: 12, padding: '8px 16px', borderRadius: 8, cursor: 'pointer', border: '1px solid var(--acid)', background: 'var(--acid)', color: 'var(--paper)', fontWeight: 700 }}>
            Remove them
          </button>
        </div>
      </div>,
      document.body,
    );
  }

  const W = Math.min(420, window.innerWidth - 24);
  const H = cardRef.current?.offsetHeight ?? 240;
  const pad = 8;
  const pointsAt = !!(step.target || step.node);
  const ready = !pointsAt || readyKey === `${tour.id}:${i}`;
  let pos = { left: window.innerWidth / 2 - W / 2, top: window.innerHeight / 2 - H / 2 };
  if (rect) {
    // With a second ring, the card stays clear of both.
    const u = rect2 ? {
      left: Math.min(rect.left, rect2.left), top: Math.min(rect.top, rect2.top),
      width: Math.max(rect.left + rect.width, rect2.left + rect2.width) - Math.min(rect.left, rect2.left),
      height: Math.max(rect.top + rect.height, rect2.top + rect2.height) - Math.min(rect.top, rect2.top),
    } : rect;
    const placed = placeCard({ left: u.left - pad, top: u.top - pad, width: u.width + pad * 2, height: u.height + pad * 2 }, W, H);
    // The union may leave no side free: then keep clear of the drop target at least.
    pos = rect2 && overlapArea(placed, W, H, rect) > 0 ? placeCard({ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }, W, H) : placed;
    cardPos.current = pos;
  } else if (pointsAt && cardPos.current) {
    pos = cardPos.current;
  }
  anchorPos.current = pos;
  const ownEasy = (ownMode.current ?? uiMode) === 'easy';
  // The step text decides the highlight (write `**{mode}**`). `{pomo}` is the
  // timer's name as its window shows it: Record, Pomo or Observe (timerName).
  const ownM = ownEasy ? 'easy' : 'advanced';
  const text = fillTour(step.text, ownM, timer);

  const btn = (primary: boolean): React.CSSProperties => ({
    fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.06em', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap',
    border: `1px solid ${primary ? 'var(--acid)' : 'var(--paper-3)'}`,
    background: primary ? 'var(--acid)' : 'transparent',
    color: primary ? 'var(--paper)' : 'var(--ink-2)', fontWeight: primary ? 700 : 500,
  });

  return createPortal(
    <>
      <style>{`
        @keyframes krnl-tour-in { from { opacity: 0; transform: scale(1.04); } to { opacity: 1; transform: none; } }
        @keyframes krnl-tour-orb { 0%, 100% { opacity: 0.35; } 50% { opacity: 0.9; } }
        @media (prefers-reduced-motion: reduce) { [data-testid="tour-card"] { transition: none !important; } }
      `}</style>
      {/* spotlight: a ring around the target, the rest dimmed (no pointer events) */}
      {rect ? (
        <div key={`${tour.id}-${step.target ?? step.node ?? ''}`} data-testid="tour-spotlight" aria-hidden style={{
          position: 'fixed', left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2,
          borderRadius: 10, border: '2px solid var(--acid)',
          // Rule: while a step waits for the user to act, nothing is dimmed —
          // what they must click never looks disabled.
          boxShadow: step.waitFor
            ? '0 0 0 4px color-mix(in srgb, var(--acid) 22%, transparent), 0 0 22px color-mix(in srgb, var(--acid) 50%, transparent)'
            : '0 0 0 9999px rgba(0,0,0,0.42), 0 0 22px color-mix(in srgb, var(--acid) 50%, transparent)',
          pointerEvents: 'none', zIndex: Z.tourBackdrop, animation: 'krnl-tour-in 200ms ease-out',
        }}>
          {step.badge && (
            <span data-testid="tour-badge" style={{
              position: 'absolute', left: -2, top: -26, padding: '3px 9px', borderRadius: 5,
              background: 'var(--acid)', color: 'var(--paper)', fontFamily: 'var(--font-mono)', fontSize: 11,
              fontWeight: 700, letterSpacing: '0.08em', whiteSpace: 'nowrap',
            }}>{fillTour(step.badge, ownM, timer)}</span>
          )}
        </div>
      ) : (
        <div aria-hidden style={{ position: 'fixed', inset: 0, background: step.waitFor ? 'transparent' : 'rgba(0,0,0,0.35)', pointerEvents: 'none', zIndex: Z.tourBackdrop }} />
      )}
      {rect2 && rect && (
        <div data-testid="tour-spotlight-from" aria-hidden style={{
          position: 'fixed', left: rect2.left - pad, top: rect2.top - pad, width: rect2.width + pad * 2, height: rect2.height + pad * 2,
          borderRadius: 10, border: '2px dashed var(--acid)', pointerEvents: 'none', zIndex: Z.tourBackdrop,
          boxShadow: '0 0 0 4px color-mix(in srgb, var(--acid) 14%, transparent)', animation: 'krnl-tour-in 200ms ease-out',
        }}>
          {step.fromBadge && (
            <span style={{
              position: 'absolute', left: -2, top: -26, padding: '3px 9px', borderRadius: 5,
              background: 'var(--paper)', color: 'var(--acid-ink, var(--acid))', border: '1px solid var(--acid)', fontFamily: 'var(--font-mono)', fontSize: 11,
              fontWeight: 700, letterSpacing: '0.08em', whiteSpace: 'nowrap',
            }}>{step.fromBadge}</span>
          )}
        </div>
      )}
      <div
        ref={cardRef}
        data-testid="tour-card"
        role="dialog"
        aria-label={fillTour(tour.title, ownM, timer)}
        style={{
          position: 'fixed', left: pos.left, top: pos.top, width: W, boxSizing: 'border-box', zIndex: Z.tour,
          background: 'var(--paper)', border: '1px solid color-mix(in srgb, var(--acid) 45%, var(--paper-3))', borderRadius: 14,
          padding: '20px 22px 18px', display: 'flex', flexDirection: 'column', gap: 14, color: 'var(--ink)',
          boxShadow: '0 18px 50px rgba(0,0,0,0.45)',
          // The card glides to its new spot (from a settled place to a settled place).
          transition: 'left 460ms cubic-bezier(0.22, 1, 0.36, 1), top 460ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'var(--font-mono)' }}>
          <span style={{ fontSize: 11.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-2)', fontWeight: 700 }}>{fillTour(tour.title, ownM, timer)}</span>
          <span style={{ flex: 1 }} />
          <button type="button" data-testid="tour-voice" aria-pressed={voiceOn} aria-label={voiceOn ? 'Mute the guide' : 'Read steps aloud'} title={voiceOn ? 'Mute the guide' : 'Read steps aloud'}
            onClick={() => { const on = !voiceOn; setVoiceOn(on); try { localStorage.setItem(VOICE_PREF, on ? 'on' : 'off'); } catch { /* private window */ } }}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, margin: '-6px 0', borderRadius: 7, border: 'none', background: 'transparent', color: voiceOn ? 'var(--ink-2)' : 'var(--ink-4)', cursor: 'pointer', padding: 0 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
              {voiceOn ? <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" /> : <path d="M16 9.5l5 5M21 9.5l-5 5" />}
            </svg>
          </button>
          <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{i + 1} / {tour.steps.length}</span>
        </div>
        {/* progress */}
        <div aria-hidden style={{ display: 'flex', gap: 4 }}>
          {tour.steps.map((_, k) => (
            <span key={k} style={{ flex: 1, height: 3, borderRadius: 2, background: k <= i ? 'var(--acid)' : 'var(--paper-3)', transition: 'background 200ms' }} />
          ))}
        </div>
        <div
          key={i}
          data-testid="tour-text"
          style={{
            fontSize: 15.5, lineHeight: 1.6, fontFamily: 'var(--font-sans)', color: 'var(--ink)',
            opacity: ready ? 1 : 0, transform: ready ? 'none' : 'translateY(4px)',
            transition: ready ? 'opacity 200ms ease 40ms, transform 200ms ease 40ms' : 'none',
          }}
        >
          {renderTourText(text)}
        </div>
        {nudge && !revisit && (
          <div data-testid="tour-nudge" style={{ fontSize: 13, lineHeight: 1.5, fontFamily: 'var(--font-sans)', color: 'var(--ink)', padding: '8px 10px', borderRadius: 8, background: 'color-mix(in srgb, var(--rust) 14%, transparent)', border: '1px solid color-mix(in srgb, var(--rust) 40%, transparent)' }}>
            {nudge}
          </div>
        )}
        {examplesNote && (
          <div data-testid="tour-examples-note" style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--ink-3)', fontFamily: 'var(--font-sans)' }}>
            Your board is still empty, so I added examples named “Example: …” to show you. They go when the tour ends.
          </div>
        )}
        {i === 0 && practises(tour) && (
          <div data-testid="tour-practice-note" style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--ink-3)', fontFamily: 'var(--font-sans)' }}>
            What you make in this tour is practice: it is not counted, and at the end you choose to remove it or keep it.
          </div>
        )}
        {step.waitFor && !revisit && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontFamily: 'var(--font-mono)', color: 'var(--acid-ink, var(--acid))', opacity: ready ? 1 : 0, transition: 'opacity 200ms ease 200ms' }}>
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--acid)', animation: 'krnl-tour-orb 1.6s ease-in-out infinite' }} />
            {step.hint ?? 'Waiting for you…'}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" data-testid="tour-end" style={{ ...btn(false), border: 'none', padding: '8px 0', color: 'var(--ink-3)' }} onClick={end}>End tour</button>
          <span style={{ flex: 1 }} />
          {i > 0 && <button type="button" data-testid="tour-back" style={btn(false)} onClick={() => setI(i - 1)}>Back</button>}
          {step.choices
            ? step.choices.map((c, k) => (
              <button key={c.mode} type="button" data-testid={`tour-choose-${c.mode}`} style={btn(k === 0)} onClick={() => choose(c.mode)}>{c.label}</button>
            ))
            : step.waitFor && !revisit
              ? <button type="button" data-testid="tour-skip" style={btn(false)} onClick={next}>Skip</button>
              : <>
                {step.then && (
                  <button type="button" data-testid="tour-then" style={btn(false)}
                    onClick={() => { const id = step.then!.tour; end(); window.setTimeout(() => startTour(id), 60); }}>
                    {step.then.label}
                  </button>
                )}
                <button type="button" data-testid="tour-next" style={btn(true)} onClick={next}>{last ? 'Done' : <>Next <LineGlyph name="chevron" size={11} /></>}</button>
              </>}
        </div>
      </div>
    </>,
    document.body,
  );
}
