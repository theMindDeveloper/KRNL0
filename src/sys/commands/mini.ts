// `krnl mini status|show|hide|on|off` — the floating pocket timer (Decision 37,
// docs/06-requirements/pocket-timer.md F10). Thin: the running app's pocket
// does the work; this only formats its answers.

import { POCKET_LOOKS, describePocketStatus, isPocketLook, type PocketPort } from '../../shared/pocket';
import type { SysResult } from '../SysFacade';

export function miniStatus(pocket: PocketPort, json = false): SysResult {
  const s = pocket.status();
  return json ? { ok: true, message: JSON.stringify(s), data: s } : { ok: true, message: describePocketStatus(s), data: s };
}

export function miniShow(pocket: PocketPort): SysResult {
  return pocket.show();
}

export function miniHide(pocket: PocketPort): SysResult {
  return pocket.hide();
}

export function miniSetEnabled(pocket: PocketPort, on: boolean): SysResult {
  return pocket.setEnabled(on);
}

/** `krnl mini look <dial|capsule|box>` — without a value, says the current look (F12). */
export function miniLook(pocket: PocketPort, look: string | undefined): SysResult {
  if (look === undefined) return { ok: true, message: `Floating timer look: ${pocket.status().look}. Choose: ${POCKET_LOOKS.join(' | ')}`, data: { look: pocket.status().look } };
  if (!isPocketLook(look)) return { ok: false, message: `Unknown look "${look}". Choose: ${POCKET_LOOKS.join(' | ')}` };
  return pocket.setLook(look);
}
