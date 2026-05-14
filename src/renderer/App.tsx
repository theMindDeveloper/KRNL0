/**
 * App.tsx — root component.
 *
 * ReactFlowProvider wraps the entire tree so TopBar (fitView), StatusBar
 * (getViewport), and CanvasFlow (ReactFlow) all share one RF instance.
 *
 * Theme bootstrap: reads localStorage['krnl0-theme'] SYNCHRONOUSLY here at
 * module-scope so the correct data-theme attribute is on <html> before React's
 * first paint — satisfying NF4 / Gherkin F6b.
 */

import { useEffect, Component, type ReactNode } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { CanvasFlow as Canvas } from './components/Canvas/CanvasFlow';
import { Orb } from './components/Orb';
import { TopBar } from './components/TopBar';
import { StatusBar } from './components/StatusBar';
import { useBoardStore } from './store/boardStore';
import { useBoardChannel } from './store/useBoardChannel';
import { RadialChooserHost } from './components/ui/RadialChooser';    
import { useCliDispatch } from './store/useCliDispatch';

// ── Theme bootstrap (runs synchronously at module import, before first render) ─
// This is the only code path that satisfies "before first paint" for F6b.
(function bootstrapTheme() {
  try {
    const stored = localStorage.getItem('krnl0-theme');
    const theme = stored === 'light' || stored === 'dark' ? stored : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
  } catch {
    // localStorage unavailable (test environment without jsdom, etc.)
  }
})();

// ── Error boundary — catches render crashes and shows a recoverable message ──
interface EBState { error: Error | null }
class ErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error): EBState {
    return { error };
  }
  handleReset = () => {
    this.setState({ error: null });
    window.location.reload();
  };
  render() {
    if (this.state.error) {
      return (
        <div style={{
          width: '100vw', height: '100vh', display: 'flex',
          flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: 'var(--paper)', color: 'var(--ink)',
          fontFamily: 'var(--font-mono)', gap: 16, padding: 32,
        }}>
          <span style={{ color: 'var(--rust)', fontSize: 13, letterSpacing: '0.06em' }}>
            ■ KRNL0 — RENDER ERROR
          </span>
          <pre style={{
            fontSize: 11, color: 'var(--ink-3)', maxWidth: 600,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {this.state.error.message}
          </pre>
          <button
            type="button"
            onClick={this.handleReset}
            style={{
              background: 'var(--acid)', color: 'var(--paper)', border: 'none',
              borderRadius: 'var(--radius)', padding: '8px 20px',
              fontFamily: 'var(--font-mono)', fontSize: 11, cursor: 'pointer',
              letterSpacing: '0.04em', textTransform: 'uppercase',
            }}
          >
            RELOAD
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function App() {
  const setBoard = useBoardStore((s) => s.setBoard);
  useBoardChannel();
  useCliDispatch();

  useEffect(() => {
    // window.krnl?.boardLoad() returns undefined when krnl bridge is absent;
    // the extra ?. on .then() prevents "Cannot read properties of undefined"
    // from crashing the tree when running outside Electron or before preload fires.
    window.krnl?.boardLoad()?.then((data) => {
      if (data) setBoard(data as Parameters<typeof setBoard>[0]);
    }).catch((err: unknown) => {
      console.error('[krnl] boardLoad failed:', err);
    });
  }, [setBoard]);

  return (
    <ErrorBoundary>
      <ReactFlowProvider>
        <div
          style={{
            width: '100vw',
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
          }}
        >
          <TopBar />
          <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
            <Canvas />
            <Orb />
          </div>
          <StatusBar />
          <RadialChooserHost />
        </div>
      </ReactFlowProvider>
    </ErrorBoundary>
  );
}
