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

import { useEffect, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { CanvasFlow as Canvas } from './components/Canvas/CanvasFlow';
import { Orb } from './components/Orb';
import { TopBar } from './components/TopBar';
import { StatusBar } from './components/StatusBar';
import { Tweaks } from './components/Tweaks';
import { useBoardStore } from './store/boardStore';

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

export function App() {
  const setBoard = useBoardStore((s) => s.setBoard);
  const [tweaksOpen, setTweaksOpen] = useState(false);

  useEffect(() => {
    window.krnl?.boardLoad().then((data) => {
      if (data) setBoard(data as Parameters<typeof setBoard>[0]);
    });
  }, [setBoard]);

  return (
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
        <TopBar onTweaksToggle={() => setTweaksOpen((o) => !o)} />
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          <Canvas />
          <Orb />
          <Tweaks open={tweaksOpen} onClose={() => setTweaksOpen(false)} />
        </div>
        <StatusBar />
      </div>
    </ReactFlowProvider>
  );
}
