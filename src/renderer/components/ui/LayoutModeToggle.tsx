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

export function LayoutModeToggle() {
  const layoutMode = useBoardStore((s) => s.board?.layoutMode ?? 'canvas');
  const setLayoutMode = useBoardStore((s) => s.setLayoutMode);

  const toggle = () => {
    const next: LayoutMode = layoutMode === 'station' ? 'canvas' : 'station';
    setLayoutMode(next);
  };

  // ⌘/Ctrl+Shift+L shortcut — F3.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod || !e.shiftKey) return;
      if (e.key !== 'L' && e.key !== 'l') return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutMode]);

  const isStation = layoutMode === 'station';

  return (
    <div
      data-testid="layout-mode-toggle"
      title="Toggle Station / Canvas mode (⌘⇧L)"
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
        onClick={() => { if (!isStation) setLayoutMode('station'); }}
      />
      <PillSegment
        label="◰ CANVAS"
        active={!isStation}
        testId="layout-toggle-canvas"
        onClick={() => { if (isStation) setLayoutMode('canvas'); }}
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
        fontSize: 10.5,
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
