// Store a dropped media file (video / audio / PDF) in the asset store.
// Kept apart from dropMedia.ts, which is pure and shared with the sys CLI.

import { fileExt } from './dropMedia';

/** Store a dropped media file in the asset store; returns its asset id. */
export async function ingestMediaFile(file: File): Promise<string | null> {
  if (!window.krnl?.assetWrite) return null;
  // Fast path: a file from disk is copied by main (no bytes over IPC).
  const path = window.krnl.assetPathOf?.(file);
  if (path && window.krnl.assetImportPath) {
    try {
      const { assetId } = await window.krnl.assetImportPath(path);
      return assetId;
    } catch (err) {
      console.warn('[media] path import failed, falling back to bytes', err);
    }
  }
  const ext = fileExt(file.name) || (file.type === 'application/pdf' ? 'pdf' : 'bin');
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { assetId } = await window.krnl.assetWrite(ext, bytes);
    return assetId;
  } catch (err) {
    console.warn('[media] could not store', file.name, err);
    return null;
  }
}
