// Windows you place yourself (Decision 67, design "KRNL0 phone sideways ·
// Dock", direction D, owner pick 2026-11-25 "D, also on iPad"):
//   - a slot holds one of the board's windows; a tap on the window's name
//     opens a small list and the pick goes there. A window already shown in
//     another slot swaps places with it, so no window is ever shown twice (two
//     Timer windows would both act when a session ends).
//   - the choice is this device's own (localStorage), never synced.
//   - the Timer pill: on the sideways phone, while no slot holds the Timer, it
//     sits in the corner (running: what and how long, with Stop; idle: Start).
//   - More, on the phone and the sideways phone, is a small popup of choices.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useBoardStore } from '../../store/boardStore';
import { makeCommandHandler } from '../Canvas/commandDispatch';
import { WindowPickContext } from '../nodes/WindowName';
import type { PomoState } from '../nodes/PomoNode/types';
import { MotherWindow, type MotherKind } from './MotherWindow';

export const SLOT_CHOICES: ReadonlyArray<{ kind: MotherKind; label: string; d: string }> = [
  { kind: 'todo', label: 'Todo', d: 'M4 4h5v5H4zM5.5 6.5l1 1 1.5-2M12 6.5h8M4 15h5v5H4zM12 17.5h8' },
  { kind: 'pomo', label: 'Timer', d: 'M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 9v4l2.5 2.5M9.5 2.5h5' },
  { kind: 'clock', label: 'Clock', d: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l-3 2' },
  { kind: 'calendar', label: 'Calendar', d: 'M4 5h16v15H4zM4 9h16M9.5 9v11M14.5 9v11' },
  { kind: 'habit', label: 'Habits', d: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 17l2 2 4-4' },
  { kind: 'analytics', label: 'Insights', d: 'M5 20V10M10 20V4M15 20v-7M20 20v-4' },
];
const KINDS = new Set<MotherKind>(SLOT_CHOICES.map((c) => c.kind));
const labelOf = (k: MotherKind): string => SLOT_CHOICES.find((c) => c.kind === k)?.label ?? k;

/** Pure: put `kind` in slot `i`; if another slot shows it, the two swap. */
export function chooseSlot(slots: readonly MotherKind[], i: number, kind: MotherKind): MotherKind[] {
  const next = [...slots];
  const j = next.indexOf(kind);
  if (j === i) return next;
  if (j >= 0) next[j] = next[i]!;
  next[i] = kind;
  return next;
}

/** Pure: a stored list, if it is one we can use (same length, known windows, none twice). */
export function readSlots(raw: string | null, defaults: readonly MotherKind[]): MotherKind[] {
  try {
    const v: unknown = raw ? JSON.parse(raw) : null;
    if (Array.isArray(v) && v.length === defaults.length && v.every((k) => KINDS.has(k as MotherKind)) && new Set(v).size === v.length) return v as MotherKind[];
  } catch { /* not ours */ }
  return [...defaults];
}

export function useSlots(key: string, defaults: readonly MotherKind[]): [MotherKind[], (i: number, k: MotherKind) => void] {
  const [slots, setSlots] = useState<MotherKind[]>(() => {
    let raw: string | null = null;
    try { raw = localStorage.getItem(key); } catch { /* private window */ }
    return readSlots(raw, defaults);
  });
  const choose = (i: number, k: MotherKind): void => {
    setSlots((cur) => {
      const next = chooseSlot(cur, i, k);
      try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* private window */ }
      return next;
    });
  };
  return [slots, choose];
}

/** A small menu at a button (fixed to the screen); closes on a tap outside or Esc. */
export function Popover({ anchor, side, label, onClose, children, testId }: {
  anchor: DOMRect; side: 'below' | 'above' | 'right'; label: string; onClose: () => void; children: ReactNode; testId: string;
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: anchor.left, top: anchor.bottom + 6 });
  useLayoutEffect(() => {
    const el = ref.current;
    const w = el?.offsetWidth ?? 240;
    const h = el?.offsetHeight ?? 200;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = side === 'right' ? anchor.right + 8 : side === 'above' ? anchor.right - w : anchor.left;
    let top = side === 'right' ? anchor.bottom - h : side === 'above' ? anchor.top - h - 8 : anchor.bottom + 6;
    left = Math.max(8, Math.min(left, vw - w - 8));
    top = Math.max(8, Math.min(top, vh - h - 8));
    setPos({ left, top });
  }, [anchor, side]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLElement>('[role^="menuitem"]')?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      <div className="m-pop-backdrop" onPointerDown={(e) => { e.preventDefault(); onClose(); }} aria-hidden="true" />
      <div ref={ref} className="m-pop" role="menu" aria-label={label} style={{ left: pos.left, top: pos.top }} data-testid={testId}>
        {children}
      </div>
    </>
  );
}

