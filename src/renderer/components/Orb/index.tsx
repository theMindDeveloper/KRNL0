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
 *   keydown; listening -> thinking on keyup).
 * - Click toggles a chat panel anchored above the orb.
 * - Orb is draggable. Position is persisted to localStorage.
 * - Quick-action buttons trigger pre-recorded voice flows with live camera
 *   movement and krnl command execution.
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type FormEvent,
  type CSSProperties,
} from 'react';
import { useReactFlow } from '@xyflow/react';
import { useBoardStore } from '../../../renderer/store/boardStore';
import { voicePlayer } from '../Assistant/VoicePlayer';
import { ScriptRunner } from '../Assistant/ScriptRunner';
import { FLOWS, sessionFromCommanderFlow } from '../Assistant/flows';
import { CLICK_CLIPS } from '../Assistant/clipMap';
import { Commander } from '../Assistant/Commander';
import type { Flow, BoardSnapshot } from '../Assistant/types';

type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'running';
interface ChatMsg { role: 'user' | 'ai'; text: string }

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
  return { x: 22, y: window.innerHeight - ORB_SIZE - 56 };
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
        typeof parsed === 'object' && parsed !== null &&
        'x' in parsed && 'y' in parsed &&
        typeof (parsed as { x: unknown }).x === 'number' &&
        typeof (parsed as { y: unknown }).y === 'number'
      ) {
        return clampPos({ x: (parsed as OrbPos).x, y: (parsed as OrbPos).y });
      }
    }
  } catch { /* fall through */ }
  return defaultPos();
}

function savePos(pos: OrbPos): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(pos)); } catch { /* ignore */ }
}

// ── Board snapshot helper ─────────────────────────────────────────────────────
function getBoardSnapshot(): BoardSnapshot {
  const board = useBoardStore.getState().board;
  const viewport = useBoardStore.getState().viewport;
  if (!board) {
    return {
      nodeCount: 0, taskCount: 0, habitCount: 0,
      hasPomo: false, hasTodo: false, hasCalendar: false, hasClock: false,
      scheduledTaskCount: 0, chainedTaskCount: 0,
      taskTexts: [], firstTaskText: null,
      viewport,
    };
  }
  const tasks  = board.nodes.filter((n) => n.kind === 'todo.task');
  const habits = board.nodes.filter((n) => n.kind === 'habit');

  const scheduledTaskCount = tasks.filter((n) => {
    const s = n.state as { scheduledFor?: unknown };
    return s.scheduledFor !== undefined && s.scheduledFor !== null;
  }).length;

  const chainedTaskCount = new Set(
    board.edges
      .filter((e) => e.from?.event === 'task.next')
      .flatMap((e) => [e.from.nodeId, e.to.nodeId]),
  ).size;

  const taskTexts = tasks
    .map((n) => (n.state as { text?: string }).text ?? '')
    .filter((t) => t.length > 0);

  return {
    nodeCount: board.nodes.length,
    taskCount: tasks.length,
    habitCount: habits.length,
    hasPomo: board.nodes.some((n) => n.kind === 'pomo'),
    hasTodo: board.nodes.some((n) => n.kind === 'todo'),
    hasCalendar: board.nodes.some((n) => n.kind === 'calendar'),
    hasClock: board.nodes.some((n) => n.kind === 'clock'),
    scheduledTaskCount,
    chainedTaskCount,
    taskTexts,
    firstTaskText: taskTexts[0] ?? null,
    viewport,
  };
}

