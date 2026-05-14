// Vite injects import.meta.env at build time. Extend ImportMeta so TypeScript
// knows the shape. Only the fields we actually use are declared here.
interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly MODE: string;
  readonly VITE_CLOCK_DEBUG?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface KrnlAssetWriteResult {
  assetId: string
  ext: string
}

interface KrnlAssetReadResult {
  bytes: Uint8Array
  mimeType: string
}

interface KrnlBridge {
  boardLoad: () => Promise<unknown>
  boardSave: (data: unknown) => Promise<void>
  boardSaveViewport: (viewport: { x: number; y: number; zoom: number }) => Promise<void>
  ptyCreate: (cols: number, rows: number) => Promise<string>
  ptyWrite: (sessionId: string, data: string) => Promise<void>
  ptyResize: (sessionId: string, cols: number, rows: number) => Promise<void>
  ptyKill: (sessionId: string) => Promise<void>
  onPtyData: (sessionId: string, callback: (data: string) => void) => () => void
  onPtyExit: (sessionId: string, callback: () => void) => () => void
  // Asset persistence (Decision 21)
  assetWrite: (ext: string, bytes: Uint8Array) => Promise<KrnlAssetWriteResult>
  assetRead: (assetId: string) => Promise<KrnlAssetReadResult | null>
  assetDelete: (assetId: string) => Promise<void>
  onBoardChanged: (callback: () => void) => () => void
}

interface Window {
  krnl?: KrnlBridge
}
