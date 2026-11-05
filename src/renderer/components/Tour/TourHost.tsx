// Runs a guided tour (tours.ts): a spotlight on what the guide talks about,
// a small text card with Back / Next, and steps that wait for the real action.
// The app stays usable underneath (the dimming takes no pointer events).
// Mount once (App). Start with startTour(id) / `krnl tour start <id>`.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Board } from '../../../shared/types';
import type { MotherNodeConfig } from '../../../shared/types/board';
import { useBoardStore } from '../../store/boardStore';
import { saveBoard } from '../../store/eventLog';
import { focusNode } from '../../store/scheduleActions';
import { isStationHidden } from '../Station/stationVisibility';
import { Z } from '../ui/layers';
import { SPACE } from '../ui/spacing';
import { tourById, type Tour } from './tours';

export const TOUR_EVENT = 'krnl:tour';

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

interface Rect { left: number; top: number; width: number; height: number }

export function TourHost(): JSX.Element | null {
  const [tour, setTour] = useState<Tour | null>(null);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const startBoard = useRef<Board | null>(null);

  const end = (): void => { setTour(null); setI(0); setRect(null); };
  const step = tour?.steps[i];
  const last = !!tour && i === tour.steps.length - 1;
  const next = (): void => { if (!tour) return; if (last) end(); else setI(i + 1); };

  // start
  useEffect(() => {
    const on = (e: Event): void => {
      const t = tourById((e as CustomEvent<{ id: string }>).detail.id);
      if (t) { setTour(t); setI(0); }
    };
    window.addEventListener(TOUR_EVENT, on);
    return () => window.removeEventListener(TOUR_EVENT, on);
  }, []);

  // entering a step: bring its window into view, remember the board
  useEffect(() => {
    if (!step) return;
    startBoard.current = useBoardStore.getState().board;
    if (step.node) bringIntoView(step.node);
  }, [tour, i]); // eslint-disable-line react-hooks/exhaustive-deps

  // follow the target (it moves with the camera / layout)
  useEffect(() => {
    if (!step) return;
    // The ring is only drawn once the target has stopped moving (the camera
    // may still be gliding to it) and is on screen. It never animates its
    // position: a sliding ring starts from wherever the last target was —
    // often the far edge — and looks like it is pointing at the wrong thing.
    let prev: Rect | null = null;
    const same = (a: Rect | null, b: Rect | null): boolean =>
      !!a && !!b && Math.abs(a.left - b.left) < 1 && Math.abs(a.top - b.top) < 1 && Math.abs(a.width - b.width) < 1 && Math.abs(a.height - b.height) < 1;
    const measure = (): void => {
      const el = step.target ? document.querySelector(step.target) : null;
      const r = el?.getBoundingClientRect();
      const now: Rect | null = r && r.width > 0 && r.height > 0 ? { left: r.left, top: r.top, width: r.width, height: r.height } : null;
      const onScreen = !!now && now.left < window.innerWidth && now.top < window.innerHeight && now.left + now.width > 0 && now.top + now.height > 0;
      const settled = onScreen && same(now, prev);
      prev = now;
      setRect((cur) => (settled ? (same(cur, now) ? cur : now) : null));
    };
    setRect(null);
    measure();
    const id = setInterval(measure, 120);
    return () => clearInterval(id);
  }, [step]);

  // wait for the real action
  useEffect(() => {
    if (!step?.waitFor) return;
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
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  // keys: Enter / → next (when not waiting), ← back, Esc ends
  useEffect(() => {
    if (!tour) return;
    const on = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') { end(); return; }
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || ['INPUT', 'TEXTAREA'].includes(e.target.tagName));
      if (typing) return;
      if ((e.key === 'Enter' || e.key === 'ArrowRight') && !step?.waitFor) { e.preventDefault(); next(); }
      if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); setI(i - 1); }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  });

  if (!tour || !step) return null;

  // card: under the target if there is room, else above, else centred
  const W = 320;
  const pad = 8;
  let cardLeft = window.innerWidth / 2 - W / 2;
  let cardTop = window.innerHeight / 2 - 80;
  if (rect) {
    cardLeft = Math.max(12, Math.min(rect.left, window.innerWidth - W - 12));
    cardTop = rect.top + rect.height + 14 + 170 < window.innerHeight ? rect.top + rect.height + 14 : Math.max(12, rect.top - 14 - 170);
  }
  const btn = (primary: boolean): React.CSSProperties => ({
    fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.06em', padding: '6px 12px', borderRadius: 6, cursor: 'pointer',
    border: `1px solid ${primary ? 'var(--ink)' : 'var(--paper-3)'}`, background: primary ? 'var(--ink)' : 'transparent', color: primary ? 'var(--paper)' : 'var(--ink-2)',
  });

  return createPortal(
    <>
      {/* spotlight: a ring around the target, the rest dimmed (no pointer events) */}
      {rect ? (
        <div data-testid="tour-spotlight" aria-hidden style={{
          position: 'fixed', left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2,
          borderRadius: 10, border: '2px solid var(--acid)', boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)',
          pointerEvents: 'none', zIndex: Z.tourBackdrop,
        }} />
      ) : (
        <div aria-hidden style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', pointerEvents: 'none', zIndex: Z.tourBackdrop }} />
      )}
      <div
        data-testid="tour-card"
        role="dialog"
        aria-label={tour.title}
        style={{
          position: 'fixed', left: cardLeft, top: cardTop, width: W, zIndex: Z.tour,
          background: 'var(--paper)', border: '1px solid var(--paper-3)', borderRadius: 10, padding: SPACE.panelPad,
          display: 'flex', flexDirection: 'column', gap: SPACE.section, fontFamily: 'var(--font-mono)', color: 'var(--ink)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: SPACE.inline }}>
          <span style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>{tour.title}</span>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 10, color: 'var(--ink-4)' }}>{i + 1} / {tour.steps.length}</span>
        </div>
        <div data-testid="tour-text" style={{ fontSize: 12.5, lineHeight: 1.55, fontFamily: 'var(--font-sans)' }}>{step.text}</div>
        {step.waitFor && <div style={{ fontSize: 10.5, color: 'var(--acid-ink, var(--acid))' }}>{step.hint ?? 'Waiting for you…'}</div>}
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.inline }}>
          <button type="button" data-testid="tour-end" style={{ ...btn(false), border: 'none', padding: '6px 0', color: 'var(--ink-4)' }} onClick={end}>End tour</button>
          <span style={{ flex: 1 }} />
          {i > 0 && <button type="button" data-testid="tour-back" style={btn(false)} onClick={() => setI(i - 1)}>Back</button>}
          {step.waitFor
            ? <button type="button" data-testid="tour-skip" style={btn(false)} onClick={next}>Skip</button>
            : <button type="button" data-testid="tour-next" style={btn(true)} onClick={next}>{last ? 'Done' : 'Next'}</button>}
        </div>
      </div>
    </>,
    document.body,
  );
}
