// Switch — the app's on/off toggle. One look everywhere (Pomo settings,
// Analytics card visibility): an --acid track with an --ink-on-bright knob
// when on, so it stays readable in every frame style, including Macintosh
// light where --acid is near-black.

import type { CSSProperties, MouseEvent } from 'react';

const SIZES = {
  sm: { w: 26, h: 15, knob: 11 },
  md: { w: 34, h: 20, knob: 16 },
} as const;

/** The track + knob alone, for a row that is itself the switch button. */
/** `offTrack` / `offKnob`: the off colours, for a panel that keeps its own palette (Analytics). */
export function SwitchVisual({ on, size = 'sm', offTrack = 'var(--paper-3)', offKnob = 'var(--ink-3)' }: { on: boolean; size?: keyof typeof SIZES; offTrack?: string; offKnob?: string }) {
  const s = SIZES[size];
  const pad = (s.h - s.knob) / 2;
  const track: CSSProperties = {
    width: s.w, height: s.h, flexShrink: 0, borderRadius: 999, position: 'relative',
    background: on ? 'var(--acid)' : offTrack, transition: 'background 120ms',
  };
  const knob: CSSProperties = {
    position: 'absolute', top: pad, left: on ? s.w - s.knob - pad : pad, width: s.knob, height: s.knob,
    borderRadius: 999, background: on ? 'var(--ink-on-bright)' : offKnob, transition: 'left 120ms',
  };
  return <span aria-hidden style={track}><span style={knob} /></span>;
}

interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  testId?: string;
  title?: string;
  size?: keyof typeof SIZES;
}

/** A standalone switch button (role="switch"). Clicks don't reach the canvas. */
export function Switch({ checked, onChange, testId, title, size = 'md' }: SwitchProps) {
  const stop = (e: MouseEvent) => e.stopPropagation();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-testid={testId}
      title={title}
      onClick={(e) => { e.stopPropagation(); onChange(!checked); }}
      onMouseDown={stop}
      style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', display: 'inline-flex' }}
    >
      <SwitchVisual on={checked} size={size} />
    </button>
  );
}
