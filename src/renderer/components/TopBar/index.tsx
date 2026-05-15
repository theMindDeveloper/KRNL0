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
        <TopBarButton label="FIT" onClick={handleFit} testId="topbar-fit" />
        <TopBarButton label={themeLabel} onClick={handleThemeToggle} testId="topbar-theme-toggle" />
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
