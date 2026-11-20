// Where a stored picture or file can be loaded from (Decision 21, Decision 51).
//   Desktop app: the krnl-asset:// protocol main serves from the asset folder.
//   Web app:     a blob: URL made from this browser's own copy (IndexedDB),
//                fetched from the server first when the browser has none yet.
// The web has no krnl-asset:// (and the server's CSP allows images and media
// from itself, data: and blob: only).

import { useEffect, useState } from 'react';
import { IS_WEB } from '../platform';

const loading = new Map<string, Promise<string | null>>();
const ready = new Map<string, string>();

/** The desktop protocol address (lower case: the protocol's host part). */
export const desktopAssetUrl = (id: string): string => `krnl-asset://${id}`;

/** An address for the asset, or null when neither this browser nor the server has it. */
export function loadAssetUrl(id: string): Promise<string | null> {
  if (!IS_WEB) return Promise.resolve(desktopAssetUrl(id));
  const hit = ready.get(id);
  if (hit) return Promise.resolve(hit);
  let p = loading.get(id);
  if (!p) {
    p = (async () => {
      const a = await window.krnl?.assetRead(id).catch(() => null);
      if (!a) return null;
      const url = URL.createObjectURL(new Blob([a.bytes as BlobPart], { type: a.mimeType }));
      ready.set(id, url);
      return url;
    })().finally(() => { loading.delete(id); });
    loading.set(id, p);
  }
  return p;
}

const RETRY_MS = 3000;
const RETRIES = 10;

/**
 * The address to show an asset with. `url` is null while it loads; `missing`
 * when it could not be found (it may still be on its way from another device:
 * the web app tries again for half a minute).
 */
export function useAssetUrl(id: string | null | undefined, desktopUrl: (id: string) => string = desktopAssetUrl): { url: string | null; missing: boolean } {
  const [state, setState] = useState<{ id: string | null; url: string | null; missing: boolean }>(() => ({
    id: id ?? null,
    url: !id ? null : IS_WEB ? ready.get(id) ?? null : desktopUrl(id),
    missing: false,
  }));

  useEffect(() => {
    if (!id) { setState({ id: null, url: null, missing: false }); return; }
    if (!IS_WEB) { setState({ id, url: desktopUrl(id), missing: false }); return; }
    let live = true;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const attempt = (): void => {
      void loadAssetUrl(id).then((url) => {
        if (!live) return;
        if (url) { setState({ id, url, missing: false }); return; }
        if (++tries >= RETRIES) { setState({ id, url: null, missing: true }); return; }
        timer = setTimeout(attempt, RETRY_MS);
      });
    };
    setState((s) => (s.id === id && s.url ? s : { id, url: ready.get(id) ?? null, missing: false }));
    attempt();
    return () => { live = false; if (timer) clearTimeout(timer); };
    // desktopUrl is a pure formatter; a new function each render must not reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return state.id === (id ?? null) ? { url: state.url, missing: state.missing } : { url: null, missing: false };
}
