// `krnl update status|check|install|open` — app updates (Decision 36,
// docs/06-requirements/app-updates.md F6). Thin: the running app's
// UpdateService does the work; this only formats its answers.

import { describeUpdateState } from '../../shared/update';
import type { UpdateState, UpdaterPort } from '../../shared/update';
import type { SysResult } from '../SysFacade';

function nextStep(s: UpdateState): string | null {
  if (s.status === 'ready') return 'Run "krnl update install" to restart into it (or it installs when you quit).';
  if (s.status === 'available' && s.mode === 'notify') return 'Run "krnl update install" to open the download page.';
  if (s.status === 'downloading') return 'It installs on the next restart once the download finishes.';
  return null;
}

function render(s: UpdateState, json: boolean): SysResult {
  if (json) return { ok: true, message: JSON.stringify(s), data: s };
  const lines = [`KRNL0 v${s.currentVersion} — ${describeUpdateState(s)}`];
  if (s.releaseUrl && (s.status === 'available' || s.status === 'ready' || s.status === 'downloading')) {
    lines.push(`What's new: ${s.releaseUrl}`);
  }
  const hint = nextStep(s);
  if (hint) lines.push(hint);
  return { ok: true, message: lines.join('\n'), data: s };
}

export async function updateStatus(updater: UpdaterPort, json = false): Promise<SysResult> {
  return render(updater.state(), json);
}

export async function updateCheck(updater: UpdaterPort, json = false): Promise<SysResult> {
  const s = await updater.check();
  if (s.status === 'disabled') return { ok: false, message: describeUpdateState(s), data: s };
  const result = render(s, json);
  // A failed check is a failed command (exit 1), so scripts can tell.
  return s.status === 'error' ? { ...result, ok: false } : result;
}

export async function updateInstall(updater: UpdaterPort): Promise<SysResult> {
  const r = await updater.install();
  return { ok: r.ok, message: r.message };
}

export async function updateOpen(updater: UpdaterPort): Promise<SysResult> {
  const r = await updater.openRelease();
  return { ok: r.ok, message: r.message };
}
