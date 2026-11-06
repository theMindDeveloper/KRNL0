// The pocket timer view (Decision 37, docs/06-requirements/pocket-timer.md).
// Rendered in the small always-on-top window instead of App. It shows the
// Pomo node in its current mode — Pomodoro or Observe — in one of three looks
// (F12): a round dial (default), a capsule, or the node as a box. It reads
// the snapshot the main window sends and sends the node's own commands back.
// It never loads or saves the board.

import { useEffect, useRef, useState, type ComponentType, type CSSProperties, type ReactNode } from 'react';
import { DEFAULT_POCKET_PREFS, POCKET_WIDTH, isPocketLive, parsePocketPrefs, type PocketPrefs, type PocketSnapshot } from '../../shared/pocket';
import {
  formatElapsed,
  formatRemaining,
  isObserve,
  isPromptDone,
  pomoClock,
  pomoControls,
  type PomoControl,
} from '../components/nodes/PomoNode/derive';
import { calcRemainingPct } from '../components/nodes/PomoNode/display';
import { ObserveDash } from '../components/nodes/PomoNode/ObserveDash';
import { Ascii } from '../components/nodes/PomoNode/variants/Ascii';
import { Lcd } from '../components/nodes/PomoNode/variants/Lcd';
import { Blocks } from '../components/nodes/PomoNode/variants/Blocks';
import { Vapor } from '../components/nodes/PomoNode/variants/Vapor';
import { Vu } from '../components/nodes/PomoNode/variants/Vu';
import { Outline } from '../components/nodes/PomoNode/variants/Outline';
import { Mac } from '../components/nodes/PomoNode/variants/Mac';
import type { TimerFaceProps } from '../components/nodes/PomoNode/variants/types';
import type { TimerFace } from '../components/nodes/PomoNode/types';
import { buildModel } from './model';
import { DialTab, DialView } from './DialView';
import { CapsuleView } from './CapsuleView';

const FACES: Record<TimerFace, ComponentType<TimerFaceProps>> = {
  ascii: Ascii, lcd: Lcd, blocks: Blocks, vapor: Vapor, vu: Vu, outline: Outline, mac: Mac,
};

// Electron's window drag region; buttons opt out so they stay clickable.
const DRAG = { WebkitAppRegion: 'drag' } as unknown as CSSProperties;
const NO_DRAG = { WebkitAppRegion: 'no-drag' } as unknown as CSSProperties;

function isSnapshot(v: unknown): v is PocketSnapshot {
  return typeof v === 'object' && v !== null && typeof (v as { nodeId?: unknown }).nodeId === 'string';
}

/** Mirror the main window's <html> look (theme, frame style, tokens). */
function applyRoot(root: PocketSnapshot['root']): void {
  const el = document.documentElement;
  for (const a of Array.from(el.attributes)) {
    if (a.name.startsWith('data-') && !(a.name in root.attrs)) el.removeAttribute(a.name);
  }
  for (const [k, v] of Object.entries(root.attrs)) el.setAttribute(k, v);
  if (root.style) el.setAttribute('style', root.style);
  else el.removeAttribute('style');
}

