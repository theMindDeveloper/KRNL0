/**
 * TopBar — 44px chrome bar rendered via RF <Panel position="top-center">.
 * Requirements F1 (brand, breadcrumb, live badge) + F2 (FIT, theme, TWEAKS, SHARE).
 *
 * FIT calls useReactFlow().fitView({ padding: 0.2, duration: 300 }).
 * Theme toggle writes data-theme on <html> and persists to localStorage.
 */

import { useEasyMode } from '../../store/uiMode';
import { CANVAS_FIT_PADDING } from '../Canvas/fitPadding';
import { SettingsIcon } from '../ui/SettingsIcons';
import { useState, useEffect, useLayoutEffect } from 'react';
import { flushSync } from 'react-dom';
import { useReactFlow } from '@xyflow/react';
import { LayoutModeToggle } from '../ui/LayoutModeToggle';
import { useDockStyle, DOCK_STYLES, type DockStyle } from '../ChassisLayer/useDockStyle';
import { isDarkOnly } from '../ChassisLayer/dockRegistry';
import { StationToolbar } from '../Station/StationToolbar';
import { MANIFESTS } from '../../themes/manifests';
import { runLookTransition } from '../../themes/transition';
import { useBoardStore } from '../../store/boardStore';
import { BrandMark } from './BrandMark';
import { CanvasSwitcher } from './CanvasSwitcher';
import { Z } from '../ui/layers';
import { SettingsModal, type SettingsSection } from './SettingsModal';
import { HelpMenu } from '../Launch/HelpMenu';

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
  const easyMode = useEasyMode();
  const [theme, setTheme] = useState<Theme>(readStoredTheme);
  const [dockStyle, setDockStyle] = useDockStyle();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('general');
  const rf = useReactFlow();
  // Help › Check for updates and What's new › Show me open Settings.
  useEffect(() => {
    const open = (e: Event): void => {
      const section = (e as CustomEvent<{ section?: SettingsSection }>).detail?.section;
      setSettingsSection(section ?? 'general');
      setSettingsOpen(true);
    };
    window.addEventListener('krnl:open-settings', open);
    return () => window.removeEventListener('krnl:open-settings', open);
  }, []);

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
    rf.fitView({ padding: CANVAS_FIT_PADDING, duration: 300 });
  };

  const themeLabel = <><SettingsIcon name={shownTheme === 'dark' ? 'moon' : 'sun'} size={12} />{shownTheme === 'dark' ? 'DARK' : 'LIGHT'}</>;

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
        zIndex: Z.chrome,
        boxSizing: 'border-box',
        WebkitAppRegion: 'drag',
      } as React.CSSProperties}
    >
      {/* Left: brand + breadcrumb + live badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
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
          className="krnl-breadcrumb"
          title="Your canvases — switch or add one with the menu next to it"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--ink-3)',
            letterSpacing: '0.03em',
            userSelect: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          ~/krnl0 / canvas /
        </span>
        {/* Decision 33 — canvas switcher (the breadcrumb's last segment).
            easy-mode D24: one canvas in Easy. */}
        {!easyMode && <CanvasSwitcher />}

        {/* Live badge */}
        {/* New-user review 1.7: a static "live" said nothing; this says what a
            new user wants to know — nothing to save by hand. */}
        <span
          data-testid="topbar-live-badge"
          className="krnl-live-badge"
          title="Your board saves itself as you go — there is nothing to save by hand."
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--acid-ink, var(--acid))',
            letterSpacing: '0.04em',
            userSelect: 'none',
            whiteSpace: 'nowrap',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            marginRight: 10,
          }}
        >
          <span aria-hidden style={{ width: 6, height: 6, borderRadius: 999, background: 'currentColor' }} />
          saved
        </span>
      </div>

      {/* Centre: panel toggles (ADR 0009 F9) — in Station AND Canvas mode; a
          hidden mother disappears and the rest close the gap. */}
      {MANIFESTS[dockStyle].slots.panelToggles === 'topbar' && (
        <div data-testid="topbar-panel-toggles" style={{ display: 'flex', alignItems: 'center' }}>
          <StationToolbar variant="inline" />
        </div>
      )}

      {/* Right: action buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <LayoutModeToggle />
        <TopBarButton label="FIT" onClick={handleFit} testId="topbar-fit" />
        <TopBarButton label={themeLabel} onClick={handleThemeToggle} testId="topbar-theme-toggle" />
        <HelpMenu />
        <TopBarButton label={<SettingsIcon name="settings" size={13} />} title="Settings" onClick={() => { setSettingsSection('general'); setSettingsOpen(true); }} testId="topbar-settings" />
      </div>

      {settingsOpen && (
        <SettingsModal theme={shownTheme} onTheme={chooseTheme} initial={settingsSection} onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  );
}

interface TopBarButtonProps {
  label: React.ReactNode;
  title?: string;
  onClick: () => void;
  testId?: string;
}

function TopBarButton({ label, title, onClick, testId }: TopBarButtonProps) {
  return (
    <button
      type="button"
      data-testid={testId}
      title={title}
      aria-label={title}
      className="krnl-topbar-btn"
      onClick={onClick}
      style={{
        background: 'transparent',
        border: '1px solid var(--paper-3)',
        borderRadius: 'var(--radius)',
        padding: '4px 10px',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
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
