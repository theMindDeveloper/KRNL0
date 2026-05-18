/**
 * TopBar — 44px chrome bar rendered via RF <Panel position="top-center">.
 * Requirements F1 (brand, breadcrumb, live badge) + F2 (FIT, theme, TWEAKS, SHARE).
 *
 * FIT calls useReactFlow().fitView({ padding: 0.2, duration: 300 }).
 * Theme toggle writes data-theme on <html> and persists to localStorage.
 */

import { useState, useEffect } from 'react';
import { useReactFlow } from '@xyflow/react';
import { LayoutModeToggle } from '../ui/LayoutModeToggle';
import { useDockStyle } from '../ChassisLayer/useDockStyle';

type Theme = 'light' | 'dark';

// macOS traffic lights (red/yellow/green) live in the top-left of the window
// because main uses `titleBarStyle: 'hidden'`. Their click area extends to
// roughly 72-78px. Without an offset, the KRNL0 logo and brand chip render
// directly under them and the lights eclipse the mark.
const IS_MAC =
  typeof navigator !== 'undefined' &&
  /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
const MAC_TRAFFIC_LIGHT_INSET = 78;

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
  const [dockStyle, setDockStyle] = useDockStyle();
  const rf = useReactFlow();

  // KRNL Dock is a dark-only skin — hide the theme toggle while it's
  // selected so the user can't switch to a light variant that the chassis
  // chrome ignores anyway. If the user lands on krnl-dock while in light
  // mode, force the global theme back to dark for visual consistency.
  useEffect(() => {
    if (dockStyle === 'krnl-dock' && theme !== 'dark') {
      setTheme('dark');
    }
  }, [dockStyle, theme]);

  void setDockStyle;

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
        // Left padding clears the macOS traffic-light cluster so the brand
        // mark and breadcrumb never sit underneath the red/yellow/green
        // controls. Windows/Linux render controls on the right, so the
        // standard 16px inset is fine.
        paddingTop: 0,
        paddingBottom: 0,
        paddingLeft: IS_MAC ? MAC_TRAFFIC_LIGHT_INSET : 16,
        paddingRight: 158,
        flexShrink: 0,
        zIndex: 100,
        boxSizing: 'border-box',
        WebkitAppRegion: 'drag',
      } as React.CSSProperties}
    >
      {/* Left: brand + breadcrumb + live badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {/* Brand mark — Wave C (LifeOS UI refresh).
            Source: user's logo-snippet.html — dashed halo ring + rounded
            block mark (ink in light theme / acid in dark theme) + ■ glyph +
            KRNL0 wordmark with dimmed "0". The SVG renders one of two
            variants depending on `theme` so both halo dim and mark fill
            track the surface they sit on. */}
        <span
          data-testid="topbar-brand"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            userSelect: 'none',
          }}
        >
          <svg
            data-testid="topbar-brand-mark"
            aria-hidden
            width={26}
            height={26}
            viewBox="0 0 80 80"
            style={{ display: 'block', flexShrink: 0, overflow: 'visible' }}
          >
            {theme === 'dark' ? (
              <>
                <rect x={2} y={4} width={72} height={72} rx={11}
                      fill="none" stroke="#5a5244" strokeWidth={1.5}
                      strokeDasharray="4 3" opacity={0.7} />
                <rect x={10} y={12} width={56} height={56} rx={7} fill="#c9f158" />
                <text x={38} y={40} textAnchor="middle" dominantBaseline="central"
                      fontFamily="var(--font-mono)" fontWeight={700} fontSize={26}
                      fill="#0e0d0b">■</text>
              </>
            ) : (
              <>
                <rect x={2} y={4} width={72} height={72} rx={11}
                      fill="none" stroke="#9a9180" strokeWidth={1.5}
                      strokeDasharray="4 3" opacity={0.6} />
                <rect x={10} y={12} width={56} height={56} rx={7} fill="#1a1814" />
                <text x={38} y={40} textAnchor="middle" dominantBaseline="central"
                      fontFamily="var(--font-mono)" fontWeight={700} fontSize={26}
                      fill="#c9f158">■</text>
              </>
            )}
          </svg>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: '0.08em',
              color: 'var(--ink)',
            }}
          >
            KRNL<span style={{ color: 'var(--ink-3)', fontWeight: 400 }}>0</span>
          </span>
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <LayoutModeToggle />
        <TopBarButton label="FIT" onClick={handleFit} testId="topbar-fit" />
        {dockStyle !== 'krnl-dock' && (
          <TopBarButton label={themeLabel} onClick={handleThemeToggle} testId="topbar-theme-toggle" />
        )}
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
        WebkitAppRegion: 'no-drag',
      } as React.CSSProperties}
    >
      {label}
    </button>
  );
}
