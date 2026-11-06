// Startup splash controller (launch-experience.md F1–F3).
//
// The splash itself is plain HTML in index.html so it paints before any
// script loads. This fills in what is really happening — the board loading,
// the backup after an update, the canvas opening — and removes it the moment
// the board is on screen. It never waits for show: the only hold is for a
// simulated launch (KRNL0_SIMULATE_*), so a preview can be looked at.

import cubeOpen from './assets/launch/cube-open.webp';
import type { LaunchInfo } from '../shared/appState';

const SEGMENTS = 30;
/** A simulated launch holds the splash this long so it can be seen. */
const PREVIEW_HOLD_MS = 2600;

type StepState = 'wait' | 'ok';

let removed = false;
let holdUntil = 0;
let pendingHide: ReturnType<typeof setTimeout> | null = null;

const el = (id: string): HTMLElement | null => document.getElementById(id);

function setProgress(fraction: number): void {
  const bar = el('bs-bar');
  if (!bar) return;
  const on = Math.round(Math.max(0, Math.min(1, fraction)) * SEGMENTS);
  Array.from(bar.children).forEach((seg, i) => seg.classList.toggle('on', i < on));
  bar.setAttribute('aria-valuenow', String(Math.round(fraction * 100)));
  const t = el('bs-time');
  if (t) t.textContent = `${(performance.now() / 1000).toFixed(1)} s`;
}

/** Add or update one line of the checklist. */
export function splashStep(id: string, label: string, state: StepState, value?: string, before?: string): void {
  const list = el('bs-steps');
  if (!list || removed) return;
  let row = list.querySelector<HTMLElement>(`[data-step="${id}"]`);
  if (!row) {
    row = document.createElement('div');
    row.className = 'bs-step';
    row.dataset['step'] = id;
    row.innerHTML = '<i>›</i><b></b><u></u><em></em>';
    const anchor = before ? list.querySelector(`[data-step="${before}"]`) : null;
    list.insertBefore(row, anchor);
  }
  const b = row.querySelector('b');
  const em = row.querySelector('em');
  if (b) b.textContent = label;
  if (em) {
    em.textContent = state === 'ok' ? (value ?? 'ok') : '···';
    em.className = state === 'wait' ? 'wait' : '';
  }
}

function shortPath(dir: string): string {
  const home = /^(?:[A-Za-z]:)?[\\/](?:Users|home)[\\/][^\\/]+/.exec(dir);
  return (home ? `~${dir.slice(home[0].length)}` : dir).replace(/\\/g, '/');
}

/** Launch info arrived: version, backup and the board folder. */
export function splashLaunch(info: LaunchInfo): void {
  if (removed) return;
  if (info.simulated) holdUntil = performance.now() + PREVIEW_HOLD_MS;
  const kicker = el('bs-kicker');
  const updated = info.previousVersion !== null && (info.kind === 'feature' || info.kind === 'patch');
  if (kicker) {
    kicker.textContent = updated
      ? `◆ Updated · ${info.previousVersion ?? ''} → ${info.version}`
      : `◆ Booting · v${info.version}`;
  }
  const path = el('bs-path');
  if (path) path.textContent = shortPath(info.backupDir.replace(/[\\/]backups$/, ''));
  if (updated) {
    const cube = el('bs-cube') as HTMLImageElement | null;
    if (cube) cube.src = cubeOpen;
    if (info.backupFile) splashStep('backup', 'backup saved', 'ok', 'board copied', 'board');
    const what = el('bs-what');
    if (what) what.textContent = `getting your board ready for ${info.version}`;
  }
  setProgress(0.2);
}

/** The board is loaded: show what is on it. */
export function splashBoard(counts: { mothers: number; nodes: number; wires: number }): void {
  splashStep('board', 'board.json', 'ok');
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  splashStep('counts', `${plural(counts.mothers, 'mother')} · ${plural(counts.nodes, 'node')} · ${plural(counts.wires, 'wire')}`, 'ok');
  splashStep('canvas', 'canvas', 'wait');
  setProgress(0.66);
}

/** The canvas painted: finish and fade out. */
export function hideSplash(): void {
  if (removed || pendingHide) return;
  splashStep('canvas', 'canvas', 'ok');
  setProgress(1);
  const wait = Math.max(120, holdUntil - performance.now());
  pendingHide = setTimeout(removeNow, wait);
}

/** Remove at once (load error, or a view that never shows the board). */
export function removeNow(): void {
  if (removed) return;
  removed = true;
  const root = el('boot-splash');
  if (!root) return;
  root.classList.add('is-out');
  setTimeout(() => root.remove(), 260);
}
