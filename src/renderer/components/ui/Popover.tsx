// Popover — a small app-styled floating panel anchored under a trigger, used
// in place of native browser pickers (select lists, time pickers), which
// ignore the app theme. Portaled to <body>, flips above when there's no room,
// closes on outside click / Esc, and keeps events off the canvas underneath.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Z } from './layers';

interface Props {
  anchor: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  minWidth?: number;
  children: ReactNode;
}

/**
 * A picker list (hour / minute, a select) is open. A card that closes on
 * Escape checks this first: Escape then closes only the list, not the card
 * and what was typed in it.
 */
export function pickerOpen(): boolean {
  return typeof document !== 'undefined' && document.querySelector('.krnl-popover') !== null;
}

export function Popover({ anchor, open, onClose, minWidth, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchor) return;
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const h = ref.current?.offsetHeight ?? 240;
      const w = Math.max(minWidth ?? 0, r.width);
      const below = r.bottom + 4;
      const top = below + h > window.innerHeight - 8 && r.top - 4 - h > 8 ? r.top - 4 - h : below;
      const next = { left: Math.max(8, Math.min(r.left, window.innerWidth - w - 8)), top, width: w };
      setPos((cur) => (cur && cur.left === next.left && cur.top === next.top && cur.width === next.width ? cur : next));
    };
    place();
    // Follow the field while open: the card around it can grow (a Reminder
    // row appears once a time is set) or the canvas can pan under it.
    let raf = requestAnimationFrame(function tick() { place(); raf = requestAnimationFrame(tick); });
    return () => cancelAnimationFrame(raf);
  }, [open, anchor, minWidth]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as globalThis.Node;
      if (ref.current?.contains(t) || anchor?.contains(t)) return;
      // A popover opened from inside this one (e.g. a TimeField's picker) is part of it.
      if (t instanceof Element && t.closest('.krnl-popover')) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // A field marked data-own-escape handles Escape itself (e.g. cancel an
      // inline rename) instead of closing the whole popover.
      if ((e.target as HTMLElement | null)?.closest?.('[data-own-escape]')) return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open, anchor, onClose]);

  if (!open) return null;
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return createPortal(
    <div
      ref={ref}
      className="krnl-popover nodrag nowheel"
      onPointerDown={stop}
      // Picking an option keeps the focus where the user was typing (the add
      // field, the time field): without this the focus fell to <body> when the
      // list closed, and further typing fired canvas shortcuts.
      onMouseDown={(e) => {
        e.stopPropagation();
        const t = e.target as HTMLElement;
        if (!t.closest('input, textarea, [contenteditable="true"]')) e.preventDefault();
      }}
      onClick={stop} onWheel={stop} onContextMenu={stop}
      style={{
        position: 'fixed', zIndex: Z.popover,
        left: pos?.left ?? -9999, top: pos?.top ?? -9999, minWidth: pos?.width,
        background: 'var(--paper)', color: 'var(--ink)',
        border: '1px solid var(--paper-3)', borderRadius: 10,
        boxShadow: '0 16px 40px rgba(0,0,0,0.5)', padding: 4,
        fontFamily: 'var(--font-sans)',
        animation: 'krnl-popover-in 110ms ease-out',
      }}
    >
      <style>{'@keyframes krnl-popover-in { from { opacity: 0; transform: translateY(-3px); } to { opacity: 1; transform: none; } }'}</style>
      {children}
    </div>,
    document.body,
  );
}
