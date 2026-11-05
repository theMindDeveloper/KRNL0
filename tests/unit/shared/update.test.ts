/** Decision 36 — app-updates.md F1: SemVer compare and the plain-language state line. */
import { describe, it, expect } from 'vitest';
import { compareVersions, describeUpdateState, isNewerVersion, stripV } from '../../../src/shared/update';
import type { UpdateState } from '../../../src/shared/update';

describe('compareVersions (F1)', () => {
  it.each([
    ['0.10.1', '0.10.0', 1],
    ['0.11.0', '0.10.9', 1],
    ['1.0.0', '0.99.99', 1],
    ['0.10.0', '0.10.0', 0],
    ['v0.10.0', '0.10.0', 0],
    ['0.9.10', '0.10.0', -1],
    ['0.10.0', '0.10.0-beta.1', 1],
    ['0.10.0-beta.2', '0.10.0-beta.1', 1],
    ['0.10.0-beta.10', '0.10.0-beta.9', 1],
    ['0.10.0-rc.1', '0.10.0-beta.9', 1],
    ['0.10.0-beta', '0.10.0-beta.1', -1],
    ['0.10.0+build.5', '0.10.0', 0],
  ])('%s vs %s → %i', (a, b, sign) => {
    expect(Math.sign(compareVersions(a, b))).toBe(sign);
  });

  it('treats malformed versions as equal, so they never look like an update', () => {
    expect(compareVersions('latest', '0.10.0')).toBe(0);
    expect(isNewerVersion('v1', '0.10.0')).toBe(false);
  });

  it('isNewerVersion is strict', () => {
    expect(isNewerVersion('0.10.1', '0.10.0')).toBe(true);
    expect(isNewerVersion('0.10.0', '0.10.0')).toBe(false);
    expect(isNewerVersion('0.9.0', '0.10.0')).toBe(false);
  });

  it('stripV drops a leading v', () => {
    expect(stripV(' v0.11.0 ')).toBe('0.11.0');
    expect(stripV('0.11.0')).toBe('0.11.0');
  });
});

describe('describeUpdateState (F5)', () => {
  const base: UpdateState = { status: 'idle', currentVersion: '0.10.0', mode: 'auto' };
  const now = 1_000_000_000;

  it('says how long ago it checked', () => {
    expect(describeUpdateState({ ...base, status: 'up-to-date', checkedAt: now - 5 * 60_000 }, now)).toBe('Up to date · checked 5 min ago');
    expect(describeUpdateState({ ...base, status: 'up-to-date', checkedAt: now }, now)).toBe('Up to date · checked just now');
  });

  it('names the version and the next step', () => {
    expect(describeUpdateState({ ...base, status: 'ready', latestVersion: '0.11.0' })).toBe('KRNL0 0.11.0 is ready — restart to update');
    expect(describeUpdateState({ ...base, status: 'downloading', latestVersion: '0.11.0', percent: 41.6 })).toBe('Downloading KRNL0 0.11.0… 42%');
    expect(describeUpdateState({ ...base, mode: 'notify', status: 'available', latestVersion: '0.11.0' })).toContain('download it from the release page');
  });

  it('explains disabled and error states', () => {
    expect(describeUpdateState({ ...base, status: 'disabled', reason: 'development build' })).toBe('Updates are off (development build)');
    expect(describeUpdateState({ ...base, status: 'error', error: 'offline' })).toBe("Couldn't check for updates: offline");
  });
});
