/**
 * TopBar — 44px chrome bar rendered via RF <Panel position="top-center">.
 * Requirements F1 (brand, breadcrumb, live badge) + F2 (FIT, theme, TWEAKS, SHARE).
 *
 * FIT calls useReactFlow().fitView({ padding: 0.2, duration: 300 }).
 * Theme toggle writes data-theme on <html> and persists to localStorage.
 */

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useReactFlow } from '@xyflow/react';
import { LayoutModeToggle } from '../ui/LayoutModeToggle';
import { useDockStyle } from '../ChassisLayer/useDockStyle';
import { isDarkOnly } from '../ChassisLayer/dockRegistry';
import { HoldButton } from '../ui/HoldButton';
import { useBoardStore } from '../../store/boardStore';

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
  const [dockStyle] = useDockStyle();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const rf = useReactFlow();

  // Some dock skins declare themselves dark-only (see dockRegistry.theme).
  // Hide the theme toggle while one is selected and force the global theme
  // to dark for visual consistency.
  const darkOnly = isDarkOnly(dockStyle);
  useEffect(() => {
    if (darkOnly && theme !== 'dark') setTheme('dark');
  }, [darkOnly, theme]);

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
        {!darkOnly && (
          <TopBarButton label={themeLabel} onClick={handleThemeToggle} testId="topbar-theme-toggle" />
        )}
        <TopBarButton label="⚙" onClick={() => setSettingsOpen(true)} testId="topbar-settings" />
      </div>

      {settingsOpen && (
        <SettingsModal onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  );
}

// ── Program settings modal (factory reset) ──────────────────────────────────

function SettingsModal({ onClose }: { onClose: () => void }) {
  const factoryReset = useBoardStore((s) => s.factoryReset);
  return createPortal(
    <div
      data-testid="settings-modal"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 4000,
        background: 'rgba(0,0,0,0.55)',
        display: 'grid',
        placeItems: 'center',
        WebkitAppRegion: 'no-drag',
      } as React.CSSProperties}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 380,
          maxWidth: '90vw',
          background: 'var(--paper)',
          border: '1px solid var(--paper-3)',
          borderRadius: 10,
          padding: '18px 20px',
          boxShadow: 'var(--shadow-1)',
          fontFamily: 'var(--font-mono)',
          color: 'var(--ink)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.06em' }}>
            Settings
          </span>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            data-testid="settings-close"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--ink-3)',
              cursor: 'pointer',
              fontSize: 16,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <div
          style={{
            border: '1px solid #3a2a2a',
            borderRadius: 8,
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <span
            style={{
              fontSize: 9.5,
              color: '#ff8e64',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              fontWeight: 700,
            }}
          >
            Factory reset
          </span>
          <span style={{ fontSize: 10, color: 'var(--ink-3)', lineHeight: 1.5 }}>
            Deletes the current board — all tasks, habits, schedules, history and
            layout — and starts fresh from the default workspace. This cannot be
            undone.
          </span>
          <HoldButton
            testId="settings-factory-reset"
            label="Reset everything"
            holdingLabel="Hold to reset…"
            onConfirm={() => {
              void factoryReset();
              onClose();
            }}
            style={{ width: '100%' }}
          />
        </div>
      </div>
    </div>,
    document.body,
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
