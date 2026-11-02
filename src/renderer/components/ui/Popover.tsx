// Popover — a small app-styled floating panel anchored under a trigger, used
// in place of native browser pickers (select lists, time pickers), which
// ignore the app theme. Portaled to <body>, flips above when there's no room,
// closes on outside click / Esc, and keeps events off the canvas underneath.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  anchor: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  minWidth?: number;
  children: ReactNode;
}

export function Popover({ anchor, open, onClose, minWidth, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchor) return;
    const r = anchor.getBoundingClientRect();
    const h = ref.current?.offsetHeight ?? 240;
    const w = Math.max(minWidth ?? 0, r.width);
    const below = r.bottom + 4;
    const top = below + h > window.innerHeight - 8 && r.top - 4 - h > 8 ? r.top - 4 - h : below;
    setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - w - 8)), top, width: w });
  }, [open, anchor, minWidth]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as globalThis.Node;
      if (ref.current?.contains(t) || anchor?.contains(t)) return;
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
      className="nodrag nowheel"
      onPointerDown={stop} onMouseDown={stop} onClick={stop} onWheel={stop} onContextMenu={stop}
      style={{
        position: 'fixed', zIndex: 4000,
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
