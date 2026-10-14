import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('krnl', {
  // Board persistence
  boardLoad: () => ipcRenderer.invoke('board:load'),
  boardSave: (data: unknown) => ipcRenderer.invoke('board:save', data),
  boardReset: () => ipcRenderer.invoke('board:reset'),
  boardSaveViewport: (viewport: { x: number; y: number; zoom: number }) =>
    ipcRenderer.invoke('board:saveViewport', viewport),

  // Terminal
  ptyCreate: (cols: number, rows: number) =>
    ipcRenderer.invoke('pty:create', cols, rows),
  ptyWrite: (sessionId: string, data: string) =>
    ipcRenderer.invoke('pty:write', sessionId, data),
  ptyResize: (sessionId: string, cols: number, rows: number) =>
    ipcRenderer.invoke('pty:resize', sessionId, cols, rows),
  ptyKill: (sessionId: string) =>
    ipcRenderer.invoke('pty:kill', sessionId),
  onPtyData: (sessionId: string, callback: (data: string) => void) => {
    const channel = `pty:data:${sessionId}`
    ipcRenderer.on(channel, (_event, data: string) => callback(data))
    return () => ipcRenderer.removeAllListeners(channel)
  },
  onPtyExit: (sessionId: string, callback: () => void) => {
    const channel = `pty:exit:${sessionId}`
    ipcRenderer.on(channel, () => callback())
    return () => ipcRenderer.removeAllListeners(channel)
  },

  // Asset persistence (Decision 21). Bytes are sent as Uint8Array which
  // Electron structured-clones across the IPC bridge without base64.
  assetWrite: (ext: string, bytes: Uint8Array) =>
    ipcRenderer.invoke('asset:write', { ext, bytes }),
  assetRead: (assetId: string) =>
    ipcRenderer.invoke('asset:read', { assetId }),
  assetDelete: (assetId: string) =>
    ipcRenderer.invoke('asset:delete', { assetId }),

  // Live sync - main -> renderer notification that board.json was mutated
  // outside the renderer (e.g. via sys CLI). Renderer should re-load.
  onBoardChanged: (callback: () => void) => {
    const channel = 'board:changed'
    ipcRenderer.on(channel, () => callback())
    return () => ipcRenderer.removeAllListeners(channel)
  },

  // Phase 2: cli:dispatch
  onCliDispatch: (
    callback: (id: string, command: string, args: Record<string, unknown>) => void,
  ) => {
    const channel = "cli:dispatch:request"
    ipcRenderer.on(channel, (_event, id: string, command: string, args: Record<string, unknown>) => {
      callback(id, command, args)
    })
    return () => ipcRenderer.removeAllListeners(channel)
  },
  cliDispatchReply: (id: string, ok: boolean, message: string) => {
    ipcRenderer.send("cli:dispatch:reply", id, ok, message)
  },

  // Clipboard — routed through main because navigator.clipboard is flaky in
  // Electron (silent fails on permission/focus quirks). main has Electron's
  // clipboard module which works unconditionally.
  clipboardReadText: (): Promise<string> => ipcRenderer.invoke('clipboard:readText'),
  clipboardWriteText: (text: string): Promise<void> => ipcRenderer.invoke('clipboard:writeText', text),
})
