/**
 * emit() — one-line helper that pushes an EventEntry into the store and
 * (in dev) mirrors errors/warns to the DevTools console so developers see
 * them without opening a UI panel. Never throws — logging must not break
 * the host action.
 */

import { useEventLog } from './store';
import type { EventKind, EventSeverity } from './types';

const isDev =
  typeof process !== 'undefined' &&
  typeof process.env !== 'undefined' &&
  process.env['NODE_ENV'] !== 'production';

export function emit(
  kind: EventKind,
  text: string,
  opts?: { severity?: EventSeverity; refId?: string },
): void {
  try {
    useEventLog.getState().push({
      kind,
      severity: opts?.severity ?? 'ok',
      text,
      ...(opts?.refId !== undefined ? { refId: opts.refId } : {}),
    });
  } catch {
    // Logging must never break the host. Swallow.
  }

  // Dev-mode console mirror — errors/warns surface in DevTools so the
  // developer sees them without opening the in-app log panel.
  if (isDev) {
    try {
      const sev = opts?.severity ?? 'ok';
      const tag = `[krnl:${kind}]`;
      if (sev === 'err') {
        // eslint-disable-next-line no-console
        console.error(tag, text);
      } else if (sev === 'warn') {
        // eslint-disable-next-line no-console
        console.warn(tag, text);
      }
    } catch {
      // ignore
    }
  }
}
