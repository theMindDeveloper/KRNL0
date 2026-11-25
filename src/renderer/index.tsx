import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { PocketApp } from './pocket/PocketApp';
import {
  installGlobalErrorCapture,
  installBoardSaveLogging,
} from './store/eventLog';
import './styles/tokens.css';
import './styles/reactflow-theme.css';
import './styles/chassis.css';
import './styles/window-frame.css';
import './styles/launch.css';
import '@xterm/xterm/css/xterm.css';
import { installDockThemes } from './styles/dock-themes';
import { accentTokens, installAccentSync, loadAccent, onAccentChange } from './themes/accent';
import { installTaskColors } from './store/taskColors';
import { installFrameBudget } from './utils/frameBudget';

// Decision 37 — the pocket timer window loads this bundle with ?pocket=1. It is
// a view of the Pomo node: it must not load, save or log the board, so it skips
// every board-facing installer and mounts PocketApp instead of App.
const isPocket = new URLSearchParams(location.search).get('pocket') === '1';

installGlobalErrorCapture();
if (!isPocket) installBoardSaveLogging();
// Dock skins (canvas + chrome + nodes) ship as TS modules via the modular
// defineDockTheme() pipeline. Inject before React renders so the canvas
// paints themed on first frame, not on rehydration.
installDockThemes();
// The accent colour (Settings → Appearance): the main window writes it with the
// frame style (applyFrameTheme); the floating timer has no style, so it writes
// it here. Either window follows a change made in the other.
installAccentSync();
if (isPocket) {
  const applyPocketAccent = (): void => {
    const el = document.documentElement;
    const mode = el.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    const acc = loadAccent();
    for (const k of ['--acid', '--acid-glow', '--acid-faint', '--acid-ink', '--accent-on-dark', '--term-acid', '--btn-primary-ring', '--btn-primary-bg', '--btn-primary-bg-hover', '--btn-primary-fg']) el.style.removeProperty(k);
    if (acc) for (const [k, v] of Object.entries(accentTokens(acc, mode))) el.style.setProperty(k, v);
  };
  applyPocketAccent();
  onAccentChange(applyPocketAccent);
}
if (!isPocket) {
  // #207 — every current task gets its own colour (kept in step with the board).
  installTaskColors();
  // Decorative infinite animations update ~30x/s instead of at the monitor
  // refresh rate — keeps every animation, cuts idle CPU ~5x (issue #197).
  installFrameBudget();
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

function render(el: HTMLElement): void {
  // UI rule guard: warns in the console when a control's text wraps or spills.
  if (import.meta.env.DEV) void import('./dev/overflowGuard').then((m) => m.startOverflowGuard());
  createRoot(el).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

if (isPocket) {
  // The pocket never shows the startup splash (index.html removes it too).
  document.getElementById('boot-splash')?.remove();
  // Transparent from the first frame (the window has no background of its own).
  document.documentElement.classList.add('krnl-pocket');
  createRoot(root).render(
    <StrictMode>
      <PocketApp />
    </StrictMode>
  );
// Browser preview (no Electron preload): install a fake bridge with a fixture
// board. DEV-only — the branch and the import are dropped from prod builds.
} else if (import.meta.env.DEV && !window.krnl) {
  void Promise.all([import('./dev/previewBridge'), import('./dev/SoloPreview')]).then(([m, solo]) => {
    m.installPreviewBridge();
    const soloKind = new URLSearchParams(location.search).get('solo');
    if (soloKind) {
      // The single-node preview never mounts App, which removes the splash.
      document.getElementById('boot-splash')?.remove();
      createRoot(root).render(<solo.SoloPreview kind={soloKind} />);
    } else {
      render(root);
    }
  });
} else {
  render(root);
}
