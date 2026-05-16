/**
 * Global error capture for the renderer.
 *
 * Wires `window.error` and `unhandledrejection` into the event log as
 * `sys.error` entries so genuine UI exceptions surface in the in-app
 * log (and in DevTools via emit's dev mirror) instead of vanishing.
 *
 * Idempotent — calling installGlobalErrorCapture() more than once is a no-op.
 */

import { emit } from './emit';

let _installed = false;

const MAX_LEN = 120;

function clip(s: string): string {
  return s.length > MAX_LEN ? `${s.slice(0, MAX_LEN - 1)}…` : s;
}

export function installGlobalErrorCapture(): void {
  if (_installed) return;
  if (typeof window === 'undefined') return;
  _installed = true;

  window.addEventListener('error', (ev) => {
    const msg = ev?.message ?? 'unknown error';
    const where = ev?.filename ? ` @ ${ev.filename.split('/').pop()}:${ev.lineno ?? '?'}` : '';
    emit('sys.error', clip(`uncaught: ${msg}${where}`), { severity: 'err' });
  });

  window.addEventListener('unhandledrejection', (ev) => {
    const reason = ev?.reason;
    const msg =
      reason instanceof Error
        ? reason.message
        : typeof reason === 'string'
          ? reason
          : (() => {
              try { return JSON.stringify(reason); } catch { return String(reason); }
            })();
    emit('sys.error', clip(`unhandled rejection: ${msg}`), { severity: 'err' });
  });
}
