// Store a dropped media file (video / audio / PDF) in the asset store.
// Kept apart from dropMedia.ts, which is pure and shared with the sys CLI.

import { fileExt } from './dropMedia';

/** Store a dropped media file in the asset store; returns its asset id. */
export async function ingestMediaFile(file: File): Promise<string | null> {
  if (!window.krnl?.assetWrite) return null;
  const ext = fileExt(file.name) || (file.type === 'application/pdf' ? 'pdf' : '');
  if (!ext) return null;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { assetId } = await window.krnl.assetWrite(ext, bytes);
    return assetId;
  } catch (err) {
    console.warn('[media] could not store', file.name, err);
    return null;
  }
}
