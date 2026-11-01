/**
 * Theme manifests, one per frame style (ADR 0009).
 *
 * CLASSIC_K holds the `--k-*` tokens that replace hard-coded literals. Their
 * Classic values equal the literals they replaced, so Classic — the original
 * green look and the default — renders exactly as before (requirement F3).
 *
 * Phase 1: Classic and Pro carry full manifests. The six legacy styles still
 * get their component colours from chassis.css; their manifests start from the
 * Classic `--k-*` set and are filled in during phase 4.
 */

import type { FrameStyleId } from '../../shared/frameStyles';
import type { ThemeManifest, TokenMap, XtermColors } from './types';

export const CLASSIC_K: TokenMap = {
  '--k-now': '#ef4444',
  '--k-cal-grid': 'rgba(154, 145, 128, 0.25)',
  '--k-cal-today': 'rgba(201, 241, 88, 0.08)',
  '--k-pointer-core': '#fff5ec',
  '--k-mother-radius': '8px',
  '--k-mother-wash': 'linear-gradient(180deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0) 30%)',
  '--k-mother-shadow': '0 2px 8px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.04)',
  '--k-term-border': '#2a241c',
};

const CLASSIC_XTERM: XtermColors = {
  background: '#05040a',
  foreground: '#d4cfc0',
  cursor: '#c9f158',
  cursorAccent: '#0e0d0b',
};

const legacy = (): ThemeManifest => ({
  tokens: { light: CLASSIC_K, dark: CLASSIC_K },
  components: { pomo: {}, terminal: { xterm: { light: CLASSIC_XTERM, dark: CLASSIC_XTERM } } },
  slots: { panelToggles: 'row' },
});

/** Pro — matte graphite, one lit acid accent (design drafts "Pro screens"). */
const PRO_DARK: TokenMap = {
  '--paper': '#0b0b0b',
  '--paper-2': '#141414',
  '--paper-3': '#262626',
  '--node-bg': '#181818',
  '--ink': '#f2f2f2',
  '--ink-2': '#e6e6e6',
  '--ink-3': '#8c8c8c',
  '--ink-4': '#808080',
  '--acid': '#c9f158',
  '--acid-glow': '#d8ff6e',
  '--spine': '#7ea22b',
  '--spine-hot': '#a8d244',
  '--rust': '#ee8466',
  '--rust-deep': '#d05f47',
  '--cyan': '#22d3ee',
  '--cyan-glow': '#67e8f9',
  '--purple': '#a78bfa',
  '--term-bg': '#0b0b10',
  '--term-bg-2': '#15151b',
  '--term-fg': '#c9cfc6',
  '--term-dim': '#808080',
  '--grid': 'rgba(255, 255, 255, 0.05)',
  '--grid-strong': 'rgba(255, 255, 255, 0.11)',
  '--frame-edge': 'rgba(255, 255, 255, 0.09)',
  '--frame-bg': 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.012) 100%)',
  '--frame-shadow': 'inset 0 1px 0 rgba(255,255,255,0.04), 0 18px 40px rgba(0,0,0,0.35)',
  '--btn-primary-bg': '#c9f158',
  '--btn-primary-bg-hover': '#d8ff6e',
  '--btn-primary-fg': '#1a1612',
  '--btn-primary-ring': 'rgba(201, 241, 88, 0.45)',
  '--k-now': '#ef4444',
  '--k-cal-grid': '#202020',
  '--k-cal-today': 'rgba(201, 241, 88, 0.045)',
  '--k-pointer-core': '#fff5ec',
  '--k-mother-radius': '6px',
  '--k-mother-wash': 'linear-gradient(180deg, rgba(255,255,255,0.025) 0%, rgba(255,255,255,0) 18%)',
  '--k-mother-shadow': 'inset 0 1px 0 rgba(255,255,255,0.05), 0 0 0 1px #070707, 0 24px 48px rgba(0,0,0,0.5)',
  '--k-term-border': '#070707',
};

const PRO: ThemeManifest = {
  tokens: { dark: PRO_DARK },
  components: {
    pomo: { face: 'blocks' },
    terminal: { xterm: { dark: { background: '#0b0b10', foreground: '#c9cfc6', cursor: '#c9f158', cursorAccent: '#0b0b10' } } },
  },
  slots: { panelToggles: 'topbar' },
};

export const MANIFESTS: Record<FrameStyleId, ThemeManifest> = {
  classic: legacy(),
  pro: PRO,
  synthesizer: legacy(),
  telemetry: legacy(),
  'krnl-dock': legacy(),
  blueprint: legacy(),
  macintosh: legacy(),
  submarine: legacy(),
};
