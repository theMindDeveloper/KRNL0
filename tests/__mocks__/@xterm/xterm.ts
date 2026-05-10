// Stub for @xterm/xterm — used during Vitest runs in Node environment
// where browser globals (self, window) are unavailable.
export class Terminal {
  cols = 80;
  rows = 24;
  loadAddon(_addon: unknown): void {}
  open(_el: unknown): void {}
  write(_data: string): void {}
  onData(_handler: (data: string) => void): { dispose: () => void } {
    return { dispose: () => undefined };
  }
  dispose(): void {}
}
