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

installGlobalErrorCapture();
installBoardSaveLogging();
// Dock skins (canvas + chrome + nodes) ship as TS modules via the modular
// defineDockTheme() pipeline. Inject before React renders so the canvas
// paints themed on first frame, not on rehydration.
installDockThemes();

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
