// @vitest-environment jsdom
/**
 * Decision 36 — the update notice, status-bar version item and Settings
 * section in the window (app-updates.md F2, F3, F4, F5, F7, NF4).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { UpdateNoticeBar } from '../../../src/renderer/components/ui/UpdateNoticeBar';
import { UpdatesSection } from '../../../src/renderer/components/TopBar/UpdatesSection';
import { StatusBar } from '../../../src/renderer/components/StatusBar';
import {
  parseUpdateState,
  restartToUpdate,
  useUpdateBridge,
  useUpdateStore,
} from '../../../src/renderer/store/updateStore';
import { useBoardStore } from '../../../src/renderer/store/boardStore';
import type { UpdateState } from '../../../src/shared/update';

const ready: UpdateState = {
  status: 'ready', currentVersion: '0.10.0', mode: 'auto', latestVersion: '0.11.0',
  releaseUrl: 'https://github.com/theMindDeveloper/KRNL0/releases/tag/v0.11.0',
};
const out: UpdateState = { ...ready, status: 'available', mode: 'notify' };

function bridge() {
  const calls: string[] = [];
  let push: ((s: unknown) => void) | null = null;
  const krnl = {
    updateGetState: vi.fn(async () => ready),
    updateCheck: vi.fn(async () => ({ status: 'up-to-date', currentVersion: '0.10.0', mode: 'auto', checkedAt: Date.now() })),
    updateInstall: vi.fn(async () => { calls.push('install'); return { ok: true, message: 'ok' }; }),
    updateOpenRelease: vi.fn(async () => { calls.push('open'); return { ok: true, message: 'ok' }; }),
    onUpdateState: vi.fn((cb: (s: unknown) => void) => { push = cb; return () => { push = null; }; }),
    boardSaveViewport: vi.fn(async () => { calls.push('saveViewport'); }),
  };
  (window as unknown as { krnl: unknown }).krnl = krnl;
  return { krnl, calls, push: (s: unknown) => push?.(s) };
}

beforeEach(() => {
  useUpdateStore.setState({ state: null, dismissed: null, checking: false });
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { krnl?: unknown }).krnl;
});

describe('parseUpdateState', () => {
  it('accepts a well-formed state and rejects anything else', () => {
    expect(parseUpdateState(ready)).toEqual(ready);
    expect(parseUpdateState(null)).toBeNull();
    expect(parseUpdateState({ status: 'exploded', currentVersion: '1', mode: 'auto' })).toBeNull();
    expect(parseUpdateState({ status: 'ready', currentVersion: 1, mode: 'auto' })).toBeNull();
    expect(parseUpdateState({ status: 'ready', currentVersion: '1', mode: 'magic' })).toBeNull();
  });
});

describe('useUpdateBridge (NF4)', () => {
  function Probe() { useUpdateBridge(); return null; }

  it('pulls the state on mount, then follows pushes', async () => {
    const b = bridge();
    render(<Probe />);
    await act(async () => { await Promise.resolve(); });
    expect(useUpdateStore.getState().state).toEqual(ready);
    act(() => b.push({ ...ready, status: 'downloading', percent: 30 }));
    expect(useUpdateStore.getState().state?.percent).toBe(30);
    act(() => b.push({ garbage: true }));
    expect(useUpdateStore.getState().state?.status).toBe('downloading');
  });
});

describe('UpdateNoticeBar (F2, F3)', () => {
  it('offers Restart when an update is ready', () => {
    bridge();
    useUpdateStore.setState({ state: ready });
    render(<UpdateNoticeBar />);
    expect(screen.getByTestId('update-notice').textContent).toContain('KRNL0 0.11.0 is ready');
    expect(screen.getByTestId('update-notice-action').textContent).toBe('Restart');
  });

  it('offers Download on notify-only platforms', () => {
    const b = bridge();
    useUpdateStore.setState({ state: out });
    render(<UpdateNoticeBar />);
    expect(screen.getByTestId('update-notice').textContent).toContain('KRNL0 0.11.0 is out');
    fireEvent.click(screen.getByTestId('update-notice-action'));
    expect(b.krnl.updateOpenRelease).toHaveBeenCalled();
  });

  it('Later hides it for this version only', () => {
    bridge();
    useUpdateStore.setState({ state: ready });
    render(<UpdateNoticeBar />);
    fireEvent.click(screen.getByTestId('update-notice-later'));
    expect(screen.queryByTestId('update-notice')).toBeNull();
    act(() => useUpdateStore.setState({ state: { ...ready, latestVersion: '0.11.1' } }));
    expect(screen.getByTestId('update-notice')).toBeTruthy();
  });

  it('shows nothing while up to date, downloading or failing (F9)', () => {
    for (const status of ['up-to-date', 'downloading', 'error', 'checking', 'disabled'] as const) {
      useUpdateStore.setState({ state: { ...ready, status } });
      const { container } = render(<UpdateNoticeBar />);
      expect(container.innerHTML).toBe('');
      cleanup();
    }
  });
});

describe('restartToUpdate (F7)', () => {
  it('commits the focused edit and saves the camera before installing', async () => {
    const b = bridge();
    useBoardStore.setState({ board: { nodes: [], edges: [] } as never, viewport: { x: 1, y: 2, zoom: 1 } });
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    const blurred = vi.fn(() => b.calls.push('blur'));
    input.addEventListener('blur', blurred);

    await restartToUpdate();

    expect(blurred).toHaveBeenCalled();
    expect(b.krnl.boardSaveViewport).toHaveBeenCalledWith({ x: 1, y: 2, zoom: 1 });
    expect(b.calls).toEqual(['blur', 'saveViewport', 'install']);
    input.remove();
  });
});

describe('Status bar version item (F4)', () => {
  it('shows the plain version, download progress, then the new version', () => {
    bridge();
    render(<StatusBar />);
    expect(screen.getByTestId('statusbar-version').textContent).toMatch(/^v\d+\.\d+\.\d+$/);
    act(() => useUpdateStore.setState({ state: { ...ready, status: 'downloading', percent: 42 } }));
    expect(screen.getByTestId('statusbar-version').textContent).toContain('↓ 42%');
    act(() => useUpdateStore.setState({ state: ready }));
    expect(screen.getByTestId('statusbar-version').textContent).toContain('→ 0.11.0');
    expect(screen.getByTestId('statusbar-version').tagName).toBe('BUTTON');
  });
});

describe('Settings → Updates (F5)', () => {
  it('shows the state and checks on demand', async () => {
    const b = bridge();
    useUpdateStore.setState({ state: { status: 'idle', currentVersion: '0.10.0', mode: 'auto' } });
    render(<UpdatesSection />);
    expect(screen.getByTestId('settings-updates').textContent).toContain('KRNL0 v0.10.0');
    expect(screen.getByTestId('settings-updates-state').textContent).toBe('Not checked yet');
    await act(async () => { fireEvent.click(screen.getByTestId('settings-updates-check')); });
    expect(b.krnl.updateCheck).toHaveBeenCalled();
    expect(screen.getByTestId('settings-updates-state').textContent).toContain('Up to date');
  });

  it('offers Restart to update and What\'s new when ready', () => {
    bridge();
    useUpdateStore.setState({ state: ready });
    render(<UpdatesSection />);
    expect(screen.getByTestId('settings-updates-action').textContent).toBe('Restart to update');
    expect(screen.getByTestId('settings-updates-notes')).toBeTruthy();
  });

  it('cannot check when updates are off', () => {
    bridge();
    useUpdateStore.setState({ state: { status: 'disabled', currentVersion: '0.10.0', mode: 'notify', reason: 'development build' } });
    render(<UpdatesSection />);
    expect((screen.getByTestId('settings-updates-check') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('settings-updates-state').textContent).toBe('Updates are off (development build)');
  });
});
