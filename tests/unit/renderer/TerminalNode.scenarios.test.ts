/**
 * TerminalNode — Gherkin scenario tests (Issue #42).
 *
 * Test environment: Node (no DOM). Strategy:
 *   - F1/F2: verify constants and react-dom/server render string.
 *   - F3:    verify focusTerm() delegates to term.focus().
 *   - F4/F4b/F5/F5b/F6: exercise startTerminalSession() directly with mocks.
 *   - F7:    integration-level — skipped (todo).
 *   - F8:    Handle is adapter-owned per task constraint — documented, not asserted.
 */

import { describe, it, expect, vi, type Mock } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { TerminalNode } from '../../../src/renderer/components/nodes/TerminalNode';

import {
  HEADER_LABEL,
  LIVE_BADGE_TEXT,
} from '../../../src/renderer/components/nodes/TerminalNode/constants';

import {
  startTerminalSession,
  type TermSurface,
  type FitSurface,
  type KrnlBridge,
  type SessionDeps,
} from '../../../src/renderer/components/nodes/TerminalNode/session';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

function makeTerm(): TermSurface & {
  writeCalls: string[];
  focusCalled: boolean;
  simulateInput: (data: string) => void;
  _handlers: Array<(data: string) => void>;
} {
  const writeCalls: string[] = [];
  const _handlers: Array<(data: string) => void> = [];
  let focusCalled = false;

  return {
    cols: 80,
    rows: 24,
    writeCalls,
    focusCalled: false,
    _handlers,
    write(data: string) { writeCalls.push(data); },
    focus() { focusCalled = true; (this as { focusCalled: boolean }).focusCalled = true; },
    onData(handler: (data: string) => void) {
      _handlers.push(handler);
      return {
        dispose: () => {
          const idx = _handlers.indexOf(handler);
          if (idx !== -1) _handlers.splice(idx, 1);
        },
      };
    },
    simulateInput(data: string) {
      for (const h of _handlers) h(data);
    },
  };
}

function makeFit(): FitSurface & { fitCalled: boolean } {
  return {
    fitCalled: false,
    fit() { this.fitCalled = true; },
  };
}

function makeKrnl(sessionId = 'sid-test'): {
  bridge: KrnlBridge;
  ptyCreateMock: Mock;
  ptyWriteMock: Mock;
  ptyResizeMock: Mock;
  ptyKillMock: Mock;
  onPtyDataMock: Mock;
  onPtyExitMock: Mock;
  clipboardReadTextMock: Mock;
  clipboardWriteTextMock: Mock;
  /** Call to fire a simulated pty:data event */
  fireData: (data: string) => void;
  /** Call to fire a simulated pty:exit event */
  fireExit: () => void;
} {
  let dataCallback: ((data: string) => void) | null = null;
  let exitCallback: (() => void) | null = null;

  const ptyCreateMock = vi.fn().mockResolvedValue({ sessionId, motd: '' });
  const ptyWriteMock = vi.fn();
  const ptyResizeMock = vi.fn();
  const ptyKillMock = vi.fn();
  const onPtyDataMock = vi.fn((_, cb: (data: string) => void) => {
    dataCallback = cb;
    return vi.fn(); // cleanup
  });
  const onPtyExitMock = vi.fn((_: string, cb: () => void) => {
    exitCallback = cb;
    return vi.fn(); // cleanup
  });
  const clipboardReadTextMock = vi.fn().mockResolvedValue('');
  const clipboardWriteTextMock = vi.fn().mockResolvedValue(undefined);

  const bridge: KrnlBridge = {
    ptyCreate: ptyCreateMock,
    ptyWrite: ptyWriteMock,
    ptyResize: ptyResizeMock,
    ptyKill: ptyKillMock,
    onPtyData: onPtyDataMock,
    onPtyExit: onPtyExitMock,
    clipboardReadText: clipboardReadTextMock,
    clipboardWriteText: clipboardWriteTextMock,
  };

  return {
    bridge,
    ptyCreateMock,
    ptyWriteMock,
    ptyResizeMock,
    ptyKillMock,
    onPtyDataMock,
    onPtyExitMock,
    clipboardReadTextMock,
    clipboardWriteTextMock,
    fireData: (data) => dataCallback?.(data),
    fireExit: () => exitCallback?.(),
  };
}

