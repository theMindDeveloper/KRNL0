import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import {
  installGlobalErrorCapture,
  installBoardSaveLogging,
} from './store/eventLog';
import './styles/tokens.css';
import './styles/reactflow-theme.css';
import '@xterm/xterm/css/xterm.css';

installGlobalErrorCapture();
installBoardSaveLogging();

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