export function Orb() {
  const { setViewport } = useReactFlow();

  const [orbState, setOrbState] = useState<OrbState>('idle');
  const [open, setOpen]         = useState(false);
  const [history, setHistory]   = useState<ChatMsg[]>([]);
  const [input, setInput]       = useState('');
  const [thinking, setThinking] = useState(false);
  const [caption, setCaption]   = useState<string | null>(null);
  const [activeFlowId, setActiveFlowId] = useState<string | null>(null);
  const [commanderOpen, setCommanderOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // ── Drag state ────────────────────────────────────────────────────────────
  const [pos, setPos]           = useState<OrbPos>(loadPos);
  const [settleKey, setSettleKey] = useState(0);
  const draggingRef    = useRef(false);
  const dragMovedRef   = useRef(false);
  const dragOffsetRef  = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const dragStartRef   = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // ── ScriptRunner ──────────────────────────────────────────────────────────
  const runnerRef = useRef<ScriptRunner | null>(null);

  useEffect(() => {
    runnerRef.current = new ScriptRunner({
      voice: voicePlayer,
      setCaption,
      setOrbState,
      setActiveFlowId,
      setViewport: (vp, opts) => setViewport(vp, opts),
      getBoardSnapshot,
    });
  }, [setViewport]);

  // Pre-warm click clips on mount.
  useEffect(() => {
    voicePlayer.preload(CLICK_CLIPS);
  }, []);

  // ── Startup greeting ─────────────────────────────────────────────────────
  // ONE clip on mount, picked by time of day. No subscriptions, no triggers,
  // no daemons. The proactive engine was removed — everything else the
  // assistant says is user-prompted (click acks, flow narration, commander).
  useEffect(() => {
    const hour = new Date().getHours();
    let pick: { clip: string; text: string };
    if (hour >= 0 && hour < 5) {
      pick = { clip: 'pa_past_midnight', text: "Past midnight. Whatever this is, it can wait." };
    } else if (hour >= 5 && hour < 11) {
      pick = { clip: 'pa_morning', text: "Morning." };
    } else if (hour >= 22) {
      pick = { clip: 'pa_its_late', text: "It's late. Tomorrow exists." };
    } else {
      pick = { clip: 'pa_welcome_back', text: "Welcome back. The board's where you left it." };
    }

    const greetTimer = window.setTimeout(() => {
      setOrbState('speaking');
      setCaption(pick.text);
      voicePlayer.play(pick.clip).catch(() => { /* missing clip → caption only */ });
      window.setTimeout(() => {
        setCaption(null);
        setOrbState('idle');
      }, Math.max(2500, pick.text.split(' ').length * 320));
    }, 1500);

    return () => clearTimeout(greetTimer);
  }, []);

  // Clamp on resize.
  useEffect(() => {
    const onResize = () => {
      setPos((p) => { const c = clampPos(p); savePos(c); return c; });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // ── Drag handlers ─────────────────────────────────────────────────────────
  const onMouseDown = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    draggingRef.current   = true;
    dragMovedRef.current  = false;
    dragStartRef.current  = { x: e.clientX, y: e.clientY };
    dragOffsetRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };

    const onMouseMove = (ev: MouseEvent) => {
      if (!draggingRef.current) return;
      if (Math.abs(ev.clientX - dragStartRef.current.x) + Math.abs(ev.clientY - dragStartRef.current.y) >= 4) {
        dragMovedRef.current = true;
      }
      setPos(clampPos({ x: ev.clientX - dragOffsetRef.current.dx, y: ev.clientY - dragOffsetRef.current.dy }));
    };

    const onMouseUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      if (dragMovedRef.current) {
        setPos((p) => { savePos(p); return p; });
        setSettleKey((k) => k + 1);
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [pos.x, pos.y]);

  // ── Click handler ─────────────────────────────────────────────────────────
  const onOrbClick = useCallback(() => {
    if (dragMovedRef.current) { dragMovedRef.current = false; return; }

    if (activeFlowId) {
      // Stop running flow on click.
      runnerRef.current?.abort();
      return;
    }

    // Play a random acknowledgment clip and toggle the panel.
    voicePlayer.playRandom(CLICK_CLIPS).catch(() => {});
    setOpen((o) => !o);
  }, [activeFlowId]);

  // ── Flow launcher ─────────────────────────────────────────────────────────
  const launchFlow = useCallback((flow: Flow) => {
    if (!runnerRef.current) return;
    setOpen(false);
    runnerRef.current.run(flow);
  }, []);

  // ── Space push-to-talk ────────────────────────────────────────────────────
  useEffect(() => {
    const isTypingTarget = (t: EventTarget | null): boolean => {
      if (!(t instanceof HTMLElement)) return false;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return true;
      const active = document.activeElement as HTMLElement | null;
      if (active?.closest('.term-body') || active?.closest('.xterm')) return true;
      return false;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape' && open) { setOpen(false); return; }
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

  // Focus the chat input when panel opens.
  useEffect(() => {
    if (open) {
      const id = window.setTimeout(() => inputRef.current?.focus(), 50);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [open]);

  // Auto-scroll history.
  const historyRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = historyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [history.length, thinking]);

  const submitMock = (text: string) => {
    setHistory((h) => [...h, { role: 'user', text }]);
    setInput('');
    setThinking(true);

    // Check if the text matches a flow.
    const matchingFlow = FLOWS.find((f) =>
      f.label.toLowerCase().includes(text.toLowerCase()) ||
      text.toLowerCase().includes(f.id.replace('-', ' '))
    );

    window.setTimeout(() => {
      if (matchingFlow) {
        setThinking(false);
        setHistory((h) => [...h, { role: 'ai', text: `launching: ${matchingFlow.label}` }]);
        setTimeout(() => launchFlow(matchingFlow), 400);
      } else {
        setHistory((h) => [...h, { role: 'ai', text: mockReply() }]);
        setThinking(false);
      }
    }, 500 + Math.random() * 400);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (text && !thinking) submitMock(text);
  };

  // ── Visual state ──────────────────────────────────────────────────────────
  const isPurple  = orbState === 'thinking' || thinking;
  const isHot     = orbState === 'listening';
  const isSpeaking = orbState === 'speaking';
  const isRunning = orbState === 'running';

  const glowFilter = isHot
    ? 'drop-shadow(0 0 28px rgba(201,241,88,0.95))'
    : isPurple
      ? 'drop-shadow(0 0 26px rgba(180,140,240,0.85))'
      : isSpeaking
        ? 'drop-shadow(0 0 24px rgba(201,241,88,0.7))'
        : isRunning
          ? 'drop-shadow(0 0 22px rgba(107,78,168,0.75))'
          : 'drop-shadow(0 0 22px rgba(201,241,88,0.45))';

  const showRings   = isHot || isSpeaking;
  const showRunRing = isRunning;

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
    animation: (open || activeFlowId) ? 'none' : 'ai-float 6s ease-in-out infinite',
    transition: 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), filter 0.25s ease',
    willChange: 'filter, transform',
  };

  // Caption panel position — anchored relative to orb.
  const captionAboveOrb = pos.y > 120;

  // Commander launch handler — closes popup, runs sessionFromCommanderFlow with params.
  const onCommanderLaunch = useCallback((params: { label: string; tasks: string; startISO?: string }) => {
    setCommanderOpen(false);
    if (!runnerRef.current) return;
    // ScriptRunner.run accepts an optional params record on the second arg.
    runnerRef.current.run(
      sessionFromCommanderFlow,
      params as unknown as Record<string, string>,
    );
  }, []);

  return (
    <>
      {commanderOpen && (
        <Commander
          onClose={() => setCommanderOpen(false)}
          onLaunch={onCommanderLaunch}
        />
      )}
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
      {/* Voice caption — shown during flows */}
      {caption !== null && !open && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            [captionAboveOrb ? 'bottom' : 'top']: 76,
            width: 280,
            background: isRunning
              ? 'rgba(14,13,11,0.96)'
              : 'rgba(14,13,11,0.94)',
            backdropFilter: 'blur(14px)',
            border: `1px solid ${isRunning ? 'rgba(107,78,168,0.4)' : 'rgba(201,241,88,0.22)'}`,
            borderRadius: 10,
            padding: '8px 12px',
            fontFamily: isRunning ? 'var(--font-mono)' : 'var(--font-sans)',
            fontSize: isRunning ? 11 : 12.5,
            color: isRunning ? '#c9f158' : '#d4cfc0',
            lineHeight: 1.5,
            pointerEvents: 'none',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            animation: 'ai-panel-in 0.25s cubic-bezier(0.34,1.56,0.64,1)',
          }}
        >
          <span style={{ color: isRunning ? '#c9f158' : 'var(--acid)', marginRight: 6, opacity: 0.8 }}>
            {isRunning ? '▶' : '◆'}
          </span>
          {caption}
        </div>
      )}

      {/* Chat panel */}
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
              <span style={{ color: 'var(--acid)', marginRight: 8, textShadow: '0 0 8px var(--acid-glow)' }}>
                ◆
              </span>
              krnl0 · assistant
            </span>
            <button
              type="button"
              data-testid="orb-chat-close"
              onClick={() => setOpen(false)}
              style={{
                background: 'transparent', border: 0,
                color: 'var(--ink-3)', cursor: 'pointer',
                fontSize: 16, lineHeight: 1, padding: 0, width: 20, height: 20,
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
              flex: 1, overflowY: 'auto', padding: 14,
              display: 'flex', flexDirection: 'column', gap: 10,
              fontSize: 12.5, color: '#d4cfc0', minHeight: 80, maxHeight: 340,
              lineHeight: 1.5,
            }}
          >
            {history.length === 0 && !thinking && (
              <div style={{ color: '#8a8270' }}>
                <div style={{ marginBottom: 8 }}>how can i help?</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {/* Commander — opens the glass popup for custom sessions */}
                  <button
                    type="button"
                    onClick={() => { setOpen(false); setCommanderOpen(true); }}
                    style={{
                      textAlign: 'left',
                      background: 'linear-gradient(90deg, rgba(201,241,88,0.18) 0%, rgba(201,241,88,0.06) 60%, rgba(201,241,88,0.10) 100%)',
                      border: '1px solid rgba(201, 241, 88, 0.40)',
                      color: 'var(--acid)',
                      padding: '6px 8px',
                      borderRadius: 4,
                      fontFamily: 'inherit',
                      fontSize: 11.5,
                      cursor: 'pointer',
                      textShadow: '0 0 6px rgba(201,241,88,0.35)',
                      letterSpacing: '0.02em',
                      marginBottom: 4,
                    }}
                  >
                    {'▸ commander · plan a session'}
                  </button>
                  {FLOWS.map((flow) => (
                    <button
                      key={flow.id}
                      type="button"
                      onClick={() => launchFlow(flow)}
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
                      {`› ${flow.label}`}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {history.map((m, i) => (
              <div key={i} style={{ color: m.role === 'user' ? '#8a8270' : '#d4cfc0' }}>
                <span style={{ color: m.role === 'user' ? 'var(--ink-3)' : 'var(--acid)', marginRight: 4 }}>
                  {m.role === 'user' ? '›' : '◆'}
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
                        width: 5, height: 5, borderRadius: '50%',
                        display: 'inline-block',
                        background: 'var(--acid)', boxShadow: '0 0 6px var(--acid)',
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
              display: 'flex', alignItems: 'center', gap: 6,
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
                flex: 1, background: 'transparent', border: 0, outline: 0,
                color: '#d4cfc0', fontFamily: 'inherit', fontSize: 12.5, padding: '4px 0',
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
              <stop offset="0%"   stopColor="#f0ffb8" stopOpacity="1" />
              <stop offset="35%"  stopColor={isRunning ? '#b4a0ff' : '#c9f158'} stopOpacity="0.95" />
              <stop offset="70%"  stopColor={isRunning ? '#6b4ea8' : '#7fa830'} stopOpacity="0.9" />
              <stop offset="100%" stopColor="#1a2f00" stopOpacity="1" />
            </radialGradient>
            <radialGradient id="orbHi" cx="32%" cy="28%" r="22%">
              <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </radialGradient>
            <filter id="orbBlur" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="0.4" />
            </filter>
          </defs>
          <circle cx="40" cy="40" r="38" fill="url(#orbGrad)" opacity="0.18" />
          <circle cx="40" cy="40" r="32" fill="url(#orbGrad)" opacity="0.35" />
          <circle cx="40" cy="40" r="26" fill="url(#orbGrad)" filter="url(#orbBlur)" />
          <g
            style={{
              animation: isPurple
                ? 'ai-swirl 1.8s linear infinite'
                : isSpeaking
                  ? 'ai-swirl 3s linear infinite'
                  : isRunning
                    ? 'ai-swirl 2.5s linear infinite'
                    : 'ai-swirl 8s linear infinite',
              transformOrigin: '40px 40px',
            }}
          >
            <ellipse cx="40" cy="36" rx="22" ry="7"
              fill={isRunning ? '#b4a0ff' : '#c9f158'} opacity="0.35" />
            <ellipse cx="40" cy="44" rx="18" ry="5"
              fill={isRunning ? '#6b4ea8' : '#7fa830'} opacity="0.4" />
          </g>
          <ellipse cx="32" cy="30" rx="9" ry="6" fill="url(#orbHi)" />
          <circle cx="29" cy="27" r="2" fill="#ffffff" opacity="0.9" />
        </svg>

        {/* Pulse rings — listening + speaking */}
        {showRings && (
          <>
            {[0, 0.5, 1].map((delay, idx) => (
              <span
                key={idx}
                style={{
                  position: 'absolute', inset: 8, borderRadius: '50%',
                  border: '1.5px solid rgba(201, 241, 88, 0.5)',
                  pointerEvents: 'none',
                  animation: 'ai-ring 1.6s ease-out infinite',
                  animationDelay: `${delay}s`,
                }}
              />
            ))}
          </>
        )}

        {/* Running ring — plum during command execution */}
        {showRunRing && (
          <span
            style={{
              position: 'absolute', inset: 4, borderRadius: '50%',
              border: '1.5px solid rgba(180, 140, 240, 0.55)',
              pointerEvents: 'none',
              animation: 'ai-ring 2.2s ease-out infinite',
            }}
          />
        )}
      </button>
    </div>
    </>
  );
}
