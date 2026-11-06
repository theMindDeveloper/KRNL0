// Plan by dragging (docs/06-requirements/engagement.md F14, F19). PLAN on a
// Todo row and REPLAN on a missed block teach the drag with one small,
// one-shot animation. Nothing covers the Calendar, nothing dims, nothing loops.
//   · PLAN: a ghost of the task glides once from its row onto the Calendar,
//     the Calendar's edge pulses once, and a tiny chip next to the row says
//     "drag it onto the Calendar". Gone after ~3 s, or as soon as it lands.
//   · REPLAN: the missed block itself lifts and hops once ("I can move"), with
//     a tiny "drag to a new time" chip beside it.
// Mount once (App).

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useBoardStore } from '../../store/boardStore';
import { saveBoard } from '../../store/eventLog';
import { FIT_NODES_EVENT } from '../../store/scheduleActions';
import { isStationHidden } from '../Station/stationVisibility';
import type { MotherNodeConfig } from '../../../shared/types/board';
import { Z } from '../ui/layers';

export const PLAN_GUIDE_EVENT = 'krnl:plan-guide';
const SHOW_MS = 3200;

export interface PlanGuideRequest {
  mode: 'plan' | 'replan';
  text: string;
  taskId?: string | null;
  itemId?: string;
}

export function showPlanGuide(req: PlanGuideRequest): void {
  window.dispatchEvent(new CustomEvent<PlanGuideRequest>(PLAN_GUIDE_EVENT, { detail: req }));
}

type R = { left: number; top: number; width: number; height: number };
const rectOf = (el: Element | null): R | null => {
  const r = el?.getBoundingClientRect();
  return r && r.width > 0 && r.height > 0 ? { left: r.left, top: r.top, width: r.width, height: r.height } : null;
};
const visible = (r: R | null) => !!r && r.left >= 0 && r.top >= 0 && r.left + r.width <= window.innerWidth && r.top + r.height <= window.innerHeight;

/** PLAN needs the row and the Calendar on screen together. */
function bringIntoView(): void {
  const st = useBoardStore.getState();
  const board = st.board;
  if (!board) return;
  const mothers = board.nodes.filter((n) => n.isMother && (n.kind === 'todo' || n.kind === 'calendar'));
  if (board.layoutMode === 'station') {
    for (const m of mothers) {
      if (!isStationHidden(m)) continue;
      const cfg = (m.config ?? {}) as MotherNodeConfig & Record<string, unknown>;
      st.updateNode(m.id, { config: { ...cfg, stationHidden: false } });
    }
    const b = useBoardStore.getState().board;
    if (b) void saveBoard(b);
    return;
  }
  const both = ['todo', 'calendar'].every((k) => visible(rectOf(document.querySelector(`[data-tour="mother-${k}"]`))));
  if (!both) window.dispatchEvent(new CustomEvent(FIT_NODES_EVENT, { detail: { nodeIds: mothers.map((m) => m.id) } }));
}

interface Shown { req: PlanGuideRequest; from: R; to: R | null; key: number }

