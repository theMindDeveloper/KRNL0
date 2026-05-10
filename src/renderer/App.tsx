import { useEffect } from 'react';
import { Canvas } from './components/Canvas';
import { Orb } from './components/Orb';
import { TopBar } from './components/TopBar';
import { StatusBar } from './components/StatusBar';
import { useBoardStore } from './store/boardStore';

export function App() {
  const setBoard = useBoardStore((s) => s.setBoard);

  useEffect(() => {
    window.krnl?.boardLoad().then((data) => {
      if (data) setBoard(data as Parameters<typeof setBoard>[0]);
    });
  }, [setBoard]);

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
        <Canvas />
        <Orb />
      </div>
      <StatusBar />
    </div>
  );
}
