export interface ImageState {
  assetId: string | null;
  naturalWidth: number | null;
  naturalHeight: number | null;
  mimeType: string | null;
  alt?: string;
  width?: number;
  height?: number;
  // Legacy field tolerated for old boards; never written by new code.
  src?: string | null;
}

export interface ImageConfig {
  width?: number;
}
