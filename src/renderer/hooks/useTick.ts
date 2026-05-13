import { useState, useEffect } from 'react';

// Singleton 500ms interval shared across all consumers.
// Only one real setInterval runs regardless of how many components call useTick().

let _listeners = 0;
let _intervalId: ReturnType<typeof setInterval> | null = null;
let _tick = 0;
const _subs = new Set<(t: number) => void>();

function startInterval(): void {
  if (_intervalId !== null) return;
  _intervalId = setInterval(() => {
    _tick++;
    _subs.forEach((fn) => fn(_tick));
  }, 500);
}

function stopInterval(): void {
  if (_intervalId === null) return;
  clearInterval(_intervalId);
  _intervalId = null;
}

export function useTick(): number {
  const [tick, setTick] = useState(_tick);
  useEffect(() => {
    _listeners++;
    _subs.add(setTick);
    startInterval();
    return () => {
      _subs.delete(setTick);
      _listeners--;
      if (_listeners === 0) stopInterval();
    };
  }, []);
  return tick;
}
