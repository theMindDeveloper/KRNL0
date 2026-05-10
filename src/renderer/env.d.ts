interface KrnlBridge {
  boardLoad: () => Promise<unknown>
  boardSave: (data: unknown) => Promise<void>
  boardSaveViewport: (viewport: { x: number; y: number; zoom: number }) => Promise<void>
  ptyCreate: (cols: number, rows: number) => Promise<string>
  ptyWrite: (sessionId: string, data: string) => Promise<void>
  ptyResize: (sessionId: string, cols: number, rows: number) => Promise<void>
  onPtyData: (sessionId: string, callback: (data: string) => void) => () => void
  onPtyExit: (sessionId: string, callback: () => void) => () => void
}

interface Window {
  krnl?: KrnlBridge
}
