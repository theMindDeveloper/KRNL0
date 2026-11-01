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
import type { ClockSkin, ThemeManifest, TokenMap, XtermColors } from './types';

/** Classic dial: no bezel, line hands, bare readout — exactly today's clock. */
export const CLASSIC_CLOCK: ClockSkin = { bezel: 'none', hand: 'line', readoutWindow: false };

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
  components: { pomo: {}, clock: CLASSIC_CLOCK, terminal: { xterm: { light: CLASSIC_XTERM, dark: CLASSIC_XTERM } } },
  slots: { panelToggles: 'topbar' },
});

/**
 * Analytics node palette for non-Classic styles: follow the style's own
 * surfaces and ink instead of the fixed dark slate Classic keeps.
 */
const AN_THEMED: TokenMap = {
  '--k-an-bg': 'var(--node-bg)', '--k-an-bg-2': 'var(--node-bg)', '--k-an-bg-2b': 'var(--paper-2)', '--k-an-bg-3': 'var(--paper-2)',
  '--k-an-line': 'var(--paper-3)', '--k-an-line-2': 'var(--paper-3)', '--k-an-line-3': 'var(--paper-3)',
  '--k-an-ink': 'var(--ink)', '--k-an-ink-1': 'var(--ink)', '--k-an-ink-2': 'var(--ink-2)', '--k-an-ink-2b': 'var(--ink-3)',
  '--k-an-ink-3': 'var(--ink-3)', '--k-an-ink-4': 'var(--ink-4)', '--k-an-warm': 'var(--rust)',
  '--k-an-tile': 'var(--paper-2)', '--k-an-tab-end': 'var(--paper-2)',
  // Text that sits on the accent / accent used as text: follow the style's
  // own readable pair instead of the slate defaults.
  '--k-an-on-accent': 'var(--ink-on-bright)', '--k-an-accent-ink': 'var(--acid-ink, var(--acid))',
};

/** Pro — matte graphite, one lit acid accent (design drafts "Pro screens"). */
const PRO_DARK: TokenMap = {
  ...AN_THEMED,
  '--paper': '#0b0b0b',
  '--paper-2': '#141414',
  '--paper-3': '#262626',
  '--node-bg': '#181818',
  '--ink': '#f2f2f2',
  '--ink-2': '#e6e6e6',
  '--ink-3': '#a8a8a8',
  '--ink-4': '#949494',
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
  '--k-clock-bezel': '#0d0d0d',
  '--k-clock-bezel-edge': '#050505',
  '--k-clock-face': '#161616',
  '--k-clock-face-edge': '#262626',
  '--k-clock-track': '#1e1e1e',
  '--k-clock-tick-major': '#bdbdbd',
  '--k-clock-tick-minor': '#3a3a3a',
  '--k-clock-num': '#8c8c8c',
  '--k-clock-hand': '#ededed',
  '--k-clock-readout': '#9a9a9a',
};

const PRO: ThemeManifest = {
  tokens: { dark: PRO_DARK },
  components: {
    pomo: { face: 'blocks' },
    clock: { bezel: 'ring', hand: 'line', readoutWindow: true },
    terminal: { xterm: { dark: { background: '#0b0b10', foreground: '#c9cfc6', cursor: '#c9f158', cursorAccent: '#0b0b10' } } },
  },
  slots: { panelToggles: 'topbar' },
};

// ── Legacy styles (phase 4) ──────────────────────────────────────────────────
// Palettes moved here from the `[data-dock] .mother-frame` blocks in
// chassis.css so they apply on <html> and reach every node, not only mothers.

const k = (extra: Record<`--${string}`, string>): TokenMap => ({ ...CLASSIC_K, ...AN_THEMED, ...extra });