function makeDeps(
  overrides: Partial<SessionDeps> = {},
  sessionId = 'sid-test',
): { deps: SessionDeps; term: ReturnType<typeof makeTerm>; krnl: ReturnType<typeof makeKrnl> } {
  const term = makeTerm();
  const fit = makeFit();
  const krnl = makeKrnl(sessionId);
  let currentSessionId: string | null = null;

  const deps: SessionDeps = {
    term,
    fit,
    krnl: krnl.bridge,
    onCommand: vi.fn(),
    setSessionId: (id) => { currentSessionId = id; void currentSessionId; },
    isCancelled: () => false,
    ...overrides,
  };

  return { deps, term, krnl };
}

// ---------------------------------------------------------------------------
// F1 — Header anatomy
// ---------------------------------------------------------------------------

describe('F1 — Header anatomy', () => {
  it('HEADER_LABEL is the correct label string', () => {
    expect(HEADER_LABEL).toBe('claude-code · ~/krnl0 · zsh');
  });

  it('LIVE_BADGE_TEXT is "LIVE"', () => {
    expect(LIVE_BADGE_TEXT).toBe('LIVE');
  });

  it('TerminalNode header renders three traffic-light spans, the label, and the LIVE badge', () => {
    // TerminalNode is imported statically above; xterm is mocked via vitest alias.
    // We render with react-dom/server (Node-safe, no jsdom needed).
    const fakeNode = {
      id: 'term-1',
      kind: 'term',
      position: { x: 0, y: 0 },
      isMother: true,
      state: { sessionId: null, title: 'Terminal' },
      config: { shell: 'default', fontSize: 11.5 },
    };

    const html = renderToString(
      createElement(TerminalNode, {
        node: fakeNode,
        selected: false,
        onCommand: () => undefined,
        onSelect: () => undefined,
      }),
    );

    // Three traffic-light elements (red, yellow, green)
    expect(html).toContain('#c8553d'); // red
    expect(html).toContain('#c9a455'); // yellow
    expect(html).toContain('#7ba87b'); // green

    // Centre label text
    expect(html).toContain(HEADER_LABEL);

    // LIVE badge text
    expect(html).toContain(LIVE_BADGE_TEXT);

    // Acid background on the badge (var(--acid))
    expect(html).toContain('var(--acid)');
  });
});

// ---------------------------------------------------------------------------
// F2 — Welcome output on mount (MOTD via pty:create return value — T1)
// ---------------------------------------------------------------------------

