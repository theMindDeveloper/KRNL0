/**
 * LayoutModeToggle — topbar pill that switches between Station and Canvas modes.
 *
 * ADR 0008 § 2.3 / F2 / F3 / F15.
 *
 * Placement: immediately left of the FIT button in TopBar.
 * Keyboard shortcut: ⌘/Ctrl+Shift+L.
 * Tooltip: "Toggle Station / Canvas mode (⌘⇧L)".
 */

import { useEffect } from 'react';
import { useBoardStore } from '../../store/boardStore';
import type { LayoutMode } from '../../../shared/types';
import { isModalOpen } from '../../utils/keyboardTargets';
import { useLineLayout } from '../../store/lineLayout';

export function LayoutModeToggle() {
  const layoutMode = useBoardStore((s) => s.board?.layoutMode ?? 'canvas');
  const setLayoutMode = useBoardStore((s) => s.setLayoutMode);
  // line-layout.md — a third way to look at the same board.
  const lineOn = useLineLayout((s) => s.on);
  const setLineOn = useLineLayout((s) => s.setOn);

  const toggle = () => {
    // From the Line layout the chord goes back to the windows as they were.
    if (lineOn) { setLineOn(false); return; }
    const next: LayoutMode = layoutMode === 'station' ? 'canvas' : 'station';
    setLayoutMode(next);
  };

  // ⌘/Ctrl+Shift+L shortcut — F3.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod || !e.shiftKey) return;
      if (e.key !== 'L' && e.key !== 'l') return;
      // A chord no field or shell uses, so it also works from the terminal
      // (which holds focus at start); only a modal dialog blocks it.
      if (isModalOpen()) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutMode, lineOn]);

  const isStation = layoutMode === 'station' && !lineOn;
  const isFree = layoutMode !== 'station' && !lineOn;

  return (
    <div
      data-testid="layout-mode-toggle"
      title="Line: your day as one line · Station: windows in fixed places · Free: put anything anywhere (⌘⇧L)"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        border: '1px solid var(--paper-3)',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      <PillSegment
        label="◳ STATION"
        active={isStation}
        testId="layout-toggle-station"
        onClick={() => { setLineOn(false); if (layoutMode !== 'station') setLayoutMode('station'); }}
      />
      <PillSegment
        label="◰ FREE"
        active={isFree}
        testId="layout-toggle-canvas"
        onClick={() => { setLineOn(false); if (layoutMode === 'station') setLayoutMode('canvas'); }}
        borderLeft
      />
      <PillSegment
        label="― LINE"
        active={lineOn}
        testId="layout-toggle-line"
        onClick={() => setLineOn(true)}
        borderLeft
      />
    </div>
  );
}

interface PillSegmentProps {
  label: string;
  active: boolean;
  testId: string;
  onClick: () => void;
  borderLeft?: boolean;
}

function PillSegment({ label, active, testId, onClick, borderLeft }: PillSegmentProps) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      style={{
        background: active ? 'var(--paper-3)' : 'transparent',
        border: 'none',
        borderLeft: borderLeft ? '1px solid var(--paper-3)' : undefined,
        padding: '4px 9px',
        cursor: active ? 'default' : 'pointer',
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        color: active ? 'var(--ink)' : 'var(--ink-4)',
        letterSpacing: '0.04em',
        textTransform: 'uppercase' as const,
        whiteSpace: 'nowrap' as const,
        WebkitAppRegion: 'no-drag',
        transition: 'background 150ms, color 150ms',
      } as React.CSSProperties}
    >
      {label}
    </button>
  );
}
