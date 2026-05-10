/**
 * TopBar — 44px chrome bar rendered via RF <Panel position="top-center">.
 * Requirements F1 (brand, breadcrumb, live badge) + F2 (FIT, theme, TWEAKS, SHARE).
 *
 * FIT calls useReactFlow().fitView({ padding: 0.2, duration: 300 }).
 * Theme toggle writes data-theme on <html> and persists to localStorage.
 */

import { useState, useEffect } from 'react';
import { useReactFlow } from '@xyflow/react';

type Theme = 'light' | 'dark';

function readStoredTheme(): Theme {
  try {
    const val = localStorage.getItem('krnl0-theme');
    if (val === 'light' || val === 'dark') return val;
  } catch {
    // localStorage unavailable (e.g. test environment)
  }
  return 'dark';
}

function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem('krnl0-theme', theme);
  } catch {
    // ignore
  }
}

export function TopBar() {
  const [theme, setTheme] = useState<Theme>(readStoredTheme);
  const rf = useReactFlow();

  // Sync theme to DOM on mount and whenever it changes.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const handleThemeToggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
  };

  const handleFit = () => {
    rf.fitView({ padding: 0.2, duration: 300 });
  };

  const handleTweaks = () => {
    console.log('[topbar] tweaks');
    // TODO Phase 6: open tweaks panel
  };

  const handleShare = () => {
    console.log('[topbar] share');
    // TODO Phase 6: share board URL
  };

  const themeLabel = theme === 'dark' ? '☾ DARK' : '☀ LIGHT';

  return (
    <div
      data-testid="topbar"
      style={{
        height: 44,
        width: '100%',
        background: 'var(--paper-2)',
        borderBottom: '1px solid var(--paper-3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        flexShrink: 0,
        zIndex: 100,
        boxSizing: 'border-box',
      }}
    >
      {/* Left: brand + breadcrumb + live badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {/* Brand mark + wordmark */}
        <span
          data-testid="topbar-brand"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: '0.06em',
            color: 'var(--acid)',
            userSelect: 'none',
          }}
        >
          ■ KRNL0
        </span>

        {/* Breadcrumb */}
        <span
          data-testid="topbar-breadcrumb"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10.5,
            color: 'var(--ink-4)',
            letterSpacing: '0.03em',
            userSelect: 'none',
          }}
        >
          ∷ ~/krnl0 / boards / deep-work
        </span>

        {/* Live badge */}
        <span
          data-testid="topbar-live-badge"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--acid)',
            letterSpacing: '0.04em',
            userSelect: 'none',
          }}
        >
          ◆ live
        </span>
      </div>

      {/* Right: action buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <TopBarButton label="FIT" onClick={handleFit} testId="topbar-fit" />
        <TopBarButton label={themeLabel} onClick={handleThemeToggle} testId="topbar-theme-toggle" />
        <TopBarButton label="TWEAKS" onClick={handleTweaks} testId="topbar-tweaks" />
        <TopBarButton label="SHARE" onClick={handleShare} testId="topbar-share" />
      </div>
    </div>
  );
}

interface TopBarButtonProps {
  label: string;
  onClick: () => void;
  testId?: string;
}

function TopBarButton({ label, onClick, testId }: TopBarButtonProps) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      style={{
        background: 'transparent',
        border: '1px solid var(--paper-3)',
        borderRadius: 'var(--radius)',
        padding: '4px 10px',
        cursor: 'pointer',
        fontFamily: 'var(--font-mono)',
        fontSize: 10.5,
        color: 'var(--ink-3)',
        letterSpacing: '0.04em',
        textTransform: 'uppercase' as const,
        whiteSpace: 'nowrap' as const,
      }}
    >
      {label}
    </button>
  );
}