export function PocketApp() {
  const [snap, setSnap] = useState<PocketSnapshot | null>(null);
  const [prefs, setPrefs] = useState<PocketPrefs>(DEFAULT_POCKET_PREFS);
  const [now, setNow] = useState(() => Date.now());
  const [hover, setHover] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // The window is transparent: the page must not paint a background.
  useEffect(() => { document.documentElement.classList.add('krnl-pocket'); }, []);
  // Main watches the pointer (drag regions hide hover from the page).
  useEffect(() => window.krnl?.onPocketHover?.((over) => setHover(over)), []);

  useEffect(() => {
    const k = window.krnl;
    void k?.pocketGet?.().then((r) => {
      if (typeof r !== 'object' || r === null) return;
      const { snapshot, prefs: p } = r as { snapshot?: unknown; prefs?: unknown };
      if (isSnapshot(snapshot)) setSnap(snapshot);
      setPrefs(parsePocketPrefs(p));
    });
    const offSnap = k?.onPocketSnapshot?.((s) => setSnap(isSnapshot(s) ? s : null));
    const offPrefs = k?.onPocketPrefs?.((p) => setPrefs(parsePocketPrefs(p)));
    return () => { offSnap?.(); offPrefs?.(); };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!snap) return;
    applyRoot(snap.root);
    document.documentElement.classList.add('krnl-pocket');
  }, [snap]);

  // The window follows the content's size, in every look and state.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const send = (): void => {
      const r = el.getBoundingClientRect();
      window.krnl?.pocketResize?.({ width: Math.ceil(r.width), height: Math.ceil(r.height) });
    };
    const ro = new ResizeObserver(send);
    ro.observe(el);
    send();
    return () => ro.disconnect();
  }, [prefs.collapsed, prefs.look, snap !== null]);

  const run = (c: PomoControl): void => { void window.krnl?.pocketCommand?.(c.command); };
  const open = (): void => window.krnl?.pocketOpenMain?.();
  const collapse = (v: boolean): void => window.krnl?.pocketCollapse?.(v);

  if (!snap) {
    return (
      <div ref={rootRef} style={{ display: 'inline-block', padding: 8 }}>
        <div style={{ ...shell, ...DRAG, ...boxFrame, height: 48, padding: '0 14px', display: 'flex', alignItems: 'center' }}>
          <span style={label}>KRNL0 · waiting for the Pomo…</span>
        </div>
      </div>
    );
  }

  if (prefs.look === 'dial' || prefs.look === 'capsule') {
    const m = buildModel(snap, now);
    return (
      <div ref={rootRef} style={{ display: 'inline-block' }} data-testid="pocket">
        {prefs.look === 'capsule'
          ? <CapsuleView m={m} hover={hover} />
          : prefs.collapsed ? <DialTab m={m} /> : <DialView m={m} hover={hover} />}
      </div>
    );
  }

  const { state, config } = snap;
  const observe = isObserve(config, snap.easy);
  const clock = pomoClock(state, config, now);
  const promptDone = isPromptDone(observe, snap.away, state.status, clock);
  const controls = pomoControls({ observe, status: state.status, promptDone, config });
  const onBreak = state.status === 'break';
  const isTaskMode = !snap.easy && state.activeTaskId !== null;
  const title = isTaskMode ? `ON · ${truncate(state.label || 'task', 18)}` : observe ? 'TIME LOG' : 'DEEP WORK';
  const titleRight = observe ? (onBreak ? '· BREAK' : '') : isTaskMode ? '' : `· POMO.${String(clock.sessionMin).padStart(3, '0')}`;
  const dot = onBreak ? 'var(--cyan, #22d3ee)' : state.status === 'paused' ? 'var(--ink-3)' : observe ? 'var(--rust)' : 'var(--acid)';

  // Pomodoro face text: idle shows the session, a break counts up, otherwise what's left.
  const faceText = state.status === 'idle' || state.status === 'done'
    ? formatRemaining(clock.sessionMin * 60_000)
    : onBreak ? formatRemaining(clock.breakElapsedMs) : formatRemaining(clock.remainingMs);
  const [mm, ss] = faceText.split(':') as [string, string];
  const remainingPct = calcRemainingPct(state.status, clock.remainingMs, clock.thresholdMs);
  const observedMs = onBreak ? clock.breakElapsedMs : clock.liveWorkMs;
  const Face = FACES[snap.face] ?? Blocks;
  const pips = Math.max(1, config.longBreakEvery);
  const doneDots = state.sessionsCompleted % pips;

  if (prefs.collapsed) {
    const time = observe ? formatElapsed(observedMs) : faceText;
    const tail = observe ? (onBreak ? 'break' : '↑ time log') : onBreak ? 'break' : state.status === 'paused' ? 'paused' : `${doneDots} / ${pips}`;
    return (
      <div ref={rootRef} style={{ display: 'inline-block', padding: 8 }}>
      <div style={{ ...shell, ...DRAG, ...boxFrame, width: POCKET_WIDTH, height: 48, display: 'flex', alignItems: 'center', gap: 10, padding: '0 6px 0 14px' }}>
        <span style={{ width: 7, height: 7, borderRadius: 999, background: dot, flexShrink: 0 }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 19, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{time}</span>
        <span style={{ ...label, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tail}</span>
        <IconButton title="Expand" onClick={() => collapse(false)}><path d="M12 5v14M5 12h14" /></IconButton>
        <IconButton title="Open KRNL0" onClick={open}><path d="M14 4h6v6M20 4l-8 8" /><path d="M18 14v5H5V6h5" /></IconButton>
      </div>
      </div>
    );
  }

  return (
    <div ref={rootRef} style={{ display: 'inline-block', padding: 8 }} data-testid="pocket">
    <div style={{ ...shell, ...boxFrame, width: POCKET_WIDTH }}>
      <header style={{ ...DRAG, height: 32, display: 'flex', alignItems: 'center', gap: 8, padding: '0 4px 0 12px', borderBottom: '1px solid var(--paper-3)' }}>
        <span style={{ width: 6, height: 6, borderRadius: 999, background: dot, flexShrink: 0 }} />
        <span style={{ ...label, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title} {titleRight}</span>
        <span style={{ marginLeft: 'auto', ...modeChip(observe) }}>{observe ? 'OBSERVE' : 'POMO'}</span>
        <IconButton title="Collapse to one line" onClick={() => collapse(true)}><path d="M5 12h14" /></IconButton>
        <IconButton title="Open KRNL0" onClick={open}><path d="M14 4h6v6M20 4l-8 8" /><path d="M18 14v5H5V6h5" /></IconButton>
      </header>

      <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {observe ? (
          <ObserveDash state={state} liveMs={observedMs} library={snap.library} nowMs={now} plain={snap.easy} />
        ) : (
          <>
            <Face m={mm} s={ss} elapsedPct={100 - remainingPct} remainingPct={remainingPct} total={clock.sessionMin} running={state.status === 'running'} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={label}>{onBreak ? 'BREAK' : `SESSION ${doneDots} / ${pips}`}</span>
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }} aria-hidden>
                {Array.from({ length: pips }, (_, i) => (
                  <span key={i} style={{ width: 9, height: 9, borderRadius: 2, background: i < doneDots ? 'var(--acid)' : 'transparent', boxShadow: i < doneDots ? 'none' : 'inset 0 0 0 1px var(--ink-4, var(--ink-3))' }} />
                ))}
              </span>
            </div>
          </>
        )}

        {snap.away ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, border: '1px solid var(--rust)', borderRadius: 6 }}>
            <span style={{ ...label, color: 'var(--ink)' }}>Away time — decide in KRNL0</span>
            <button type="button" onClick={open} style={{ ...btn, ...primary }}>Open KRNL0</button>
          </div>
        ) : (
          <>
            {promptDone && (
              <span style={{ ...label, color: 'var(--acid-ink, var(--acid))', textAlign: 'center', fontWeight: 700 }}>Are you done?</span>
            )}
            <div style={{ display: 'flex', gap: 6 }}>
              {controls.map((c) => (
                <button key={c.id} type="button" data-testid={`pocket-${c.id}`} onClick={() => run(c)} style={{ ...btn, ...(c.primary ? primary : ghost) }}>
                  {c.label}
                </button>
              ))}
            </div>
          </>
        )}
        {!isPocketLive(state.status) && <span style={{ ...label, textAlign: 'center' }}>Nothing is being timed</span>}
      </div>
    </div>
    </div>
  );
}

