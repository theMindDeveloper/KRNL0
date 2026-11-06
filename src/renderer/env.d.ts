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
  boardReset: () => Promise<unknown>
  boardSaveViewport: (viewport: { x: number; y: number; zoom: number }) => Promise<void>
  ptyCreate: (cols: number, rows: number, shell?: string) => Promise<{ sessionId: string; motd: string }>
  ptyWrite: (sessionId: string, data: string) => Promise<void>
  ptyResize: (sessionId: string, cols: number, rows: number) => Promise<void>
  ptyKill: (sessionId: string) => Promise<void>
  onPtyData: (sessionId: string, callback: (data: string) => void) => () => void
  onPtyExit: (sessionId: string, callback: () => void) => () => void
  // Asset persistence (Decision 21)
  assetWrite: (ext: string, bytes: Uint8Array) => Promise<KrnlAssetWriteResult>
  assetPathOf?: (file: File) => string | null
  assetImportPath?: (path: string) => Promise<KrnlAssetWriteResult>
  assetRead: (assetId: string) => Promise<KrnlAssetReadResult | null>
  assetDelete: (assetId: string) => Promise<void>
  onBoardChanged: (callback: () => void) => () => void
  // Phase 2: cli:dispatch
  onCliDispatch?: (callback: (id: string, command: string, args: Record<string, unknown>) => void) => () => void
  cliDispatchReply?: (id: string, ok: boolean, message: string) => void
  // Clipboard via main (replaces navigator.clipboard in TerminalNode)
  clipboardReadText: () => Promise<string>
  clipboardWriteText: (text: string) => Promise<void>
  sysRun?: (argv: string[]) => Promise<{ ok: boolean; message: string }>
  // Decision 35 — durable time log. Use renderer/store/timeLog.ts
  // (logTime / queryTimeLog), not these directly.
  timelogAppend?: (entries: unknown[]) => Promise<{ ok: boolean; written: number }>
  timelogQuery?: (fromYMD: string, toYMD: string) => Promise<unknown[]>
  // Decision 36 — app updates. Use renderer/store/updateStore.ts, not these directly.
  updateGetState?: () => Promise<unknown>
  updateCheck?: () => Promise<unknown>
  updateInstall?: () => Promise<{ ok: boolean; message: string }>
  updateOpenRelease?: () => Promise<{ ok: boolean; message: string }>
  onUpdateState?: (callback: (state: unknown) => void) => () => void
  // Decision 37 — pocket timer. Use renderer/pocket/*, not these directly.
  pocketSendState?: (snapshot: unknown) => void
  onPocketRun?: (callback: (command: string, args?: unknown) => void) => () => void
  pocketGet?: () => Promise<unknown>
  onPocketSnapshot?: (callback: (snapshot: unknown) => void) => () => void
  onPocketPrefs?: (callback: (prefs: unknown) => void) => () => void
  pocketCommand?: (command: string, args?: unknown) => Promise<{ ok: boolean; message: string }>
  pocketOpenMain?: () => void
  pocketCollapse?: (collapsed: boolean) => void
  pocketResize?: (size: { width: number; height: number }) => void
  onPocketHover?: (callback: (over: boolean) => void) => () => void
  pocketLookSet?: (look: string) => Promise<{ ok: boolean; message: string }>
  pocketSettingsGet?: () => Promise<unknown>
  pocketSettingsSet?: (on: boolean) => Promise<{ ok: boolean; message: string }>
  // Decision 38 — launch experience. Use renderer/launch/*, not these directly.
  appLaunch?: () => Promise<unknown>
  appPrefsSet?: (patch: unknown) => Promise<unknown>
  appBackupsOpen?: () => Promise<{ ok: boolean; message: string }>
  appOpenExternal?: (url: string) => Promise<{ ok: boolean; message: string }>
}

interface Window {
  krnl?: KrnlBridge
}

// Vite `?url` imports (e.g. the pdf.js worker) resolve to a URL string.
declare module '*?url' {
  const src: string;
  export default src;
}

/** App version from package.json, injected by electron-vite `define`. */
declare const __APP_VERSION__: string | undefined;

// Images imported as URLs (Vite asset handling).
declare module '*.webp' {
  const src: string;
  export default src;
}
