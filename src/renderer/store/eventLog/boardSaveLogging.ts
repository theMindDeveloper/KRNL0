/**
 * boardSaveLogging — monkey-wrap `window.krnl.boardSave` once at boot so
 * every successful save emits a `board.saved` entry. Avoids editing the
 * 30+ call sites that currently invoke boardSave.
 *
 * The wrap is idempotent and degrades gracefully if the preload bridge
 * isn't present (e.g. in tests).
 */

import { emit } from './emit';

let _installed = false;

interface KrnlBridge {
  boardSave: (data: unknown) => Promise<void>;
  [k: string]: unknown;
}

interface MaybeWindow {
  krnl?: KrnlBridge;
}

export function installBoardSaveLogging(): void {
  if (_installed) return;
  if (typeof window === 'undefined') return;
  const w = window as unknown as MaybeWindow;
  const bridge = w.krnl;
  if (!bridge || typeof bridge.boardSave !== 'function') return;
  _installed = true;

  // contextBridge.exposeInMainWorld freezes the bridge object — we can't
  // mutate `bridge.boardSave` in place. Instead, replace `window.krnl` with
  // a new mutable wrapper that proxies every other key through to the frozen
  // original and overrides boardSave with the logging variant.
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
    get(target, prop) {
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
    // Window.krnl is non-configurable in this environment — fall back to
    // emitting via a second IPC listener path. The save itself still works
    // through the original bridge; we just won't log board.saved entries.
    _installed = false;
  }
}