const SYNTH_DARK: TokenMap = k({
  '--paper': '#1c1812', '--paper-2': '#221e18', '--paper-3': '#3a352c', '--node-bg': '#221e18',
  '--ink': '#ece4d0', '--ink-2': '#d8d0bc', '--ink-3': '#b3aa94', '--ink-4': '#9a917d',
  '--rust': '#ff8a4c', '--cyan': '#4fd6e0', '--purple': '#b9a0ff',
  '--grid': 'rgba(236, 228, 208, 0.07)', '--grid-strong': 'rgba(236, 228, 208, 0.14)',
  '--k-cal-grid': '#2a261f', '--k-term-border': '#0e0c09',
  '--k-clock-bezel': '#14110d', '--k-clock-bezel-hi': '#8a8478', '--k-clock-bezel-lo': '#1c1813',
  '--k-clock-face': '#1c1914', '--k-clock-face-edge': '#3a352c', '--k-clock-track': '#2a261f',
  '--k-clock-tick-major': '#d8d0bc', '--k-clock-tick-minor': '#3a352c', '--k-clock-num': '#a39a86',
  '--k-clock-hand': '#ece4d0', '--k-clock-readout': '#a39a86',
  '--k-vu-low': '#9be34a', '--k-vu-mid': '#ffd54a', '--k-vu-high': '#ff6a3d',
});

const TELEMETRY_DARK: TokenMap = k({
  '--k-clock-font': "'VT323', monospace", '--k-lcd-font': "'VT323', monospace",
  '--paper': '#0a0905', '--paper-2': '#12110a', '--paper-3': 'rgba(201, 241, 88, 0.22)', '--node-bg': '#0d0c07',
  '--ink': '#d9f2a0', '--ink-2': '#c3db8a', '--ink-3': '#8fa560', '--ink-4': '#7f9452',
  '--rust': '#ff7a4a', '--cyan': '#67e8f9', '--purple': '#b4a0ff',
  '--grid': 'rgba(201, 241, 88, 0.07)', '--grid-strong': 'rgba(201, 241, 88, 0.14)',
  '--k-cal-grid': 'rgba(201, 241, 88, 0.10)', '--k-cal-today': 'rgba(201, 241, 88, 0.07)',
  '--k-term-border': 'rgba(201, 241, 88, 0.25)',
  '--k-clock-bezel': '#060603', '--k-clock-bezel-edge': 'rgba(201, 241, 88, 0.45)',
  '--k-clock-face': '#080805', '--k-clock-face-edge': 'rgba(201, 241, 88, 0.3)', '--k-clock-track': 'rgba(201, 241, 88, 0.08)',
  '--k-clock-tick-major': '#c9f158', '--k-clock-tick-minor': 'rgba(201, 241, 88, 0.25)', '--k-clock-num': '#7f9452',
  '--k-clock-hand': '#c9f158', '--k-clock-readout': '#c9f158',
});

const KRNL_DOCK_DARK: TokenMap = k({
  '--k-clock-font': "'VT323', monospace", '--k-lcd-font': "'VT323', monospace",
  '--paper': '#14130f', '--paper-2': '#1f1d18', '--paper-3': '#2f2b24', '--node-bg': '#1c1a13',
  '--ink': '#f4efe2', '--ink-2': '#ddd6c6', '--ink-3': '#b3aa94', '--ink-4': '#9a917d',
  '--acid': '#b8d957', '--rust': '#ff5a3c', '--cyan': '#7ec8e3',
  '--k-clock-bezel': '#0f100d', '--k-clock-bezel-hi': '#9a9d94', '--k-clock-bezel-lo': '#252823',
  '--k-clock-face': '#141512', '--k-clock-face-edge': '#3a3d36', '--k-clock-track': '#1f211b',
  '--k-clock-tick-major': '#e8e4d4', '--k-clock-tick-minor': '#3a3d36', '--k-clock-num': '#9a9a88',
  '--k-clock-hand': '#d9a23a', '--k-clock-readout': '#b8d957',
});

