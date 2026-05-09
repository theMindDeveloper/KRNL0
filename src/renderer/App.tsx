import { Canvas } from './components/Canvas';
import { Orb } from './components/Orb';

export function App() {
  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative' }}>
      <Canvas />
      <Orb />
    </div>
  );
}
