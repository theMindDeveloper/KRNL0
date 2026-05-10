import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('krnl', {
  // Board persistence
  boardLoad: () => ipcRenderer.invoke('board:load'),
  boardSave: (data: unknown) => ipcRenderer.invoke('board:save', data),
  boardSaveViewport: (viewport: { x: number; y: number; zoom: number }) =>
    ipcRenderer.invoke('board:saveViewport', viewport),

  // Terminal (stub — wired in Issue #6)
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
})