const BLUEPRINT_LIGHT: TokenMap = k({
  '--paper': '#f0e6cc', '--paper-2': '#e2d6b6', '--paper-3': '#c8bb99', '--node-bg': '#f8eed4',
  '--ink': '#1f2a3a', '--ink-2': 'rgba(31, 42, 58, 0.82)', '--ink-3': 'rgba(31, 42, 58, 0.78)', '--ink-4': 'rgba(31, 42, 58, 0.66)',
  '--ink-on-bright': '#f8eed4', '--acid': '#52701a', '--acid-ink': '#3f5612', '--accent-on-dark': '#a8d05a',
  '--btn-primary-bg': '#1f2a3a', '--btn-primary-bg-hover': '#2c3b52', '--btn-primary-fg': '#f8eed4',
  '--k-status-ok': '#a8d05a', '--acid-glow': '#7ea22b', '--acid-faint': 'rgba(94, 125, 29, 0.10)',
  '--spine': '#5e7d1d', '--spine-hot': '#7ea22b', '--rust': '#c8553d', '--rust-deep': '#a83e2a', '--cyan': '#2f4012',
  '--frame-bg': 'rgba(94, 125, 29, 0.05)', '--frame-edge': 'rgba(94, 125, 29, 0.42)',
  '--k-cal-grid': 'rgba(94, 125, 29, 0.22)', '--k-cal-today': 'rgba(94, 125, 29, 0.07)',
  '--k-clock-face': 'transparent', '--k-clock-face-edge': '#5e7d1d', '--k-clock-bezel-edge': '#5e7d1d', '--k-clock-track': 'rgba(94, 125, 29, 0.14)',
  '--k-clock-tick-major': '#1f2a3a', '--k-clock-tick-minor': 'rgba(31, 42, 58, 0.35)', '--k-clock-num': 'rgba(31, 42, 58, 0.7)',
  '--k-clock-hand': '#1f2a3a', '--k-clock-readout': 'rgba(31, 42, 58, 0.7)',
});

const BLUEPRINT_DARK: TokenMap = k({
  '--paper': '#0c1a2e', '--paper-2': '#142441', '--paper-3': '#1e3358', '--node-bg': '#0e1c34',
  '--ink': '#d8eaff', '--ink-2': 'rgba(216, 234, 255, 0.78)', '--ink-3': 'rgba(216, 234, 255, 0.74)', '--ink-4': 'rgba(216, 234, 255, 0.62)',
  '--ink-on-bright': '#0a1525', '--acid': '#7ec8e3', '--accent-on-dark': '#7ec8e3', '--acid-glow': '#a8e0ff', '--acid-faint': 'rgba(126, 200, 227, 0.12)',
  '--spine': '#7ec8e3', '--spine-hot': '#a8e0ff', '--rust': '#e87a5f', '--rust-deep': '#c8553d', '--cyan': '#7ec8e3',
  '--frame-bg': 'rgba(126, 200, 227, 0.05)', '--frame-edge': 'rgba(126, 200, 227, 0.40)',
  '--k-cal-grid': 'rgba(126, 200, 227, 0.16)', '--k-cal-today': 'rgba(241, 196, 99, 0.06)', '--k-term-border': 'rgba(126, 200, 227, 0.4)',
  '--k-clock-face': 'transparent', '--k-clock-face-edge': '#7ec8e3', '--k-clock-bezel-edge': '#7ec8e3', '--k-clock-track': 'rgba(126, 200, 227, 0.12)',
  '--k-clock-tick-major': '#cfe7ff', '--k-clock-tick-minor': 'rgba(126, 200, 227, 0.35)', '--k-clock-num': '#7f9bb8',
  '--k-clock-hand': '#cfe7ff', '--k-clock-readout': '#7f9bb8',
});

