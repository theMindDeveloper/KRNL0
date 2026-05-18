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

import { useEffect, useRef, Component, type ReactNode } from 'react';
import { ReactFlowProvider, useReactFlow } from '@xyflow/react';
import { CanvasFlow as Canvas } from './components/Canvas/CanvasFlow';
import { StationLayout } from './components/Station/StationLayout';
import { useStationViewportGate } from './components/Station/useStationViewportGate';
import { Orb } from './components/Orb';
import { AmbientRadio } from './components/AmbientRadio';
import { TopBar } from './components/TopBar';
import { StatusBar } from './components/StatusBar';
import { useBoardStore } from './store/boardStore';
import { useBoardChannel } from './store/useBoardChannel';
import { RadialChooserHost } from './components/ui/RadialChooser';
import { useCliDispatch } from './store/useCliDispatch';
import { sfxEngine } from './sfx/sfxEngine';

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
              background: 'var(--acid)', color: '#0a0908', border: 'none',
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

// ── AppInner — mounts inside ReactFlowProvider so useStationViewportGate ──
// can safely read boardStore after board is loaded.
function AppInner() {
  const { effectiveMode, isFallingBack } = useStationViewportGate();
  const { fitView } = useReactFlow();

  // Centre the viewport on the mother row whenever the layout mode changes,
  // and on first mount once nodes exist. RF remounts on toggle (ADR § 9.3
  // strategy A), so this fires after the new tree's RF instance is ready.
  // Delay one rAF + a short tick so the new RF wrapper has measured its
  // container before fitView reads its dimensions.
  const lastModeRef = useRef<string | null>(null);
  useEffect(() => {
    if (lastModeRef.current === effectiveMode) return;
    lastModeRef.current = effectiveMode;
    const id = window.setTimeout(() => {
      try {
        fitView({ padding: 0.18, duration: 400 });
      } catch {
        /* RF not ready yet — skipped */
      }
    }, 120);
    return () => window.clearTimeout(id);
  }, [effectiveMode, fitView]);

  return (
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
        {/* ADR 0008 § 9.3 strategy A — one remount on toggle, same provider. */}
        {effectiveMode === 'station' ? <StationLayout /> : <Canvas />}
        {/* Orb (AI bubble) is available in both modes — tutorials and chat
            work the same. ScriptRunner gates camera moves so station mode
            doesn't yank the embedded canvas around. */}
        <Orb />
        <AmbientRadio />
      </div>
      <StatusBar fallbackNotice={isFallingBack} />
      <RadialChooserHost />
    </div>
  );
}

export function App() {
  const setBoard = useBoardStore((s) => s.setBoard);
  useBoardChannel();
  useCliDispatch();

  useEffect(() => {
    sfxEngine.play('krnl0startup').catch(() => {/* autoplay blocked is fine */});
  }, []);

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
        <AppInner />
      </ReactFlowProvider>
    </ErrorBoundary>
  );
}
