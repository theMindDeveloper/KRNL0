/**
 * dropImage.ts â€” drag-drop and replace image ingestion (Decision 21).
 *
 * Pipeline:
 *   File â†’ validate MIME/size â†’ measure natural dimensions in the renderer
 *   via `new Image()` â†’ ship bytes to main as Uint8Array â†’ main writes the
 *   asset to disk and returns the assetId. Caller decides whether to create
 *   a new node or dispatch image.setAsset on an existing one.
 *
 * No base64 anywhere. Renderer never touches `fs`.
 */

const ALLOWED_MIME = new Set<string>([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
]);

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

export interface IngestedImage {
  assetId: string;
  naturalWidth: number;
  naturalHeight: number;
  mimeType: string;
  alt: string;
  ext: string;
}

/**
 * Measure natural width/height via an offscreen <img>. SVGs without an
 * intrinsic size report 0Ã—0 in some browsers â€” we fall back to 300Ã—300 in
 * that case so the placeholder size is sensible.
 */
function measureNatural(file: File): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || 300;
      const h = img.naturalHeight || 300;
      URL.revokeObjectURL(url);
      resolve({ w, h });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ w: 300, h: 300 });
    };
    img.src = url;
  });
}

/**
 * Validate, measure, and persist the file. Returns null if validation fails
 * (caller should treat as "skip this file"). Throws only on unexpected IPC
 * failures.
 */
export async function ingestImageFile(file: File): Promise<IngestedImage | null> {
  if (!ALLOWED_MIME.has(file.type)) {
    console.warn('[image] rejected: unsupported mime', file.type);
    return null;
  }
  if (file.size === 0 || file.size > MAX_BYTES) {
    console.warn('[image] rejected: bad size', file.size);
    return null;
  }

  const ext = EXT_BY_MIME[file.type];
  if (!ext) return null;

  const { w, h } = await measureNatural(file);
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);

  if (!window.krnl?.assetWrite) {
    console.warn('[image] krnl.assetWrite unavailable â€” cannot persist');
    return null;
  }
  const { assetId } = await window.krnl.assetWrite(ext, bytes);

  const baseName = file.name.replace(/\.[^.]+$/, '');
  return {
    assetId,
    naturalWidth: w,
    naturalHeight: h,
    mimeType: file.type,
    alt: baseName,
    ext,
  };
}

export function initialDisplaySize(
  naturalWidth: number,
  naturalHeight: number,
): { width: number; height: number } {
  const w = Math.min(480, naturalWidth);
  const h = Math.round((naturalHeight / naturalWidth) * w);
  return { width: w, height: h };
}