const MAC_LIGHT: TokenMap = k({
  '--font-mono': "'Pixelify Sans', 'JetBrains Mono', monospace", '--font-sans': "'Pixelify Sans', 'JetBrains Mono', monospace", '--k-clock-font': "'Pixelify Sans', monospace",
  '--paper': '#faf3df', '--paper-2': '#f0e6c8', '--paper-3': '#d8cdaa', '--node-bg': '#fffbe8',
  '--ink': '#050505', '--ink-2': '#1a1a1a', '--ink-3': 'rgba(5, 5, 5, 0.76)', '--ink-4': 'rgba(5, 5, 5, 0.64)',
  '--ink-on-bright': '#fffbe8', '--acid': '#050505', '--acid-ink': '#050505', '--accent-on-dark': '#fffbe8',
  /* acid is black here, so text on it is paper and the primary button inverts. */
  '--btn-primary-bg': '#050505', '--btn-primary-bg-hover': '#2a2a2a', '--btn-primary-fg': '#fffbe8',
  '--k-status-ok': '#c9f158', '--k-status-warn': '#ff7a4a', '--acid-glow': '#2a2a2a', '--acid-faint': 'rgba(5, 5, 5, 0.10)',
  '--spine': '#1f1f1f', '--spine-hot': '#050505', '--rust': '#2a1a14', '--rust-deep': '#050505', '--cyan': '#050505', '--plum': '#1f1f1f',
  '--frame-bg': 'rgba(5, 5, 5, 0.04)', '--frame-edge': 'rgba(5, 5, 5, 0.55)',
  '--k-now': '#050505', '--k-cal-grid': 'rgba(5, 5, 5, 0.25)', '--k-cal-today': 'rgba(5, 5, 5, 0.06)', '--k-pointer-core': '#fffbe8',
  '--k-term-border': '#050505',
  '--k-clock-bezel': '#fffbe8', '--k-clock-face': '#fffbe8', '--k-clock-face-edge': '#050505', '--k-clock-track': '#e6dcbc',
  '--k-clock-tick-major': '#050505', '--k-clock-tick-minor': '#050505', '--k-clock-num': '#050505',
  '--k-clock-hand': '#050505', '--k-clock-readout': '#050505',
});

const MAC_DARK: TokenMap = k({
  '--font-mono': "'Pixelify Sans', 'JetBrains Mono', monospace", '--font-sans': "'Pixelify Sans', 'JetBrains Mono', monospace", '--k-clock-font': "'Pixelify Sans', monospace",
  '--paper': '#14110c', '--paper-2': '#1f1b14', '--paper-3': '#2c261c', '--node-bg': '#0a0807',
  '--ink': '#f5efde', '--ink-2': '#d4cdb8', '--ink-3': 'rgba(245, 239, 222, 0.76)', '--ink-4': 'rgba(245, 239, 222, 0.62)',
  '--ink-on-bright': '#0a0807', '--acid': '#f5efde', '--accent-on-dark': '#f5efde', '--acid-glow': '#ffffff', '--acid-faint': 'rgba(245, 239, 222, 0.10)',
  '--spine': '#d4cdb8', '--spine-hot': '#f5efde', '--rust': '#e8d8b0', '--rust-deep': '#f5efde', '--cyan': '#f5efde', '--plum': '#d4cdb8',
  '--frame-bg': 'rgba(245, 239, 222, 0.04)', '--frame-edge': 'rgba(245, 239, 222, 0.40)',
  '--k-now': '#f5efde', '--k-cal-grid': 'rgba(245, 239, 222, 0.2)', '--k-cal-today': 'rgba(245, 239, 222, 0.06)', '--k-pointer-core': '#0a0807',
  '--k-term-border': '#f5efde',
  '--k-clock-bezel': '#0a0807', '--k-clock-face': '#0a0807', '--k-clock-face-edge': '#f5efde', '--k-clock-track': '#2c261c',
  '--k-clock-tick-major': '#f5efde', '--k-clock-tick-minor': '#f5efde', '--k-clock-num': '#f5efde',
  '--k-clock-hand': '#f5efde', '--k-clock-readout': '#f5efde',
});

const SUBMARINE_DARK: TokenMap = k({
  '--k-lcd-font': "'VT323', monospace",
  '--paper': '#1a1410', '--paper-2': '#261c14', '--paper-3': '#38291c', '--node-bg': '#110a06',
  '--ink': '#d4c69e', '--ink-2': 'rgba(212, 198, 158, 0.82)', '--ink-3': 'rgba(212, 198, 158, 0.80)', '--ink-4': 'rgba(212, 198, 158, 0.66)',
  '--ink-on-bright': '#1a1408', '--acid': '#f0b850', '--accent-on-dark': '#f0b850', '--acid-glow': '#f0d090', '--acid-faint': 'rgba(240, 184, 80, 0.12)',
  '--spine': '#b88a3a', '--spine-hot': '#f0b850', '--rust': '#ff6450', '--rust-deep': '#c8553d', '--cyan': '#8aff5a', '--plum': '#e8d8a8',
  '--frame-bg': 'rgba(184, 138, 58, 0.08)', '--frame-edge': 'rgba(232, 200, 118, 0.40)',
  '--k-now': '#ff6450', '--k-cal-grid': 'rgba(184, 138, 58, 0.16)', '--k-cal-today': 'rgba(240, 184, 80, 0.06)', '--k-term-border': '#3a2a0e',
  '--k-clock-bezel': '#0a0805', '--k-clock-face': '#0d0a06', '--k-clock-face-edge': 'rgba(232, 200, 118, 0.25)', '--k-clock-track': '#1c140c',
  '--k-clock-tick-major': '#e8d8a8', '--k-clock-tick-minor': '#5a4a30', '--k-clock-num': '#e8d8a8',
  '--k-clock-hand': '#f0b850', '--k-clock-readout': '#a8956a',
});

