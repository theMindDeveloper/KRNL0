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

  const original = bridge.boardSave.bind(bridge);
  bridge.boardSave = (data: unknown) =>
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
}