export function PlanGuide() {
  const [shown, setShown] = useState<Shown | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const on = (e: Event) => {
      const req = (e as CustomEvent<PlanGuideRequest>).detail;
      if (req.mode === 'plan') bringIntoView();
      // Measure once the camera has settled; the animation runs from there.
      clearTimeout(timer);
      timer = setTimeout(() => {
        const src = req.mode === 'replan'
          ? document.querySelector(`[data-testid="task-block-${req.taskId ?? ''}"]`)
          : document.querySelector(`[data-testid="todo-plan-${req.itemId ?? ''}"]`)?.closest('.todo-item') ?? null;
        const from = rectOf(src);
        if (!from) return;
        if (req.mode === 'replan' && src instanceof HTMLElement) {
          src.classList.remove('krnl-hop');
          void src.offsetWidth; // restart the one-shot
          src.classList.add('krnl-hop');
          src.addEventListener('animationend', () => src.classList.remove('krnl-hop'), { once: true });
        }
        const to = req.mode === 'plan' ? rectOf(document.querySelector('[data-testid="calendar-grid-body"]') ?? document.querySelector('[data-tour="mother-calendar"]')) : null;
        setShown({ req, from, to, key: Date.now() });
      }, req.mode === 'plan' ? 450 : 0);
    };
    window.addEventListener(PLAN_GUIDE_EVENT, on);
    return () => { window.removeEventListener(PLAN_GUIDE_EVENT, on); clearTimeout(timer); };
  }, []);

  // Gone after a moment, or as soon as the board changes (it landed).
  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => setShown(null), SHOW_MS);
    const start = useBoardStore.getState().board;
    const unsub = useBoardStore.subscribe((s) => { if (s.board !== start) setShown(null); });
    return () => { clearTimeout(t); unsub(); };
  }, [shown]);

  if (!shown) return null;
  const { req, from, to } = shown;
  const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const chipText = req.mode === 'plan' ? 'drag it onto the Calendar' : 'drag to a new time';
  // The chip sits just under the source, inside its own panel — never on the
  // Calendar and never on a neighbouring window.
  const chipLeft = Math.max(8, Math.min(window.innerWidth - 210, from.left + 24));
  const chipTop = Math.min(window.innerHeight - 30, from.top + from.height + 4);
  const ghostDx = to ? to.left + to.width / 2 - (from.left + 40) : 0;
  const ghostDy = to ? to.top + Math.min(120, to.height / 3) - from.top : 0;

  return createPortal(
    <div key={shown.key} aria-hidden style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: Z.notice }}>
      <style>{`
        @keyframes krnl-guide-ghost { 0% { transform: translate(0,0); opacity: 0; } 15% { opacity: .95; } 85% { opacity: .95; } 100% { transform: translate(var(--dx), var(--dy)); opacity: 0; } }
        @keyframes krnl-guide-pulse { 0% { opacity: 0; } 25% { opacity: 1; } 100% { opacity: 0; } }
        @keyframes krnl-guide-chip { 0% { opacity: 0; transform: translateX(-4px); } 12% { opacity: 1; transform: none; } 85% { opacity: 1; } 100% { opacity: 0; } }
      `}</style>
      {req.mode === 'plan' && to && !reduced && (
        <div
          data-testid="plan-guide-ghost"
          style={{
            position: 'absolute', left: from.left + 28, top: from.top + 2, maxWidth: 200,
            padding: '3px 9px', borderRadius: 6, background: 'var(--node-bg)', border: '1px solid var(--acid)',
            boxShadow: 'var(--shadow-2)', fontFamily: 'var(--font-sans)', fontSize: 11.5, color: 'var(--ink)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            ['--dx' as string]: `${ghostDx}px`, ['--dy' as string]: `${ghostDy}px`,
            animation: 'krnl-guide-ghost 950ms cubic-bezier(0.32, 0.72, 0, 1) 1 both',
          } as React.CSSProperties}
        >
          {req.text}
        </div>
      )}
      {req.mode === 'plan' && to && (
        <div
          data-testid="plan-guide-pulse"
          style={{
            position: 'absolute', left: to.left - 3, top: to.top - 3, width: to.width + 6, height: to.height + 6,
            borderRadius: 8, border: '2px solid var(--acid)', boxShadow: '0 0 18px color-mix(in srgb, var(--acid) 40%, transparent)',
            animation: 'krnl-guide-pulse 1100ms ease-out 700ms 1 both',
          }}
        />
      )}
      <div
        role="status"
        data-testid="plan-guide"
        style={{
          position: 'absolute', left: chipLeft, top: chipTop, height: 22, padding: '0 9px', borderRadius: 999,
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'var(--paper)', border: '1px solid color-mix(in srgb, var(--acid) 55%, var(--paper-3))', boxShadow: 'var(--shadow-1)',
          fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink)', whiteSpace: 'nowrap',
          animation: `krnl-guide-chip ${SHOW_MS}ms ease 1 both`,
        }}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--acid-ink, var(--acid))" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20" /></svg>
        {chipText}
      </div>
    </div>,
    document.body,
  );
}
