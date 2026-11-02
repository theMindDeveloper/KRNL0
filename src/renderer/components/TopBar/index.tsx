/**
 * TopBar — 44px chrome bar rendered via RF <Panel position="top-center">.
 * Requirements F1 (brand, breadcrumb, live badge) + F2 (FIT, theme, TWEAKS, SHARE).
 *
 * FIT calls useReactFlow().fitView({ padding: 0.2, duration: 300 }).
 * Theme toggle writes data-theme on <html> and persists to localStorage.
 */

import { useState, useLayoutEffect } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { useReactFlow } from '@xyflow/react';
import { LayoutModeToggle } from '../ui/LayoutModeToggle';
import { useDockStyle, DOCK_STYLES, type DockStyle } from '../ChassisLayer/useDockStyle';
import { isDarkOnly } from '../ChassisLayer/dockRegistry';
import { StationToolbar } from '../Station/StationToolbar';
import { MANIFESTS } from '../../themes/manifests';
import { runLookTransition } from '../../themes/transition';
import { HoldButton } from '../ui/HoldButton';
import { useEasyMode } from '../../store/uiMode';
import { useBoardStore } from '../../store/boardStore';
import { BrandMark } from './BrandMark';
import { CanvasSwitcher } from './CanvasSwitcher';

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

const FRAME_BEFORE_LIGHT_KEY = 'krnl0-dock-style-before-light';

function readFrameBeforeLight(): DockStyle | null {
  try {
    const v = localStorage.getItem(FRAME_BEFORE_LIGHT_KEY);
    return v && (DOCK_STYLES as readonly string[]).includes(v) ? (v as DockStyle) : null;
  } catch { return null; }
}

function writeFrameBeforeLight(style: DockStyle | null): void {
  try {
    if (style) localStorage.setItem(FRAME_BEFORE_LIGHT_KEY, style);
    else localStorage.removeItem(FRAME_BEFORE_LIGHT_KEY);
  } catch { /* storage unavailable */ }
}

