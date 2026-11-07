// Pocket timer (Decision 37, docs/06-requirements/pocket-timer.md): the Pomo
// node in a small always-on-top window. Shared by main (window + prefs), the
// renderer (snapshot sender and the pocket view) and the CLI (`krnl mini`).
// Pure: no Electron, no DOM.

import type { PomoConfig, PomoState, TimerFace } from '../renderer/components/nodes/PomoNode/types';
import type { TagDef } from './tags/taxonomy';

/** The box look's width. Every look measures itself; the window follows (within the limits below). */
export const POCKET_WIDTH = 304;
export const POCKET_COLLAPSED_HEIGHT = 48;
export const POCKET_MAX_HEIGHT = 520;
export const POCKET_MIN_SIZE = 40;
export const POCKET_MAX_WIDTH = 420;

/**
 * How the floating timer looks (pocket-timer.md F12): a round dial (the
 * default), a capsule like the 0 in the logo, or the Pomo node as a box.
 */
export type PocketLook = 'dial' | 'capsule' | 'box';
export const POCKET_LOOKS: readonly PocketLook[] = ['dial', 'capsule', 'box'];
export const POCKET_LOOK_LABEL: Record<PocketLook, string> = { dial: 'Dial', capsule: 'Capsule', box: 'Box' };

export function isPocketLook(v: unknown): v is PocketLook {
  return v === 'dial' || v === 'capsule' || v === 'box';
}

/** The window's first size for a look, before the view has measured itself. */
export function initialPocketSize(look: PocketLook, collapsed: boolean): { width: number; height: number } {
  if (look === 'dial') return collapsed ? { width: 60, height: 108 } : { width: 200, height: 200 };
  if (look === 'capsule') return { width: 280, height: 72 };
  return collapsed ? { width: POCKET_WIDTH, height: POCKET_COLLAPSED_HEIGHT } : { width: POCKET_WIDTH, height: 260 };
}

/** Clamp a size the view reports. */
export function clampPocketSize(w: number, h: number): { width: number; height: number } {
  const c = (v: number, lo: number, hi: number) => Math.round(Math.min(hi, Math.max(lo, v)));
  return { width: c(w, POCKET_MIN_SIZE, POCKET_MAX_WIDTH), height: c(h, POCKET_MIN_SIZE, POCKET_MAX_HEIGHT) };
}

export interface PocketPrefs {
  /** Settings → Floating timer (F9). */
  enabled: boolean;
  /** Smallest form: a line (box), a docked tab (dial). The capsule is always small (F6). */
  collapsed: boolean;
  /** Dial (default), capsule or box (F12). */
  look: PocketLook;
  /** Last top-left position in screen coordinates; null until the user moves it. */
  x: number | null;
  y: number | null;
}

export const DEFAULT_POCKET_PREFS: PocketPrefs = { enabled: true, collapsed: false, look: 'dial', x: null, y: null };

/** Tolerant read of userData/pocket.json — a bad file falls back to the defaults. */
export function parsePocketPrefs(raw: unknown): PocketPrefs {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_POCKET_PREFS };
  const r = raw as Record<string, unknown>;
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null);
  return {
    enabled: typeof r['enabled'] === 'boolean' ? r['enabled'] : DEFAULT_POCKET_PREFS.enabled,
    collapsed: typeof r['collapsed'] === 'boolean' ? r['collapsed'] : DEFAULT_POCKET_PREFS.collapsed,
    look: isPocketLook(r['look']) ? r['look'] : DEFAULT_POCKET_PREFS.look,
    x: num(r['x']),
    y: num(r['y']),
  };
}

/** What the main window sends the pocket: the Pomo mother, and what it needs to look the same. */
export interface PocketSnapshot {
  nodeId: string;
  state: PomoState;
  config: PomoConfig;
  /** Easy mode is always Observe. */
  easy: boolean;
  /** The node is asking about time it couldn't see (F11). */
  away: boolean;
  /** Tag colours for Observe's day strip. */
  library: TagDef[];
  /** The timer face the node shows (the user's or the frame style's default). */
  face: TimerFace;
  /** `data-*` attributes and inline style of the main window's <html>, so tokens resolve the same. */
  root: { attrs: Record<string, string>; style: string };
}

/** The node is timing something: a work span, a paused one, or a break. */
export function isPocketLive(status: PomoState['status'] | undefined): boolean {
  return status === 'running' || status === 'paused' || status === 'break';
}

/** F1 / F9 / F10: when the pocket window should be on screen. */
export function shouldShowPocket(args: {
  prefs: PocketPrefs;
  live: boolean;
  /** The main window is minimised (or hidden). */
  mainMinimized: boolean;
  /** `krnl mini show` asked for it while a session runs. */
  forced: boolean;
}): boolean {
  const { prefs, live, mainMinimized, forced } = args;
  if (!prefs.enabled || !live) return false;
  return mainMinimized || forced;
}

export interface PocketRect { x: number; y: number; width: number; height: number }

/**
 * F7: keep the window on a visible display. A position inside some work area
 * stays (nudged fully inside it); anything else moves into the nearest one.
 * With no saved position it goes to the top-right of the first work area.
 */
export function clampPocketPosition(
  pos: { x: number | null; y: number | null },
  size: { width: number; height: number },
  areas: readonly PocketRect[],
  margin = 24,
): { x: number; y: number } {
  const first = areas[0] ?? { x: 0, y: 0, width: 1280, height: 800 };
  if (pos.x === null || pos.y === null) {
    return { x: first.x + first.width - size.width - margin, y: first.y + margin };
  }
  const cx = pos.x + size.width / 2;
  const cy = pos.y + size.height / 2;
  const dist = (a: PocketRect): number => {
    const dx = Math.max(a.x - cx, 0, cx - (a.x + a.width));
    const dy = Math.max(a.y - cy, 0, cy - (a.y + a.height));
    return dx * dx + dy * dy;
  };
  const area = areas.length > 0 ? [...areas].sort((a, b) => dist(a) - dist(b))[0]! : first;
  const x = Math.min(Math.max(pos.x, area.x), area.x + area.width - size.width);
  const y = Math.min(Math.max(pos.y, area.y), area.y + area.height - size.height);
  return { x: Math.round(x), y: Math.round(y) };
}

export interface PocketStatus {
  enabled: boolean;
  visible: boolean;
  collapsed: boolean;
  look: PocketLook;
  /** The Pomo node is timing something. */
  live: boolean;
}

/** The running app's pocket, for `krnl mini` (injected into SysFacade like the updater). */
export interface PocketPort {
  status(): PocketStatus;
  show(): { ok: boolean; message: string };
  hide(): { ok: boolean; message: string };
  setEnabled(on: boolean): { ok: boolean; message: string };
  setLook(look: PocketLook): { ok: boolean; message: string };
}

export function describePocketStatus(s: PocketStatus): string {
  if (!s.enabled) return 'Floating timer is off.';
  const where = s.visible ? 'showing' : 'hidden';
  const what = s.live ? 'a session is running' : 'nothing is being timed';
  return `Floating timer is on (${POCKET_LOOK_LABEL[s.look].toLowerCase()}) · ${where}${s.collapsed ? ' (collapsed)' : ''} · ${what}.`;
}