const xt = (background: string, foreground: string, cursor: string): XtermColors => ({ background, foreground, cursor, cursorAccent: background });

/** Bundled fonts (Fontsource packages) — loaded on demand per style (F10). */
const fonts = {
  vt323: () => import('@fontsource/vt323/400.css'),
  stencil: () => Promise.all([import('@fontsource/stardos-stencil/400.css'), import('@fontsource/stardos-stencil/700.css')]),
  pixel: () => Promise.all([import('@fontsource/pixelify-sans/400.css'), import('@fontsource/pixelify-sans/700.css')]),
};

export const MANIFESTS: Record<FrameStyleId, ThemeManifest> = {
  classic: legacy(),
  pro: PRO,
  synthesizer: {
    tokens: { light: CLASSIC_K, dark: SYNTH_DARK },
    components: {
      pomo: { face: 'vu' },
      clock: { bezel: 'metal', hand: 'line', readoutWindow: true },
      terminal: { xterm: { light: CLASSIC_XTERM, dark: xt('#100d0a', '#ece4d0', '#c9f158') } },
    },
    slots: { panelToggles: 'topbar' },
  },
  telemetry: {
    tokens: { light: CLASSIC_K, dark: TELEMETRY_DARK },
    loadFonts: fonts.vt323,
    components: {
      pomo: { face: 'lcd' },
      clock: { bezel: 'line', hand: 'line', readoutWindow: true },
      terminal: { xterm: { light: CLASSIC_XTERM, dark: xt('#050503', '#b9d98a', '#c9f158') } },
    },
    slots: { panelToggles: 'topbar' },
  },
  'krnl-dock': {
    tokens: { dark: KRNL_DOCK_DARK },
    loadFonts: () => Promise.all([fonts.vt323(), fonts.stencil()]),
    components: {
      pomo: { face: 'lcd' },
      clock: { bezel: 'metal', hand: 'line', readoutWindow: true },
      terminal: { xterm: { dark: CLASSIC_XTERM } },
    },
    slots: { panelToggles: 'topbar' },
  },
  blueprint: {
    tokens: { light: BLUEPRINT_LIGHT, dark: BLUEPRINT_DARK },
    components: {
      pomo: { face: 'outline' },
      clock: { bezel: 'line', hand: 'line', readoutWindow: false },
      terminal: { xterm: { light: xt('#f0e6cc', '#1f2a3a', '#5e7d1d'), dark: xt('#0c1a2e', '#d8eaff', '#f1c463') } },
    },
    slots: { panelToggles: 'topbar' },
  },
  macintosh: {
    tokens: { light: MAC_LIGHT, dark: MAC_DARK },
    loadFonts: fonts.pixel,
    components: {
      pomo: { face: 'ascii' },
      clock: { bezel: 'pixel', hand: 'block', readoutWindow: true },
      terminal: { xterm: { light: xt('#fffbe8', '#050505', '#050505'), dark: xt('#0a0807', '#f5efde', '#f5efde') } },
    },
    slots: { panelToggles: 'topbar' },
  },
  submarine: {
    tokens: { dark: SUBMARINE_DARK },
    loadFonts: fonts.vt323,
    components: {
      pomo: { face: 'lcd' },
      clock: { bezel: 'brass', hand: 'sword', readoutWindow: true },
      terminal: { xterm: { dark: xt('#050803', '#8aff5a', '#f0b850') } },
    },
    slots: { panelToggles: 'topbar' },
  },
};
