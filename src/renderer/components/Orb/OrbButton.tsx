import { useEffect, useRef, useState } from 'react';
import { useOrbStore } from '../../store/useOrbStore';
import { OrbPanel } from './OrbPanel';

// State-to-color mapping for the orb visual
function orbFilter(state: string): string {
  switch (state) {
    case 'listening': return 'drop-shadow(0 0 28px rgba(201, 241, 88, 1)) drop-shadow(0 0 70px rgba(201, 241, 88, 0.6)) drop-shadow(0 8px 24px rgba(0, 0, 0, 0.5))';
    case 'thinking':  return 'drop-shadow(0 0 24px rgba(180, 140, 240, 0.9)) drop-shadow(0 0 60px rgba(180, 140, 240, 0.4)) drop-shadow(0 8px 24px rgba(0, 0, 0, 0.5))';
    case 'speaking':  return 'drop-shadow(0 0 18px rgba(201, 241, 88, 0.7)) drop-shadow(0 0 40px rgba(201, 241, 88, 0.25)) drop-shadow(0 8px 24px rgba(0, 0, 0, 0.5))';
    default:          return 'drop-shadow(0 0 18px rgba(201, 241, 88, 0.55)) drop-shadow(0 0 40px rgba(201, 241, 88, 0.25)) drop-shadow(0 8px 24px rgba(0, 0, 0, 0.5))';
  }
}

function swirlColor(state: string): string {
  switch (state) {
    case 'listening': return '#c9f158';
    case 'thinking':  return '#b48cf0';
    case 'speaking':  return '#e87a5f';
    default:          return '#c9f158';
  }
}

export function OrbButton() {
  const orbState = useOrbStore((s) => s.state);
  const panelOpen = useOrbStore((s) => s.panelOpen);
  const position = useOrbStore((s) => s.position);
  const togglePanel = useOrbStore((s) => s.togglePanel);
  const setOrbState = useOrbStore((s) => s.setState);
  const setPosition = useOrbStore((s) => s.setPosition);

  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const wrapRef = useRef<HTMLDivElement>(null);

  // Push-to-talk on Space — preserve existing behavior
  useEffect(() => {
    const isTypingTarget = (t: EventTarget | null): boolean => {
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || t.isContentEditable) return true;
      // xterm focuses a hidden helper textarea; if focus has fallen back to
      // body (timing race with RF), check the active element subtree too.
      const active = document.activeElement as HTMLElement | null;
      if (active?.closest('.term-body') || active?.closest('.xterm')) return true;
      return false;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.code === 'Space' && orbState === 'idle') {
        e.preventDefault();
        setOrbState('listening');
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.code === 'Space' && orbState === 'listening') {
        e.preventDefault();
        setOrbState('thinking');
        // TODO Week 5: call boundary.stopListening() → transcript → brain.ask() → tts.speak()
        setTimeout(() => setOrbState('idle'), 1500);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [orbState, setOrbState]);

  // Drag handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    const newX = e.clientX - dragOffset.current.x;
    const newY = e.clientY - dragOffset.current.y;
    // Clamp to viewport so the orb stays reachable
    const maxX = window.innerWidth - 64;
    const maxY = window.innerHeight - 64;
    setPosition({
      x: Math.max(0, Math.min(newX, maxX)),
      y: Math.max(0, Math.min(newY, maxY)),
    });
  };

  const handlePointerUp = () => {
    setDragging(false);
  };

  const showRings = orbState === 'listening' || orbState === 'speaking';
  const animation = orbState === 'idle' && !dragging ? 'ai-float 6s ease-in-out infinite' : 'none';
  const swirlAnim = orbState === 'thinking' ? 'ai-swirl 1.8s linear infinite' : 'ai-swirl 8s linear infinite';

  return (
    <div
      ref={wrapRef}
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        width: 64,
        height: 64,
        zIndex: 200,
        fontFamily: 'var(--font-mono)',
        cursor: dragging ? 'grabbing' : 'grab',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <style>{`
        @keyframes ai-float {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50%      { transform: translateY(-6px) rotate(2deg); }
        }
        @keyframes ai-swirl {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes ai-ring {
          0%   { transform: scale(0.6); opacity: 0.7; }
          100% { transform: scale(2.2); opacity: 0;   }
        }
      `}</style>

      {/* Pulse rings */}
      {showRings && (
        <>
          <div style={{ position: 'absolute', inset: 8, borderRadius: '50%', border: '1.5px solid rgba(201, 241, 88, 0.5)', pointerEvents: 'none', animation: 'ai-ring 1.6s ease-out infinite' }} />
          <div style={{ position: 'absolute', inset: 8, borderRadius: '50%', border: '1.5px solid rgba(201, 241, 88, 0.5)', pointerEvents: 'none', animation: 'ai-ring 1.6s ease-out infinite', animationDelay: '0.5s' }} />
          <div style={{ position: 'absolute', inset: 8, borderRadius: '50%', border: '1.5px solid rgba(201, 241, 88, 0.5)', pointerEvents: 'none', animation: 'ai-ring 1.6s ease-out infinite', animationDelay: '1.0s' }} />
        </>
      )}

      {/* Main orb sphere (SVG) */}
      <button
        type="button"
        onClick={togglePanel}
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          background: 'transparent',
          border: 0,
          padding: 0,
          cursor: dragging ? 'grabbing' : 'pointer',
          display: 'block',
          filter: orbFilter(orbState),
          animation,
          transition: 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
        aria-label={`AI assistant — ${orbState}. Press Space to talk.`}
        aria-live="polite"
      >
        <svg viewBox="0 0 80 80" style={{ width: '100%', height: '100%', display: 'block' }}>
          {/* Outer blob circle */}
          <circle cx="40" cy="40" r="36" fill={orbState === 'thinking' ? '#b48cf0' : '#c9f158'} opacity="0.15" />
          <circle cx="40" cy="40" r="30" fill={orbState === 'thinking' ? '#b48cf0' : '#c9f158'} opacity="0.12" />
          {/* Central blob */}
          <circle cx="40" cy="40" r="24" fill={orbState === 'thinking' ? '#b48cf0' : '#c9f158'} opacity="0.85" />
          {/* Swirl */}
          <g style={{ animation: swirlAnim, transformOrigin: '40px 40px' }}>
            <ellipse cx="40" cy="28" rx="10" ry="4" fill={swirlColor(orbState)} opacity="0.4" />
            <ellipse cx="52" cy="46" rx="8" ry="3" fill={swirlColor(orbState)} opacity="0.3" />
          </g>
          {/* Center dot */}
          <circle cx="40" cy="40" r="5" fill={panelOpen ? 'var(--ink)' : 'rgba(0,0,0,0.4)'} />
        </svg>
      </button>

      {/* Panel anchored near orb */}
      <OrbPanel />
    </div>
  );
}