export function TopBar() {
  const [theme, setTheme] = useState<Theme>(readStoredTheme);
  const [dockStyle, setDockStyle] = useDockStyle();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const rf = useReactFlow();

  // Some dock skins declare themselves dark-only (see dockRegistry.theme).
  // Hide the theme toggle while one is selected and force the global theme
  // to dark for visual consistency.
  //
  // The user's choice (`theme`) is kept apart from what is shown: a dark-only
  // style shows dark without overwriting the saved preference, so switching
  // back to Classic restores light mode instead of leaving the user stuck.
  const darkOnly = isDarkOnly(dockStyle);
  const isStationLayout = useBoardStore((s) => s.board?.layoutMode === 'station');
  const shownTheme: Theme = darkOnly ? 'dark' : theme;

  // Layout effect, so a style switch inside a View Transition paints the
  // right mode in the same frame (see themes/transition.ts).
  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-theme', shownTheme);
  }, [shownTheme]);

  // Light/dark is always available. A dark-only frame style has no light
  // tokens, so choosing Light switches to Classic (which has both) — and
  // remembers the frame, so going back to Dark restores it (unless another
  // frame was picked in the meantime).
  const chooseTheme = (next: Theme) => {
    runLookTransition(() => {
      if (next === 'light' && isDarkOnly(dockStyle)) {
        writeFrameBeforeLight(dockStyle);
        setDockStyle('classic');
      } else if (next === 'dark') {
        const before = readFrameBeforeLight();
        writeFrameBeforeLight(null);
        if (before && dockStyle === 'classic') setDockStyle(before);
      }
      applyTheme(next);
      flushSync(() => setTheme(next));
    });
  };
  const handleThemeToggle = () => chooseTheme(shownTheme === 'dark' ? 'light' : 'dark');

  const handleFit = () => {
    rf.fitView({ padding: 0.2, duration: 300 });
  };

  const themeLabel = shownTheme === 'dark' ? '☾ DARK' : '☀ LIGHT';

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
        {/* Brand mark — the "Lit Core" app icon (build/icon.svg): a dark 3×3
            voxel cube on a near-black tile, centre voxel lit acid on each
            face. The tile is dark in every theme so the mark matches the
            dock / taskbar icon. KRNL0 wordmark keeps its dimmed "0". */}
        <span
          data-testid="topbar-brand"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            userSelect: 'none',
          }}
        >
          <BrandMark />
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
          ∷ ~/krnl0 / canvas /
        </span>
        {/* Decision 33 — canvas switcher (the breadcrumb's last segment). */}
        <CanvasSwitcher />

        {/* Live badge */}
        <span
          data-testid="topbar-live-badge"
          className="krnl-live-badge"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--acid-ink, var(--acid))',
            letterSpacing: '0.04em',
            userSelect: 'none',
          }}
        >
          ◆ live
        </span>
      </div>

      {/* Centre: panel toggles (ADR 0009 F9) — in Station AND Canvas mode; a
          hidden mother disappears and the rest close the gap. */}
      {MANIFESTS[dockStyle].slots.panelToggles === 'topbar' && (
        <div data-testid="topbar-panel-toggles" style={{ display: 'flex', alignItems: 'center', WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <StationToolbar variant="inline" />
        </div>
      )}

      {/* Right: action buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <LayoutModeToggle />
        <TopBarButton label="FIT" onClick={handleFit} testId="topbar-fit" />
        <TopBarButton label={themeLabel} onClick={handleThemeToggle} testId="topbar-theme-toggle" />
        <TopBarButton label="⚙" onClick={() => setSettingsOpen(true)} testId="topbar-settings" />
      </div>

      {settingsOpen && (
        <SettingsModal theme={shownTheme} onTheme={chooseTheme} onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  );
}

// ── Program settings modal (factory reset) ──────────────────────────────────

function SettingsModal({ onClose, theme, onTheme }: { onClose: () => void; theme: Theme; onTheme: (t: Theme) => void }) {
  const factoryReset = useBoardStore((s) => s.factoryReset);
  const setUiMode = useBoardStore((s) => s.setUiMode);
  const easy = useEasyMode();
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

        {/* Appearance — first, so the reset below is never the only thing here. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          <span style={{ fontSize: 9.5, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>
            Appearance
          </span>
          <div role="radiogroup" aria-label="Light or dark" style={{ display: 'flex', gap: 6 }}>
            {(['light', 'dark'] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={theme === t}
                data-testid={`settings-theme-${t}`}
                onClick={() => onTheme(t)}
                style={{
                  flex: 1, padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                  fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase',
                  border: `1px solid ${theme === t ? 'var(--acid)' : 'var(--paper-3)'}`,
                  background: theme === t ? 'color-mix(in srgb, var(--acid) 16%, transparent)' : 'transparent',
                  color: 'var(--ink)',
                }}
              >
                {t === 'light' ? '☀ Light' : '☾ Dark'}
              </button>
            ))}
          </div>
        </div>

        {/* Easy / Advanced — Easy hides the links between features; data is the same. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          <span style={{ fontSize: 9.5, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>
            Mode
          </span>
          <div role="radiogroup" aria-label="Easy or Advanced" style={{ display: 'flex', gap: 6 }}>
            {([
              ['easy', 'Easy', 'Plan your day and see where the time went'],
              ['advanced', 'Advanced', 'Connect tasks, categories and focus'],
            ] as const).map(([m, label, hint]) => {
              const on = (m === 'easy') === easy;
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  data-testid={`settings-mode-${m}`}
                  onClick={() => setUiMode(m)}
                  style={{
                    flex: 1, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                    fontFamily: 'var(--font-mono)', color: 'var(--ink)',
                    border: `1px solid ${on ? 'var(--acid)' : 'var(--paper-3)'}`,
                    background: on ? 'color-mix(in srgb, var(--acid) 16%, transparent)' : 'transparent',
                  }}
                >
                  <div style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 700 }}>{label}</div>
                  <div style={{ fontSize: 9.5, color: 'var(--ink-3)', marginTop: 3, lineHeight: 1.4 }}>{hint}</div>
                </button>
              );
            })}
          </div>
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
      className="krnl-topbar-btn"
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
