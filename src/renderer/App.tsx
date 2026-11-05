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

import { useEffect, useRef, useState, Component, type ReactNode } from 'react';
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
import { LogTimeHost, RetagPickerHost } from './components/ui/SpanEditor';
import { TourHost } from './components/Tour/TourHost';
import { useCliDispatch } from './store/useCliDispatch';
import { installTimeLogWriter } from './store/timeLog';
import { UndoNoticeBar } from './components/ui/UndoNoticeBar';
import { UpdateNoticeBar } from './components/ui/UpdateNoticeBar';
import { useUpdateBridge } from './store/updateStore';

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
              background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-fg)', border: 'none',
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
        // maxZoom: 1 keeps fitView from over-zooming when the visible set is
        // small (e.g. a single task node). Matches seedBoard's default zoom.
        fitView({ padding: 0.18, duration: 400, maxZoom: 1 });
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
      <LogTimeHost />
      <RetagPickerHost />
      <TourHost />
      <UndoNoticeBar />
      <UpdateNoticeBar />
    </div>
  );
}

// Shown when board.json exists but can't be read (locked by antivirus / a
// sync client, or unreadable and impossible to back up). Main refuses to hand
// back a seed in that case, so nothing is overwritten while this is up.
function BoardLoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" data-testid="board-load-error" style={{
      width: '100vw', height: '100vh', display: 'flex',
      flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: 'var(--paper)', color: 'var(--ink)',
      fontFamily: 'var(--font-mono)', gap: 14, padding: 32, textAlign: 'center',
    }}>
      <span style={{ color: 'var(--rust)', fontSize: 13, letterSpacing: '0.06em' }}>
        ■ KRNL0 — BOARD NOT LOADED
      </span>
      <span style={{ fontSize: 12, color: 'var(--ink-2)', maxWidth: 520, lineHeight: 1.5 }}>
        Your board file couldn&apos;t be read, so nothing was changed. Close any program that may be
        holding it (a sync client or antivirus scan), then try again.
      </span>
      <pre style={{ fontSize: 11, color: 'var(--ink-3)', maxWidth: 600, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {message}
      </pre>
      <button
        type="button"
        onClick={onRetry}
        style={{
          background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-fg)', border: 'none',
          borderRadius: 'var(--radius)', padding: '8px 20px',
          fontFamily: 'var(--font-mono)', fontSize: 11, cursor: 'pointer',
          letterSpacing: '0.04em', textTransform: 'uppercase',
        }}
      >
        TRY AGAIN
      </button>
    </div>
  );
}

export function App() {
  const setBoard = useBoardStore((s) => s.setBoard);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useBoardChannel();
  useCliDispatch();
  useUpdateBridge();
  // Decision 35 — log every board change of this window to the time log.
  useEffect(() => installTimeLogWriter(), []);

  useEffect(() => {
    // window.krnl?.boardLoad() returns undefined when krnl bridge is absent;
    // the extra ?. on .then() prevents "Cannot read properties of undefined"
    // from crashing the tree when running outside Electron or before preload fires.
    window.krnl?.boardLoad()?.then((data) => {
      setLoadError(null);
      if (data) setBoard(data as Parameters<typeof setBoard>[0]);
    }).catch((err: unknown) => {
      console.error('[krnl] boardLoad failed:', err);
      // Electron prefixes IPC rejections with "Error invoking remote method …".
      const msg = err instanceof Error ? err.message : String(err);
      setLoadError(msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
    });
  }, [setBoard, attempt]);

  if (loadError !== null) {
    return <BoardLoadError message={loadError} onRetry={() => setAttempt((n) => n + 1)} />;
  }

  return (
    <ErrorBoundary>
      <ReactFlowProvider>
        <AppInner />
      </ReactFlowProvider>
    </ErrorBoundary>
  );
}
