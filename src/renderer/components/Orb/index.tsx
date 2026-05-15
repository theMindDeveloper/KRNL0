/**
 * Orb — viewport-fixed AI assistant orb (PR9, LifeOS UI refresh).
 *
 * Visual: SVG ball with a radial gradient (white -> acid -> deep green ->
 * near-black), a single drop-shadow glow on the host button, an internal
 * swirl band that rotates independently of the bob, and a small specular
 * highlight at the top-left. Listening overlays three pulse rings with
 * staggered animation-delay (the "sonar" effect). Thinking shifts the
 * glow toward purple.
 *
 * Behaviour:
 * - Space (push-to-talk) preserves the previous FSM (idle -> listening on
 *   keydown; listening -> thinking on keyup). Stub — real brain bridge is
 *   the boundary integration in a later phase.
 * - Click toggles a chat panel anchored above the orb. The panel runs a
 *   *mock* submit — local useState only, no IPC, no store touch. Use it
 *   to design-review the chrome; replace mockReply() with the real call
 *   when the brain wire lands.
 * - Esc closes the panel.
 * - Orb is draggable. Position is persisted to localStorage. On drag-end a
 *   spring-bounce settle animation plays via key bump on the root div.
 *   Click is distinguished from drag by mouse delta threshold (< 4px = click).
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type FormEvent,
  type CSSProperties,
} from 'react';

type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking';
interface ChatMsg { role: 'user' | 'ai'; text: string }

// Stub responses — short, present-tense, no markdown. Replace once the
// real brain bridge is wired; the shape (string in, string out) matches.
const MOCK_REPLIES: readonly string[] = [
  "noted — i'll surface that when the next pomo wraps.",
  "focus on the cyan-edged chain first; cleanest tracer through.",
  "want me to schedule a 25-min block at 14:00?",
  "three habits remain undone today. start with the morning pages.",
  "this assistant is a stub — the brain bridge lands later.",
  "the spine looks light today; one or two anchors is plenty.",
];

function mockReply(): string {
  const i = Math.floor(Math.random() * MOCK_REPLIES.length);
  return MOCK_REPLIES[i] ?? MOCK_REPLIES[0]!;
}

// ── Orb position helpers ──────────────────────────────────────────────────────
const ORB_SIZE = 64;
const ORB_MARGIN = 12;
const STORAGE_KEY = 'krnl0-orb-pos';

interface OrbPos { x: number; y: number }

function defaultPos(): OrbPos {
  return {
    x: 22,
    y: window.innerHeight - ORB_SIZE - 56,
  };
}

function clampPos(pos: OrbPos): OrbPos {
  return {
    x: Math.max(ORB_MARGIN, Math.min(window.innerWidth - ORB_SIZE - ORB_MARGIN, pos.x)),
    y: Math.max(ORB_MARGIN, Math.min(window.innerHeight - ORB_SIZE - ORB_MARGIN, pos.y)),
  };
}

function loadPos(): OrbPos {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'x' in parsed &&
        'y' in parsed &&
        typeof (parsed as { x: unknown }).x === 'number' &&
        typeof (parsed as { y: unknown }).y === 'number'
      ) {
        return clampPos({ x: (parsed as OrbPos).x, y: (parsed as OrbPos).y });
      }
    }
  } catch {
    // corrupted storage — fall through to default
  }
  return defaultPos();
}

function savePos(pos: OrbPos): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pos));
  } catch {
    // ignore quota errors
  }
}

export function Orb() {
  const [orbState, setOrbState] = useState<OrbState>('idle');
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // ── Drag state ────────────────────────────────────────────────────────────
  const [pos, setPos] = useState<OrbPos>(loadPos);
  // Key bumped on drag-end to replay the orb-drop-settle keyframe.
  const [settleKey, setSettleKey] = useState(0);
  const draggingRef = useRef(false);
  const dragMovedRef = useRef(false);
  const dragOffsetRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Clamp position when the window resizes (orb may drift off-screen).
  useEffect(() => {
    const onResize = () => {
      setPos((p) => {
        const clamped = clampPos(p);
        savePos(clamped);
        return clamped;
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    // Only primary button starts a drag.
    if (e.button !== 0) return;
    // Don't prevent default here — onClick still needs to fire for clicks.
    draggingRef.current = true;
    dragMovedRef.current = false;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    // Offset from orb top-left to mouse pointer.
    dragOffsetRef.current = {
      dx: e.clientX - pos.x,
      dy: e.clientY - pos.y,
    };

    const onMouseMove = (ev: MouseEvent) => {
      if (!draggingRef.current) return;
      const absDx = Math.abs(ev.clientX - dragStartRef.current.x);
      const absDy = Math.abs(ev.clientY - dragStartRef.current.y);
      if (absDx + absDy >= 4) {
        dragMovedRef.current = true;
      }
      const newPos = clampPos({
        x: ev.clientX - dragOffsetRef.current.dx,
        y: ev.clientY - dragOffsetRef.current.dy,
      });
      setPos(newPos);
    };

    const onMouseUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);

      if (dragMovedRef.current) {
        // Save final position and trigger spring-settle animation.
        setPos((p) => {
          savePos(p);
          return p;
        });
        setSettleKey((k) => k + 1);
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [pos.x, pos.y]);

  const onOrbClick = useCallback(() => {
    // If the mouse moved enough during mousedown→mouseup, this was a drag, not a click.
    if (dragMovedRef.current) {
      dragMovedRef.current = false;
      return;
    }
    setOpen((o) => !o);
  }, []);

  // Push-to-talk on Space — never intercept when the user is typing.
  useEffect(() => {
    const isTypingTarget = (t: EventTarget | null): boolean => {
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || t.isContentEditable) return true;
      // xterm.js focuses a hidden helper textarea; if focus falls back to
      // the body (timing race with RF), check the active element too.
      const active = document.activeElement as HTMLElement | null;
      if (active?.closest('.term-body') || active?.closest('.xterm')) return true;
      return false;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape' && open) {
        setOpen(false);
        return;
      }
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
        // Stub: real path would be boundary.stopListening() -> brain.ask().
        // For PR9 we just bounce back to idle after a short delay so the
        // visual states are exercised.
        window.setTimeout(() => setOrbState('idle'), 600);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [orbState, open]);

  // Focus the chat input when the panel opens.
  useEffect(() => {
    if (open) {
      const id = window.setTimeout(() => inputRef.current?.focus(), 50);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [open]);

  // Auto-scroll the chat history to the latest message.
  const historyRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = historyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [history.length, thinking]);

  const submitMock = (text: string) => {
    setHistory((h) => [...h, { role: 'user', text }]);
    setInput('');
    setThinking(true);
    const delay = 500 + Math.random() * 700;
    window.setTimeout(() => {
      setHistory((h) => [...h, { role: 'ai', text: mockReply() }]);
      setThinking(false);
    }, delay);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (text && !thinking) submitMock(text);
  };

  // ── Visual state ─────────────────────────────────────────────────────────
  // Single drop-shadow per state — triple-stacked filters were forcing their
  // own composited GPU layer on every frame.
  const isPurple = orbState === 'thinking' || thinking;
  const isHot = orbState === 'listening';
  const glowFilter = isHot
    ? 'drop-shadow(0 0 28px rgba(201,241,88,0.95))'
    : isPurple
      ? 'drop-shadow(0 0 26px rgba(180,140,240,0.85))'
      : 'drop-shadow(0 0 22px rgba(201,241,88,0.45))';

  const showRings = isHot;

  const orbButtonStyle: CSSProperties = {
    position: 'relative',
    width: 64,
    height: 64,
    border: 0,
    padding: 0,
    background: 'transparent',
    cursor: draggingRef.current ? 'grabbing' : 'pointer',
    display: 'block',
    filter: glowFilter,
    // ai-float paused when chat panel is open — reduces constant repaint
    // while the user is typing/reading.
    animation: open ? 'none' : 'ai-float 6s ease-in-out infinite',
    transition: 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), filter 0.25s ease',
  };

  return (
    // Root div carries the orb-drop-settle keyframe via key bump on settleKey.
    // Using `top`/`left` for position (not bottom) so position state maps
    // cleanly to viewport coords with no flip arithmetic.
    <div
      key={settleKey}
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        zIndex: 200,
        fontFamily: 'var(--font-mono)',
        animation: settleKey > 0 ? 'orb-drop-settle 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)' : 'none',
      }}
    >
      {/* Chat panel — anchored above the orb, slides in via ai-panel-in. */}
      {open && (
        <div
          data-testid="orb-chat-panel"
          style={{
            position: 'absolute',
            left: 0,
            bottom: 80,
            width: 340,
            maxHeight: 480,
            background: 'rgba(14, 13, 11, 0.94)',
            backdropFilter: 'blur(18px) saturate(140%)',
            border: '1px solid rgba(201, 241, 88, 0.22)',
            borderRadius: 14,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: [
              '0 0 0 1px rgba(201, 241, 88, 0.08)',
              '0 20px 60px rgba(0, 0, 0, 0.6)',
              '0 0 80px rgba(201, 241, 88, 0.15)',
            ].join(', '),
            animation: 'ai-panel-in 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}
        >
          {/* Panel header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              borderBottom: '1px solid rgba(201, 241, 88, 0.15)',
              fontSize: 10.5,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--ink-3)',
            }}
          >
            <span data-testid="orb-chat-title">
              <span
                style={{
                  color: 'var(--acid)',
                  marginRight: 8,
                  textShadow: '0 0 8px var(--acid-glow)',
                }}
              >
                ◆
              </span>
              krnl0 · assistant
            </span>
            <button
              type="button"
              data-testid="orb-chat-close"
              onClick={() => setOpen(false)}
              style={{
                background: 'transparent',
                border: 0,
                color: 'var(--ink-3)',
                cursor: 'pointer',
                fontSize: 16,
                lineHeight: 1,
                padding: 0,
                width: 20,
                height: 20,
              }}
              aria-label="Close assistant"
            >
              ×
            </button>
          </div>

          {/* History — scrollable */}
          <div
            ref={historyRef}
            data-testid="orb-chat-history"
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              fontSize: 12.5,
              color: '#d4cfc0',
              minHeight: 80,
              maxHeight: 340,
              lineHeight: 1.5,
            }}
          >
            {history.length === 0 && !thinking && (
              <div style={{ color: '#8a8270' }}>
                <div style={{ marginBottom: 8 }}>how can i help?</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {[
                    'what should i work on next',
                    'summarize my board',
                    'start a focus session',
                  ].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => submitMock(s)}
                      style={{
                        textAlign: 'left',
                        background: 'rgba(201, 241, 88, 0.06)',
                        border: '1px solid rgba(201, 241, 88, 0.15)',
                        color: '#d4cfc0',
                        padding: '5px 8px',
                        borderRadius: 4,
                        fontFamily: 'inherit',
                        fontSize: 11.5,
                        cursor: 'pointer',
                      }}
                    >
                      {`> ${s}`}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {history.map((m, i) => (
              <div
                key={i}
                style={{
                  color: m.role === 'user' ? '#8a8270' : '#d4cfc0',
                }}
              >
                <span
                  style={{
                    color: m.role === 'user' ? 'var(--ink-3)' : 'var(--acid)',
                    marginRight: 4,
                  }}
                >
                  {m.role === 'user' ? '>' : '◆'}
                </span>
                {m.text}
              </div>
            ))}
            {thinking && (
              <div data-testid="orb-chat-thinking">
                <span style={{ color: 'var(--acid)', marginRight: 6 }}>◆</span>
                <span style={{ display: 'inline-flex', gap: 3, marginLeft: 4 }}>
                  {[0, 1, 2].map((j) => (
                    <span
                      key={j}
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: '50%',
                        display: 'inline-block',
                        background: 'var(--acid)',
                        boxShadow: '0 0 6px var(--acid)',
                        animation: 'ai-dot 1.2s ease-in-out infinite',
                        animationDelay: `${j * 0.15}s`,
                      }}
                    />
                  ))}
                </span>
              </div>
            )}
          </div>

          {/* Input form */}
          <form
            onSubmit={onSubmit}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '10px 12px',
              borderTop: '1px solid rgba(201, 241, 88, 0.15)',
              background: 'rgba(0, 0, 0, 0.2)',
            }}
          >
            <span style={{ color: 'var(--acid)', fontWeight: 700 }}>›</span>
            <input
              ref={inputRef}
              data-testid="orb-chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={thinking ? 'thinking…' : 'ask anything · ⌘+J to listen'}
              disabled={thinking}
              autoComplete="off"
              spellCheck={false}
              style={{
                flex: 1,
                background: 'transparent',
                border: 0,
                outline: 0,
                color: '#d4cfc0',
                fontFamily: 'inherit',
                fontSize: 12.5,
                padding: '4px 0',
              }}
            />
          </form>
        </div>
      )}

      {/* Orb button */}
      <button
        type="button"
        data-testid="orb-button"
        aria-label={`AI assistant — ${orbState}. Click to ${open ? 'close' : 'open'} chat, hold Space to talk.`}
        aria-live="polite"
        onMouseDown={onMouseDown}
        onClick={onOrbClick}
        style={orbButtonStyle}
      >
        <svg viewBox="0 0 80 80" width="64" height="64">
          <defs>
            <radialGradient id="orbGrad" cx="35%" cy="35%" r="70%">
              <stop offset="0%" stopColor="#f0ffb8" stopOpacity="1" />
              <stop offset="35%" stopColor="#c9f158" stopOpacity="0.95" />
              <stop offset="70%" stopColor="#7fa830" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#1a2f00" stopOpacity="1" />
            </radialGradient>
            <radialGradient id="orbHi" cx="32%" cy="28%" r="22%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </radialGradient>
            <filter id="orbBlur" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="0.4" />
            </filter>
          </defs>
          {/* Outer halos */}
          <circle cx="40" cy="40" r="38" fill="url(#orbGrad)" opacity="0.18" />
          <circle cx="40" cy="40" r="32" fill="url(#orbGrad)" opacity="0.35" />
          {/* Main orb body */}
          <circle cx="40" cy="40" r="26" fill="url(#orbGrad)" filter="url(#orbBlur)" />
          {/* Swirl band — rotates independently of the bob. ai-swirl
              keyframe (PR1 tokens.css) drives the rotation. */}
          <g
            style={{
              animation: isPurple
                ? 'ai-swirl 1.8s linear infinite'
                : 'ai-swirl 8s linear infinite',
              transformOrigin: '40px 40px',
            }}
          >
            <ellipse cx="40" cy="36" rx="22" ry="7" fill="#c9f158" opacity="0.35" />
            <ellipse cx="40" cy="44" rx="18" ry="5" fill="#7fa830" opacity="0.4" />
          </g>
          {/* Specular highlight */}
          <ellipse cx="32" cy="30" rx="9" ry="6" fill="url(#orbHi)" />
          <circle cx="29" cy="27" r="2" fill="#ffffff" opacity="0.9" />
        </svg>

        {/* Pulse rings — visible only while listening (Space PTT). Three
            rings staggered for a sonar effect. */}
        {showRings && (
          <>
            {[0, 0.5, 1].map((delay, idx) => (
              <span
                key={idx}
                style={{
                  position: 'absolute',
                  inset: 8,
                  borderRadius: '50%',
                  border: '1.5px solid rgba(201, 241, 88, 0.5)',
                  pointerEvents: 'none',
                  animation: 'ai-ring 1.6s ease-out infinite',
                  animationDelay: `${delay}s`,
                }}
              />
            ))}
          </>
        )}
      </button>
    </div>
  );
}
