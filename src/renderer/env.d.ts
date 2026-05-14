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
  ptyCreate: (cols: number, rows: number) => Promise<{ sessionId: string; motd: string }>
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
  // Phase 2: cli:dispatch
  onCliDispatch?: (callback: (id: string, command: string, args: Record<string, unknown>) => void) => () => void
  cliDispatchReply?: (id: string, ok: boolean, message: string) => void
  // Clipboard via main (replaces navigator.clipboard in TerminalNode)
  clipboardReadText: () => Promise<string>
  clipboardWriteText: (text: string) => Promise<void>
}

interface Window {
  krnl?: KrnlBridge
}
