// Runs a guided tour (tours.ts): a spotlight on what the guide talks about,
// a guide card (with a small orb) that glides to it, and steps that wait for
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
import { focusNode } from '../../store/scheduleActions';
import { isStationHidden } from '../Station/stationVisibility';
import { Z } from '../ui/layers';
import { stepsFor, tourById, type Tour } from './tours';

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

/** Bring a mother window into view: centre it on the canvas, or show its Station panel. */
function bringIntoView(nodeId: string): void {
  const st = useBoardStore.getState();
  const board = st.board;
  const node = board?.nodes.find((n) => n.id === nodeId);
  if (!board || !node) return;
  if (board.layoutMode === 'station') {
    if (isStationHidden(node)) {
      const cfg = (node.config ?? {}) as MotherNodeConfig & Record<string, unknown>;
      st.updateNode(node.id, { config: { ...cfg, stationHidden: false } });
      const b = useBoardStore.getState().board;
      if (b) void saveBoard(b);
    }
  } else {
    focusNode(nodeId);
  }
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

interface Rect { left: number; top: number; width: number; height: number }

const same = (a: Rect | null, b: Rect | null): boolean =>
  !!a && !!b && Math.abs(a.left - b.left) < 1 && Math.abs(a.top - b.top) < 1 && Math.abs(a.width - b.width) < 1 && Math.abs(a.height - b.height) < 1;

/** Where the card goes: below the target, else above, right, left — else the bottom-right corner. */
function placeCard(r: Rect, w: number, h: number): { left: number; top: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const gap = 18;
  const m = 12;
  const clampX = (x: number) => Math.max(m, Math.min(x, vw - w - m));
  const clampY = (y: number) => Math.max(m, Math.min(y, vh - h - m));
  if (r.top + r.height + gap + h < vh - m) return { left: clampX(r.left), top: r.top + r.height + gap };
  if (r.top - gap - h > m) return { left: clampX(r.left), top: r.top - gap - h };
  if (r.left + r.width + gap + w < vw - m) return { left: r.left + r.width + gap, top: clampY(r.top) };
  if (r.left - gap - w > m) return { left: r.left - gap - w, top: clampY(r.top) };
  return { left: vw - w - m, top: vh - h - m };
}

export function TourHost(): JSX.Element | null {
  const [tour, setTour] = useState<Tour | null>(null);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  // The words show once the card has arrived at THIS step's target (or
  // straight away when the step points at nothing). Tracked per step, so the
  // next step's words never flash at the old spot.
  const [readyKey, setReadyKey] = useState('');
  const rectRef = useRef<Rect | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const startBoard = useRef<Board | null>(null);
  const uiMode = useBoardStore((s) => (s.board?.uiMode === 'easy' ? 'easy' : 'advanced'));
  // The user's own mode, put back when a tour that switched modes ends
  // without the user choosing one.
  const ownMode = useRef<'easy' | 'advanced' | null>(null);
  const modeChosen = useRef(false);
  // The guide opened Settings for a step; close it again when moving on.
  const openedSettings = useRef(false);
  // Last card position: the card stays where it is while the next target
  // settles, then glides there.
  const cardPos = useRef<{ left: number; top: number } | null>(null);

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
    setTour(null); setI(0); setRect(null); setReadyKey('');
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
      const mode = useBoardStore.getState().board?.uiMode === 'easy' ? 'easy' : 'advanced';
      setTour({ ...t, steps: stepsFor(t, mode) });
      setI(0);
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
    if (step.press) {
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
    // Never leave the words hidden: show them anyway if the target is slow.
    const key = `${tour?.id}:${i}`;
    const t = setTimeout(() => setReadyKey(key), 1200);
    return () => clearTimeout(t);
  }, [tour, i]); // eslint-disable-line react-hooks/exhaustive-deps

  // follow the target (it moves with the camera / layout)
  useEffect(() => {
    if (!step) return;
    const key = `${tour?.id}:${i}`;
    // The ring is only drawn once the target has stopped moving (the camera
    // may still be gliding to it) and is on screen.
    let prev: Rect | null = null;
    const measure = (): void => {
      // The target, or (when it isn't on screen, e.g. no tasks to show a tag
      // on) the window the step is about.
      const el = (step.target ? document.querySelector(step.target) : null)
        ?? (step.node ? document.querySelector(`[data-tour="${step.node}"]`) : null);
      const r = el?.getBoundingClientRect();
      const now: Rect | null = r && r.width > 0 && r.height > 0 ? { left: r.left, top: r.top, width: r.width, height: r.height } : null;
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
    const id = setInterval(measure, 100);
    return () => clearInterval(id);
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
    const check = (b: Board | null): void => { if (b && startBoard.current && w.board(b, startBoard.current)) advance(); };
    check(useBoardStore.getState().board);
    return useBoardStore.subscribe((s) => check(s.board));
  }, [step, revisit]); // eslint-disable-line react-hooks/exhaustive-deps

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

  if (!tour || !step) return null;

  const W = Math.min(420, window.innerWidth - 24);
  const H = cardRef.current?.offsetHeight ?? 240;
  const pad = 8;
  const pointsAt = !!(step.target || step.node);
  const ready = !pointsAt || readyKey === `${tour.id}:${i}`;
  let pos = { left: window.innerWidth / 2 - W / 2, top: window.innerHeight / 2 - H / 2 };
  if (rect) {
    pos = placeCard({ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }, W, H);
    cardPos.current = pos;
  } else if (pointsAt && cardPos.current) {
    pos = cardPos.current;
  }
  const ownEasy = (ownMode.current ?? uiMode) === 'easy';
  const ownLabel = ownEasy ? 'Easy' : 'Advanced';
  // The step text decides the highlight (write `**{mode}**`). `{pomo}` is the
  // timer's name: "Record" in Easy, "Pomo" in Advanced (research C6).
  const text = step.text.split('{mode}').join(ownLabel).split('{pomo}').join(ownEasy ? 'Record' : 'Pomo');

  const btn = (primary: boolean): React.CSSProperties => ({
    fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.06em', padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
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
          boxShadow: '0 0 0 9999px rgba(0,0,0,0.5), 0 0 22px color-mix(in srgb, var(--acid) 50%, transparent)',
          pointerEvents: 'none', zIndex: Z.tourBackdrop, animation: 'krnl-tour-in 200ms ease-out',
        }}>
          {step.badge && (
            <span data-testid="tour-badge" style={{
              position: 'absolute', left: -2, top: -26, padding: '3px 9px', borderRadius: 5,
              background: 'var(--acid)', color: 'var(--paper)', fontFamily: 'var(--font-mono)', fontSize: 11,
              fontWeight: 700, letterSpacing: '0.08em', whiteSpace: 'nowrap',
            }}>{step.badge}</span>
          )}
        </div>
      ) : (
        <div aria-hidden style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', pointerEvents: 'none', zIndex: Z.tourBackdrop }} />
      )}
      <div
        ref={cardRef}
        data-testid="tour-card"
        role="dialog"
        aria-label={tour.title}
        style={{
          position: 'fixed', left: pos.left, top: pos.top, width: W, boxSizing: 'border-box', zIndex: Z.tour,
          background: 'var(--paper)', border: '1px solid color-mix(in srgb, var(--acid) 45%, var(--paper-3))', borderRadius: 14,
          padding: '20px 22px 18px', display: 'flex', flexDirection: 'column', gap: 14, color: 'var(--ink)',
          boxShadow: '0 18px 50px rgba(0,0,0,0.45)',
          // The card glides to its new spot (from a settled place to a settled place).
          transition: 'left 460ms cubic-bezier(0.22, 1, 0.36, 1), top 460ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        {/* The guide: a small orb riding on the card, so it reads as "the guide moved over here". */}
        <span aria-hidden data-testid="tour-orb" style={{
          position: 'absolute', left: -14, top: -14, width: 28, height: 28, borderRadius: '50%',
          background: 'radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--acid) 35%, white), var(--acid) 55%, color-mix(in srgb, var(--acid) 50%, black))',
          boxShadow: '0 0 12px 2px color-mix(in srgb, var(--acid) 55%, transparent)',
        }}>
          <span style={{
            position: 'absolute', inset: -6, borderRadius: '50%',
            background: 'radial-gradient(circle, color-mix(in srgb, var(--acid) 60%, transparent), transparent 70%)',
            animation: 'krnl-tour-orb 2.4s ease-in-out infinite',
          }} />
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'var(--font-mono)' }}>
          <span style={{ fontSize: 11.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-2)', fontWeight: 700 }}>{tour.title}</span>
          <span style={{ flex: 1 }} />
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
            transition: ready ? 'opacity 260ms ease 160ms, transform 260ms ease 160ms' : 'none',
          }}
        >
          {renderTourText(text)}
        </div>
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
              : <button type="button" data-testid="tour-next" style={btn(true)} onClick={next}>{last ? 'Done' : 'Next →'}</button>}
        </div>
      </div>
    </>,
    document.body,
  );
}