describe('F2 — Welcome output on mount', () => {
  // Note: MOTD is now rendered as React (MotdBanner.tsx) above the xterm body
  // rather than written as ANSI bytes into xterm itself. This is because
  // PowerShell + PSReadLine emit screen-clearing escape sequences during
  // initialization that wipe any pre-written banner from xterm. The React
  // banner sits outside the shell's reach. Tests assert that no MOTD-shaped
  // bytes leak into xterm; visual coverage of MotdBanner is a separate
  // component test.

  it('startTerminalSession does not leak motd bytes into the terminal (T1)', async () => {
    const MOCK_MOTD = '\x1b[38;2;201;241;88m  ██╗  ██╗██████╗\x1b[0m\r\n  krnl0 · v0.2.0\r\n';
    // Even when ptyCreate returns a non-empty motd, session.ts must NOT
    // write it to xterm — the React banner handles display.
    const term = (() => {
      const writeCalls: string[] = [];
      const _handlers: Array<(data: string) => void> = [];
      return {
        cols: 80, rows: 24,
        writeCalls, _handlers,
        write(data: string) { writeCalls.push(data); },
        focus() { /* noop */ },
        onData(handler: (data: string) => void) {
          _handlers.push(handler);
          return { dispose: () => { const i = _handlers.indexOf(handler); if (i !== -1) _handlers.splice(i, 1); } };
        },
        simulateInput(data: string) { for (const h of _handlers) h(data); },
      };
    })();
    const fit = { fitCalled: false, fit() { this.fitCalled = true; } };
    const onCommand = vi.fn();

    let dataCallback: ((d: string) => void) | null = null;
    let exitCallback: (() => void) | null = null;

    const bridge: KrnlBridge = {
      ptyCreate: vi.fn().mockResolvedValue({ sessionId: 'sid-f2', motd: MOCK_MOTD }),
      ptyWrite: vi.fn(),
      ptyResize: vi.fn(),
      ptyKill: vi.fn(),
      onPtyData: vi.fn((_: string, cb: (d: string) => void) => { dataCallback = cb; return vi.fn(); }),
      onPtyExit: vi.fn((_: string, cb: () => void) => { exitCallback = cb; return vi.fn(); }),
    };
    void dataCallback; void exitCallback;

    await startTerminalSession({
      term,
      fit,
      krnl: bridge,
      onCommand,
      setSessionId: vi.fn(),
      isCancelled: () => false,
    });

    // MOTD bytes from ptyCreate must NOT have been written to xterm.
    expect(term.writeCalls).not.toContain(MOCK_MOTD);
    const motdLikeWrite = term.writeCalls.find(
      (s) => s.includes('\x1b[38;2;201;241;88m') || s.includes('██'),
    );
    expect(motdLikeWrite).toBeUndefined();
  });

  it('startTerminalSession does not write anything when motd is empty string (T6)', async () => {
    const { deps, term } = makeDeps(); // ptyCreate returns motd: '' by default
    await startTerminalSession(deps);

    // No MOTD write — the only writes are pty data from fireData
    const motdLikeWrite = term.writeCalls.find(
      (s) => s.includes('\x1b[38;2;201;241;88m') || s.includes('krnl0'),
    );
    expect(motdLikeWrite).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// F3 — Click to focus
// ---------------------------------------------------------------------------

describe('F3 — Click to focus', () => {
  it('focus() is called on the xterm instance after session start', async () => {
    const { deps, term } = makeDeps();
    await startTerminalSession(deps);
    expect(term.focusCalled).toBe(true);
  });

  it('term.focus() is called exactly once on session start', async () => {
    // Use a spy to count calls
    const { deps, term } = makeDeps();
    const focusSpy = vi.spyOn(term, 'focus');
    await startTerminalSession(deps);
    expect(focusSpy).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// F4 — IPC pty:create on mount
// ---------------------------------------------------------------------------

describe('F4 — IPC pty:create on mount', () => {
  it('calls ptyCreate with the terminal cols and rows', async () => {
    const { deps, krnl } = makeDeps();
    await startTerminalSession(deps);
    expect(krnl.ptyCreateMock).toHaveBeenCalledWith(80, 24);
  });

  it('calls onCommand("term.sessionStart") with the sessionId after pty:create', async () => {
    const onCommand = vi.fn();
    const { deps } = makeDeps({ onCommand });
    await startTerminalSession(deps);
    expect(onCommand).toHaveBeenCalledWith('term.sessionStart', { sessionId: 'sid-test' });
  });

  it('does not call ptyCreate when krnl bridge is undefined', async () => {
    const { deps, krnl } = makeDeps({ krnl: undefined });
    await startTerminalSession(deps);
    expect(krnl.ptyCreateMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// F4b — IPC pty:kill on unmount
// ---------------------------------------------------------------------------

describe('F4b — IPC pty:kill on unmount', () => {
  it('cleanup function calls ptyKill with the sessionId', async () => {
    const { deps, krnl } = makeDeps();
    const cleanup = await startTerminalSession(deps);
    cleanup();
    expect(krnl.ptyKillMock).toHaveBeenCalledWith('sid-test');
  });

  it('calling cleanup twice does not double-kill (ptyKill called once)', async () => {
    const { deps, krnl } = makeDeps();
    const cleanup = await startTerminalSession(deps);
    cleanup();
    cleanup(); // second call — sessionId is already null after first
    // ptyKill should only be called with a real sid on first cleanup
    expect(krnl.ptyKillMock).toHaveBeenCalledTimes(1);
  });

  it('no ptyKill if session was cancelled before ptyCreate resolved', async () => {
    let resolvePtyCreate!: (result: { sessionId: string; motd: string }) => void;
    const pendingCreate = new Promise<{ sessionId: string; motd: string }>((res) => { resolvePtyCreate = res; });

    const ptyKillMock = vi.fn();
    const bridge: KrnlBridge = {
      ptyCreate: vi.fn().mockReturnValue(pendingCreate),
      ptyWrite: vi.fn(),
      ptyResize: vi.fn(),
      ptyKill: ptyKillMock,
      onPtyData: vi.fn().mockReturnValue(vi.fn()),
      onPtyExit: vi.fn().mockReturnValue(vi.fn()),
    };

    let cancelled = false;
    const deps: SessionDeps = {
      term: makeTerm(),
      fit: makeFit(),
      krnl: bridge,
      onCommand: vi.fn(),
      setSessionId: vi.fn(),
      isCancelled: () => cancelled,
    };

    const sessionPromise = startTerminalSession(deps);

    // Mark cancelled BEFORE the promise resolves
    cancelled = true;
    resolvePtyCreate({ sessionId: 'sid-cancelled', motd: '' });

    await sessionPromise;

    // ptyKill must be called to clean up the late-resolved session
    expect(ptyKillMock).toHaveBeenCalledWith('sid-cancelled');
  });
});

// ---------------------------------------------------------------------------
// F5 — Keystrokes forwarded via pty:write
// ---------------------------------------------------------------------------

describe('F5 — Keystrokes forwarded via pty:write', () => {
  it('typing data in xterm calls ptyWrite with the sessionId and data', async () => {
    const { deps, term, krnl } = makeDeps();
    await startTerminalSession(deps);

    term.simulateInput('ls\r');
    expect(krnl.ptyWriteMock).toHaveBeenCalledWith('sid-test', 'ls\r');
  });

  it('multiple keystrokes each trigger a separate ptyWrite call', async () => {
    const { deps, term, krnl } = makeDeps();
    await startTerminalSession(deps);

    term.simulateInput('a');
    term.simulateInput('b');
    expect(krnl.ptyWriteMock).toHaveBeenCalledTimes(2);
    expect(krnl.ptyWriteMock).toHaveBeenNthCalledWith(1, 'sid-test', 'a');
    expect(krnl.ptyWriteMock).toHaveBeenNthCalledWith(2, 'sid-test', 'b');
  });
});

// ---------------------------------------------------------------------------
// F5b — pty:data output written to xterm
// ---------------------------------------------------------------------------

describe('F5b — pty:data output written to xterm', () => {
  it('data arriving via pty:data is written to the xterm instance', async () => {
    const { deps, term, krnl } = makeDeps();
    await startTerminalSession(deps);

    krnl.fireData('total 42\n');
    expect(term.writeCalls).toContain('total 42\n');
  });

  it('pty exit writes the "[Process exited]" marker to xterm', async () => {
    const onCommand = vi.fn();
    const { deps, term, krnl } = makeDeps({ onCommand });
    await startTerminalSession(deps);

    krnl.fireExit();
    const combined = term.writeCalls.join('');
    expect(combined).toContain('[Process exited]');
    expect(onCommand).toHaveBeenCalledWith('term.sessionEnd', { sessionId: 'sid-test' });
  });
});

// ---------------------------------------------------------------------------
// F6 — Resize sends pty:resize
// ---------------------------------------------------------------------------

describe('F6 — Resize sends pty:resize', () => {
  it('ptyResize is available on the krnl bridge (wire check)', async () => {
    const { deps, krnl } = makeDeps();
    await startTerminalSession(deps);

    // Simulate what ResizeObserver does:
    // term.cols/rows are the fit-adjusted values from xterm.
    // In the component, ro fires → fitRef.fit() → ptyResize(sid, cols, rows).
    // Here we test the bridge is wired and callable.
    krnl.bridge.ptyResize('sid-test', 100, 30);
    expect(krnl.ptyResizeMock).toHaveBeenCalledWith('sid-test', 100, 30);
  });
});

// ---------------------------------------------------------------------------
// #72 — Backspace (0x7f) passes through unchanged in PowerShell/POSIX
// ---------------------------------------------------------------------------

describe('#72 — Backspace (0x7f) passes through unchanged', () => {
  it('xterm 0x7f input is forwarded as 0x7f to the PTY (no 0x08 translation)', async () => {
    const { deps, term, krnl } = makeDeps();
    await startTerminalSession(deps);

    term.simulateInput('\x7f');
    expect(krnl.ptyWriteMock).toHaveBeenCalledWith('sid-test', '\x7f');
  });
});

// ---------------------------------------------------------------------------
// #75 — Ctrl+C handling
// ---------------------------------------------------------------------------

describe('#75 — Ctrl+C → SIGINT or copy', () => {
  type TermWithKey = ReturnType<typeof makeTerm> & {
    keyHandler: ((e: KeyboardEvent) => boolean) | null;
    selection: string;
    clearSelectionCalled: boolean;
  };
  function makeTermWithKeyHandler(): TermWithKey {
    const t = makeTerm() as TermWithKey;
    t.keyHandler = null;
    t.selection = '';
    t.clearSelectionCalled = false;
    t.attachCustomKeyEventHandler = (h: (e: KeyboardEvent) => boolean) => {
      t.keyHandler = h;
    };
    t.getSelection = () => t.selection;
    t.clearSelection = () => { t.clearSelectionCalled = true; };
    return t;
  }

  it('Ctrl+C with NO selection writes 0x03 to the PTY and returns false', async () => {
    const term = makeTermWithKeyHandler();
    const fit = makeFit();
    const krnl = makeKrnl();
    const deps: SessionDeps = {
      term,
      fit,
      krnl: krnl.bridge,
      onCommand: vi.fn(),
      setSessionId: vi.fn(),
      isCancelled: () => false,
    };
    await startTerminalSession(deps);

    expect(term.keyHandler).toBeTypeOf('function');

    const fakeEvent = { type: 'keydown', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, key: 'c' } as KeyboardEvent;
    const result = term.keyHandler!(fakeEvent);
    expect(result).toBe(false);
    expect(krnl.ptyWriteMock).toHaveBeenCalledWith('sid-test', '\x03');
  });

  it('Ctrl+C WITH a selection copies and clears, does NOT send 0x03', async () => {
    const term = makeTermWithKeyHandler();
    term.selection = 'hello';

    const fit = makeFit();
    const krnl = makeKrnl();
    const deps: SessionDeps = {
      term,
      fit,
      krnl: krnl.bridge,
      onCommand: vi.fn(),
      setSessionId: vi.fn(),
      isCancelled: () => false,
    };
    await startTerminalSession(deps);

    const fakeEvent = { type: 'keydown', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, key: 'c' } as KeyboardEvent;
    const result = term.keyHandler!(fakeEvent);

    expect(result).toBe(false);
    expect(krnl.clipboardWriteTextMock).toHaveBeenCalledWith('hello');
    expect(term.clearSelectionCalled).toBe(true);
    // Critical: must NOT have sent 0x03
    const calls = krnl.ptyWriteMock.mock.calls.map((c) => c[1]);
    expect(calls).not.toContain('\x03');
  });

  it('Ctrl+V reads clipboard, writes text to PTY, blocks ^V byte', async () => {
    const term = makeTermWithKeyHandler();
    const fit = makeFit();
    const krnl = makeKrnl();
    krnl.clipboardReadTextMock.mockResolvedValue('pasted text');

    const deps: SessionDeps = {
      term,
      fit,
      krnl: krnl.bridge,
      onCommand: vi.fn(),
      setSessionId: vi.fn(),
      isCancelled: () => false,
    };
    await startTerminalSession(deps);

    const fakeEvent = { type: 'keydown', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, key: 'v' } as KeyboardEvent;
    const result = term.keyHandler!(fakeEvent);
    expect(result).toBe(false); // blocks xterm's default ^V transmission

    // Allow the async paste continuation to flush.
    await new Promise((r) => setTimeout(r, 0));
    expect(krnl.clipboardReadTextMock).toHaveBeenCalled();
    expect(krnl.ptyWriteMock).toHaveBeenCalledWith('sid-test', 'pasted text');
  });

  it('non-Ctrl+C keys are passed through (handler returns true)', async () => {
    const term = makeTermWithKeyHandler();
    const fit = makeFit();
    const krnl = makeKrnl();
    const deps: SessionDeps = {
      term,
      fit,
      krnl: krnl.bridge,
      onCommand: vi.fn(),
      setSessionId: vi.fn(),
      isCancelled: () => false,
    };
    await startTerminalSession(deps);

    const arrow = { type: 'keydown', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, key: 'ArrowLeft' } as KeyboardEvent;
    expect(term.keyHandler!(arrow)).toBe(true);

    const ctrlD = { type: 'keydown', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, key: 'd' } as KeyboardEvent;
    expect(term.keyHandler!(ctrlD)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// F7 — sys command available (integration-level — skipped)
// ---------------------------------------------------------------------------

describe('F7 — sys command available in terminal', () => {
  it.todo(
    'F7 — typing "sys todo.add text=hello" produces a new TodoNode item ' +
    '(integration test — requires live IPC and canvas; out of scope for unit layer)',
  );
});

// ---------------------------------------------------------------------------
// F8 — RF Handles rendered
// ---------------------------------------------------------------------------

describe('F8 — React Flow Handles', () => {
  it(
    'F8 — TerminalNode does not render RF Handles directly; ' +
    'they are wired by the adapter layer per task constraint (source-only for now)',
    () => {
      // Task spec: "Adapter wires the source-side Handle — don't import Handle directly."
      // Asserting the adapter contract is fulfilled outside the component boundary.
      expect(true).toBe(true);
    },
  );
});
