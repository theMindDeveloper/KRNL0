import { contextBridge, ipcRenderer, webUtils } from 'electron'

contextBridge.exposeInMainWorld('krnl', {
  // Board persistence
  boardLoad: () => ipcRenderer.invoke('board:load'),
  boardSave: (data: unknown) => ipcRenderer.invoke('board:save', data),
  boardReset: () => ipcRenderer.invoke('board:reset'),
  boardSaveViewport: (viewport: { x: number; y: number; zoom: number }) =>
    ipcRenderer.invoke('board:saveViewport', viewport),

  // Terminal
  ptyCreate: (cols: number, rows: number, shell?: string) =>
    ipcRenderer.invoke('pty:create', cols, rows, shell),
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
  // Dropped files: their on-disk path (Electron webUtils) and a fast import
  // that copies the file in main — no bytes over IPC.
  assetPathOf: (file: File) => {
    try { return webUtils.getPathForFile(file) || null } catch { return null }
  },
  assetImportPath: (path: string) =>
    ipcRenderer.invoke('asset:importPath', { path }),
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
  // Run one krnl command in main (the CLI's facade), argv as given — no shell.
  sysRun: (argv: string[]): Promise<{ ok: boolean; message: string }> => ipcRenderer.invoke('sys:run', argv),
  clipboardWriteText: (text: string): Promise<void> => ipcRenderer.invoke('clipboard:writeText', text),

  // Decision 35 — durable time log (renderer/store/timeLog.ts wraps these).
  timelogAppend: (entries: unknown[]): Promise<{ ok: boolean; written: number }> =>
    ipcRenderer.invoke('timelog:append', entries),
  timelogQuery: (fromYMD: string, toYMD: string): Promise<unknown[]> =>
    ipcRenderer.invoke('timelog:query', fromYMD, toYMD),

  // Decision 36 — app updates. Main owns the state; the window pulls it on
  // mount and gets every change pushed (renderer/store/updateStore.ts).
  updateGetState: (): Promise<unknown> => ipcRenderer.invoke('update:get'),
  updateCheck: (): Promise<unknown> => ipcRenderer.invoke('update:check'),
  updateInstall: (): Promise<{ ok: boolean; message: string }> => ipcRenderer.invoke('update:install'),
  updateOpenRelease: (): Promise<{ ok: boolean; message: string }> => ipcRenderer.invoke('update:open'),
  onUpdateState: (callback: (state: unknown) => void) => {
    const listener = (_event: unknown, state: unknown) => callback(state)
    ipcRenderer.on('update:state', listener)
    return () => { ipcRenderer.removeListener('update:state', listener) }
  },

  // Decision 37 — pocket timer. Main window side: send the Pomo snapshot, run
  // the pocket's buttons. Pocket side: read the snapshot, send a button.
  pocketSendState: (snapshot: unknown) => ipcRenderer.send('pocket:state', snapshot),
  onPocketRun: (callback: (command: string) => void) => {
    const listener = (_event: unknown, command: string) => callback(command)
    ipcRenderer.on('pocket:run', listener)
    return () => { ipcRenderer.removeListener('pocket:run', listener) }
  },
  pocketGet: (): Promise<unknown> => ipcRenderer.invoke('pocket:get'),
  onPocketSnapshot: (callback: (snapshot: unknown) => void) => {
    const listener = (_event: unknown, snapshot: unknown) => callback(snapshot)
    ipcRenderer.on('pocket:snapshot', listener)
    return () => { ipcRenderer.removeListener('pocket:snapshot', listener) }
  },
  onPocketPrefs: (callback: (prefs: unknown) => void) => {
    const listener = (_event: unknown, prefs: unknown) => callback(prefs)
    ipcRenderer.on('pocket:prefs', listener)
    return () => { ipcRenderer.removeListener('pocket:prefs', listener) }
  },
  pocketCommand: (command: string): Promise<{ ok: boolean; message: string }> => ipcRenderer.invoke('pocket:command', command),
  pocketOpenMain: () => ipcRenderer.send('pocket:open'),
  pocketCollapse: (collapsed: boolean) => ipcRenderer.send('pocket:collapse', collapsed),
  pocketResize: (size: { width: number; height: number }) => ipcRenderer.send('pocket:resize', size),
  onPocketHover: (callback: (over: boolean) => void) => {
    const listener = (_event: unknown, over: boolean) => callback(over)
    ipcRenderer.on('pocket:hover', listener)
    return () => { ipcRenderer.removeListener('pocket:hover', listener) }
  },
  pocketLookSet: (look: string): Promise<{ ok: boolean; message: string }> => ipcRenderer.invoke('pocket:look:set', look),
  pocketSettingsGet: (): Promise<unknown> => ipcRenderer.invoke('pocket:settings:get'),
  pocketSettingsSet: (on: boolean): Promise<{ ok: boolean; message: string }> => ipcRenderer.invoke('pocket:settings:set', on),

  // Decision 38 — launch experience: version, backup, time away, app prefs.
  appLaunch: (): Promise<unknown> => ipcRenderer.invoke('app:launch'),
  appPrefsSet: (patch: unknown): Promise<unknown> => ipcRenderer.invoke('app:prefs:set', patch),
  appBackupsOpen: (): Promise<{ ok: boolean; message: string }> => ipcRenderer.invoke('app:backups:open'),
  appOpenExternal: (url: string): Promise<{ ok: boolean; message: string }> => ipcRenderer.invoke('app:open-external', url),
})
