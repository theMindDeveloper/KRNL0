import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import {
  installGlobalErrorCapture,
  installBoardSaveLogging,
} from './store/eventLog';
import './styles/tokens.css';
import './styles/reactflow-theme.css';
import './styles/chassis.css';
import '@xterm/xterm/css/xterm.css';
import { installDockThemes } from './styles/dock-themes';
import { installFrameBudget } from './utils/frameBudget';

installGlobalErrorCapture();
installBoardSaveLogging();
// Dock skins (canvas + chrome + nodes) ship as TS modules via the modular
// defineDockTheme() pipeline. Inject before React renders so the canvas
// paints themed on first frame, not on rehydration.
installDockThemes();
// Decorative infinite animations update ~30x/s instead of at the monitor
// refresh rate — keeps every animation, cuts idle CPU ~5x (issue #197).
installFrameBudget();

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

function render(el: HTMLElement): void {
  createRoot(el).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

// Browser preview (no Electron preload): install a fake bridge with a fixture
// board. DEV-only — the branch and the import are dropped from prod builds.
if (import.meta.env.DEV && !window.krnl) {
  void Promise.all([import('./dev/previewBridge'), import('./dev/SoloPreview')]).then(([m, solo]) => {
    m.installPreviewBridge();
    const soloKind = new URLSearchParams(location.search).get('solo');
    if (soloKind) {
      createRoot(root).render(<solo.SoloPreview kind={soloKind} />);
    } else {
      render(root);
    }
  });
} else {
  render(root);
}
