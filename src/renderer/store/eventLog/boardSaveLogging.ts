/**
 * boardSaveLogging — instrumentation around `window.krnl.boardSave`.
 *
 * Two entry points coexist:
 *
 *   1. `installBoardSaveLogging()` — boot-time installer that proxies the
 *      preload bridge so EVERY caller of `window.krnl.boardSave()` gets a
 *      `board.saved` / `sys.error` event-log entry automatically. Used by
 *      `index.tsx` so legacy code paths keep working.
 *
 *   2. `saveBoard(data)` — typed helper that callers import directly. It
 *      routes through the (proxied) bridge so a single logging path covers
 *      both styles. Returns a promise that resolves on success.
 *
 * The Proxy wrapping is necessary because `contextBridge.exposeInMainWorld`
 * freezes the exposed object in Electron's contextIsolation mode — a direct
 * assignment to `bridge.boardSave` throws
 * "TypeError: Cannot assign to read only property 'boardSave'".
 */

import { emit } from './emit';

interface KrnlBridge {
  boardSave?: (data: unknown) => Promise<void>;
  [k: string]: unknown;
}

interface MaybeWindow {
  krnl?: KrnlBridge;
}

let _installed = false;

/**
 * Wrap `window.krnl.boardSave` so every save fires a `board.saved` log
 * entry on success (or `sys.error` on failure). Idempotent — calling twice
 * is a no-op.
 */
export function installBoardSaveLogging(): void {
  if (_installed) return;
  if (typeof window === 'undefined') return;
  const w = window as unknown as MaybeWindow;
  const bridge = w.krnl;
  if (!bridge || typeof bridge.boardSave !== 'function') return;
  _installed = true;

  // contextBridge.exposeInMainWorld freezes the bridge object — we can't
  // mutate `bridge.boardSave` in place. Instead, replace `window.krnl` with
  // a Proxy that overrides boardSave with the logging variant and forwards
  // every other key through to the frozen original.
  const original = bridge.boardSave.bind(bridge);
  const wrappedBoardSave = (data: unknown) =>
    original(data)
      .then((res) => {
        emit('board.saved', 'board saved', { severity: 'info' });
        return res;
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        emit('sys.error', `board save failed: ${msg}`, { severity: 'err' });
        throw err;
      });

  const wrapper: KrnlBridge = new Proxy({ ...bridge } as KrnlBridge, {
    get(_target, prop) {
      if (prop === 'boardSave') return wrappedBoardSave;
      const v = (bridge as unknown as Record<PropertyKey, unknown>)[prop as PropertyKey];
      return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(bridge) : v;
    },
  });

  try {
    Object.defineProperty(window, 'krnl', {
      value: wrapper,
      writable: true,
      configurable: true,
    });
  } catch {
    // Window.krnl is non-configurable in this environment — keep the
    // original bridge; saveBoard() below still calls boardSave but won't
    // benefit from auto-logging.
    _installed = false;
  }
}

/**
 * Persist a board through the preload bridge.
 *
 * Routes through `window.krnl.boardSave` (which, after
 * `installBoardSaveLogging()`, already emits `board.saved` /
 * `sys.error`). No double-logging — this helper just resolves the bridge,
 * awaits it, and rethrows. Silently no-ops in non-Electron contexts.
 */
export async function saveBoard(data: unknown): Promise<void> {
  if (typeof window === 'undefined') return;
  const bridge = (window as unknown as MaybeWindow).krnl;
  if (!bridge?.boardSave) return;
  await bridge.boardSave(data);
}