function SlotIcon({ d }: { d: string }) {
  return <svg className="m-icon" width={20} height={20} viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>;
}

/** Windows in slots, each one's name a way to put another window there. */
export function WindowSlots({ slots, onChoose, render }: {
  slots: readonly MotherKind[];
  onChoose: (i: number, k: MotherKind) => void;
  /** Lays out the slots; `slot(i)` is the i-th window with its picker. */
  render: (slot: (i: number) => JSX.Element) => JSX.Element;
}): JSX.Element {
  const [menu, setMenu] = useState<{ i: number; at: DOMRect } | null>(null);
  const slot = (i: number): JSX.Element => (
    <WindowPickContext.Provider value={(el) => setMenu({ i, at: el.getBoundingClientRect() })}>
      <div className="m-slotwin" data-testid={`m-slot-${i}`} data-kind={slots[i]}>
        <MotherWindow kind={slots[i]!} label={labelOf(slots[i]!)} />
      </div>
    </WindowPickContext.Provider>
  );
  return (
    <>
      {render(slot)}
      {menu && (
        <Popover anchor={menu.at} side="below" label="Show here" onClose={() => setMenu(null)} testId="m-slot-menu">
          <div className="m-pop__cap">Show here</div>
          {SLOT_CHOICES.map((c) => {
            const on = slots[menu.i] === c.kind;
            return (
              <button
                key={c.kind}
                type="button"
                role="menuitemradio"
                aria-checked={on}
                className={`m-pop__item${on ? ' on' : ''}`}
                onClick={() => { onChoose(menu.i, c.kind); setMenu(null); }}
                data-testid={`m-slot-pick-${c.kind}`}
              >
                <SlotIcon d={c.d} />
                <span className="m-pop__text"><strong>{c.label}</strong></span>
                {on && <svg className="m-icon m-pop__check" width={16} height={16} viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>}
              </button>
            );
          })}
        </Popover>
      )}
    </>
  );
}

/** The Timer in a corner, while no slot shows it: Start, or what runs and Stop. */
export function TimerPill({ reading, onOpen }: { reading: { text: string; label: string } | null; onOpen: () => void }): JSX.Element | null {
  const pomo = useBoardStore((s) => s.board?.nodes.find((n) => n.isMother && n.kind === 'pomo') ?? null);
  if (!pomo) return null;
  const run = makeCommandHandler(pomo.id);
  if (!reading) {
    return (
      <div className="m-pill" data-testid="m-pill">
        <button type="button" className="m-pill__go" onClick={() => run('pomo.start', {})} data-testid="m-pill-start">
          <svg width={14} height={14} viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" fill="currentColor" /></svg>
          Start
        </button>
      </div>
    );
  }
  const what = (pomo.state as PomoState).label?.trim() || reading.label;
  return (
    <div className="m-pill m-pill--live" data-testid="m-pill">
      <button type="button" className="m-pill__read" onClick={onOpen} aria-label={`${what}, ${reading.text}: open the Timer`} data-testid="m-pill-open">
        <span className="m-dot m-dot--acid" aria-hidden="true" />
        <span className="m-pill__what">{what}</span>
        <span className="m-num m-pill__time">{reading.text}</span>
      </button>
      <button type="button" className="m-pill__go" onClick={() => run('pomo.stop', {})} data-testid="m-pill-stop">Stop</button>
    </div>
  );
}