function IconButton({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={title} title={title} onClick={onClick} style={{ ...NO_DRAG, width: 28, height: 28, display: 'grid', placeItems: 'center', border: 0, borderRadius: 6, background: 'transparent', color: 'var(--ink-3)', cursor: 'pointer', flexShrink: 0 }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>
    </button>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function modeChip(observe: boolean): CSSProperties {
  return {
    fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em', padding: '3px 6px', borderRadius: 4,
    color: observe ? 'var(--rust)' : 'var(--acid-ink, var(--acid))',
    background: observe ? 'color-mix(in srgb, var(--rust) 16%, transparent)' : 'color-mix(in srgb, var(--acid) 14%, transparent)',
  };
}

/** The box look's own rounded frame and shadow (the window itself is transparent). */
const boxFrame: CSSProperties = { borderRadius: 10, boxShadow: '0 0 0 1px var(--paper-3), 0 10px 24px rgba(0,0,0,.45)', boxSizing: 'border-box' };

const shell: CSSProperties = {
  width: '100%', boxSizing: 'border-box', background: 'var(--node-bg)', color: 'var(--ink)',
  fontFamily: 'var(--font-mono)', overflow: 'hidden', userSelect: 'none',
};
const label: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-3)' };
const btn: CSSProperties = {
  ...NO_DRAG, flex: 1, height: 34, borderRadius: 5, fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.06em',
  textTransform: 'uppercase', cursor: 'pointer', whiteSpace: 'nowrap',
};
const ghost: CSSProperties = { background: 'transparent', color: 'var(--ink-2)', border: '1px solid var(--paper-3)' };
const primary: CSSProperties = { background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-fg)', border: 'none', fontWeight: 700 };
