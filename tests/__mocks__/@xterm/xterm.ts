// Stub for @xterm/xterm — used during Vitest runs in Node environment
// where browser globals (self, window) are unavailable.
export class Terminal {
  cols = 80;
  rows = 24;

  private _dataHandlers: Array<(data: string) => void> = [];

  loadAddon(_addon: unknown): void {}
  open(_el: unknown): void {}
  write(_data: string): void {}
  focus(): void {}

  onData(handler: (data: string) => void): { dispose: () => void } {
    this._dataHandlers.push(handler);
    return {
      dispose: () => {
        const idx = this._dataHandlers.indexOf(handler);
        if (idx !== -1) this._dataHandlers.splice(idx, 1);
      },
    };
  }

  /** Simulate the user typing — invokes all registered onData handlers. */
  simulateInput(data: string): void {
    for (const h of this._dataHandlers) h(data);
  }

  dispose(): void {
    this._dataHandlers = [];
  }
}
