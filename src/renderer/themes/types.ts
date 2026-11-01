/**
 * Theme manifest contract (ADR 0009, docs/06-requirements/theme-engine.md).
 *
 * A frame style is a full theme: tokens per mode, component variants and
 * layout slots. Tokens are CSS custom properties written on <html>, so every
 * node (mother and child) inherits them. Existing token names are reused;
 * `--k-*` tokens replace values that used to be hard-coded in components.
 */

import type { FrameMode } from '../../shared/frameStyles';
import type { TimerFace } from '../components/nodes/PomoNode/types';

/** Token name → CSS value. Names must start with `--`. */
export type TokenMap = Readonly<Record<`--${string}`, string>>;

/** The Timer faces a Pomo node can render. */
export type PomoFace = TimerFace;

export interface XtermColors {
  background: string;
  foreground: string;
  cursor: string;
  cursorAccent: string;
}

/**
 * How a style draws the Clock dial. Only appearance: the feature set (task
 * lanes, pomo reality wash, ticks, numerals, now-pointer, hands, readout) is
 * fixed in every style (F6). Colours come from `--k-clock-*` tokens.
 */
export interface ClockSkin {
  bezel: 'none' | 'ring' | 'metal' | 'brass' | 'line' | 'pixel';
  hand: 'line' | 'sword' | 'block';
  /** Backing window behind the HH:MM readout. */
  readoutWindow: boolean;
}

export interface ThemeManifest {
  /** Tokens per supported mode. A missing mode falls back to the other one. */
  tokens: Partial<Record<FrameMode, TokenMap>>;
  components: {
    /** Default Timer face; only used when the node has no face of its own (F7). */
    pomo: { face?: PomoFace };
    /** Clock dial appearance (F6). */
    clock: ClockSkin;
    /** xterm colours, applied live (F8). */
    terminal: { xterm: Partial<Record<FrameMode, XtermColors>> };
  };
  slots: {
    /** Where Station panel toggles render (F9). */
    panelToggles: 'row' | 'topbar' | 'chrome-top';
  };
}
