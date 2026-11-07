/** Decision 38 — launch-experience rules (launch-experience.md F4, F5, F8–F12, F18). */
import { describe, it, expect } from 'vitest';
import {
  DAY_MS,
  applyPrefsPatch,
  backupFileName,
  backupsToPrune,
  describeAway,
  minorOf,
  parseAppState,
  shouldWelcomeBack,
  updateKind,
  DEFAULT_APP_STATE,
} from '../../../src/shared/appState';
import { RELEASES, describeWhatsNew, latestNotes, notesFor, shouldShowWhatsNew } from '../../../src/shared/whatsnew';
import { FEEDBACK_EMAIL, ISSUES_NEW_URL, MAX_MAILTO_LENGTH, MAX_TITLE_LENGTH, MAX_URL_LENGTH, buildIssueUrl, buildMailto, diagnosticsText, isAllowedExternalUrl, isFeedbackKind } from '../../../src/shared/feedback';
import { IDLE_VIEW, systemTimerView } from '../../../src/shared/systemTimer';
import { defaultPomoConfig, defaultPomoState } from '../../../src/renderer/components/nodes/PomoNode/types';
import type { PocketSnapshot } from '../../../src/shared/pocket';

describe('app state file (NF2)', () => {
  it('falls back to defaults and drops junk', () => {
    expect(parseAppState(null)).toEqual(DEFAULT_APP_STATE);
    expect(parseAppState({ lastVersion: 3, celebrations: 'no', milestonesSeen: ['a', 4], lastActiveAt: 5 })).toEqual({
      ...DEFAULT_APP_STATE, lastActiveAt: 5, milestonesSeen: ['a'],
    });
  });
  it('the renderer may only change its own fields', () => {
    const next = applyPrefsPatch(DEFAULT_APP_STATE, { lastVersion: '9.9.9', celebrations: false, whatsNewSeen: '0.11', skippedVersion: '0.12.0' });
    expect(next.lastVersion).toBeNull();
    expect(next).toMatchObject({ celebrations: false, whatsNewSeen: '0.11', skippedVersion: '0.12.0' });
  });
});

describe('updateKind / minorOf (F4, F5, F8)', () => {
  it.each([
    [null, '0.11.0', 'first-run'],
    ['0.11.0', '0.11.0', 'same'],
    ['0.11.0', '0.11.1', 'patch'],
    ['0.10.1', '0.11.0', 'feature'],
    ['0.11.0', '1.0.0', 'feature'],
    ['0.11.1', '0.11.0', 'downgrade'],
  ] as const)('%s → %s = %s', (prev, cur, kind) => {
    expect(updateKind(prev, cur)).toBe(kind);
  });
  it('minorOf', () => {
    expect(minorOf('0.11.2')).toBe('0.11');
    expect(minorOf('v1.2.3-beta')).toBe('1.2');
  });
});

describe('board backups (F4)', () => {
  it('names the copy after the version that left the board', () => {
    expect(backupFileName('0.10.1', '0.11.0')).toBe('board-v0.10.1-before-v0.11.0.json');
    expect(backupFileName(null, '0.11.0')).toBe('board-older-before-v0.11.0.json');
    // A damaged app-state.json can never put a path into the name.
    expect(backupFileName('../../evil', '0.11.0')).toBe('board-v....evil-before-v0.11.0.json');
    expect(backupFileName('0.10.1', '0.11.0/../x')).not.toContain('/');
  });
  it('keeps the newest three', () => {
    const files = [1, 5, 3, 4, 2].map((t) => ({ name: `board-v0.${t}.0-before-v1.json`, mtimeMs: t }));
    expect(backupsToPrune([...files, { name: 'notes.txt', mtimeMs: 0 }]).sort()).toEqual(['board-v0.1.0-before-v1.json', 'board-v0.2.0-before-v1.json']);
  });
});

describe('welcome back timing (F12)', () => {
  it('only after two days away, never on the first run', () => {
    expect(shouldWelcomeBack({ awayMs: 2 * DAY_MS, kind: 'same' })).toBe(true);
    expect(shouldWelcomeBack({ awayMs: 2 * DAY_MS - 1, kind: 'same' })).toBe(false);
    expect(shouldWelcomeBack({ awayMs: null, kind: 'same' })).toBe(false);
    expect(shouldWelcomeBack({ awayMs: 9 * DAY_MS, kind: 'first-run' })).toBe(false);
    expect(describeAway(4 * DAY_MS + 5)).toBe('away 4 days');
    expect(describeAway(DAY_MS)).toBe('away 1 day');
  });
});

describe("What's new (F5–F7)", () => {
  it('ships at most three highlights per release', () => {
    for (const r of RELEASES) expect(r.items.length).toBeLessThanOrEqual(3);
  });
  it('opens once per feature release, never for patches', () => {
    const minor = latestNotes()!.minor;
    const v = `${minor}.0`;
    expect(notesFor(`${minor}.4`)?.minor).toBe(minor);
    expect(shouldShowWhatsNew({ kind: 'feature', version: v, seen: null })).toBe(true);
    expect(shouldShowWhatsNew({ kind: 'feature', version: v, seen: minor })).toBe(false);
    expect(shouldShowWhatsNew({ kind: 'patch', version: v, seen: null })).toBe(false);
    expect(shouldShowWhatsNew({ kind: 'feature', version: '9.9.0', seen: null })).toBe(false);
  });
  it('prints for the terminal', () => {
    const text = describeWhatsNew(latestNotes()!);
    expect(text).toContain("What's new in KRNL0");
    expect(text).toContain('01  ');
  });
});

describe('feedback link (F18)', () => {
  const diagnostics = { version: '0.11.0', os: 'Windows 11 · x64', errors: ['12:00:00 boom'] };
  it('fills in the title, text, version and label', () => {
    const url = new URL(buildIssueUrl({ kind: 'bug', title: 'Week view misses Sunday', text: 'It is empty.', diagnostics, includeErrors: true }));
    expect(`${url.origin}${url.pathname}`).toBe(ISSUES_NEW_URL);
    expect(url.searchParams.get('title')).toBe('Bug: Week view misses Sunday');
    expect(url.searchParams.get('labels')).toBe('bug');
    const body = url.searchParams.get('body')!;
    expect(body).toContain('It is empty.');
    expect(body).toContain('KRNL0 0.11.0 · Windows 11 · x64');
    expect(body).toContain('boom');
  });
  it('leaves out the system and errors when switched off', () => {
    const body = new URL(buildIssueUrl({ kind: 'idea', title: '', text: 'x', diagnostics: null, includeErrors: true })).searchParams.get('body')!;
    expect(body).not.toContain('KRNL0 0.11.0');
    const noErr = new URL(buildIssueUrl({ kind: 'idea', title: '', text: 'x', diagnostics, includeErrors: false })).searchParams.get('body')!;
    expect(noErr).not.toContain('boom');
  });
  it('stays under the link length limit', () => {
    const errors = Array.from({ length: 40 }, (_, i) => `error ${i} ${'x'.repeat(200)}`);
    const url = buildIssueUrl({ kind: 'bug', title: 't', text: 'y'.repeat(9000), diagnostics: { ...diagnostics, errors }, includeErrors: true });
    expect(url.length).toBeLessThanOrEqual(MAX_URL_LENGTH);
  });
  it('by email: to the maintainer, subject and body filled in, short enough for mail apps', () => {
    const url = buildMailto({ kind: 'idea', title: 'Dark calendar', text: 'Please.', diagnostics, includeErrors: true });
    expect(url.startsWith(`mailto:${FEEDBACK_EMAIL}?`)).toBe(true);
    const q = new URLSearchParams(url.slice(url.indexOf('?') + 1));
    expect(q.get('subject')).toBe('KRNL0 Idea: Dark calendar');
    expect(q.get('body')).toContain('Please.');
    expect(q.get('body')).toContain('KRNL0 0.11.0');
    const long = buildMailto({ kind: 'bug', title: 't', text: 'y'.repeat(5000), diagnostics: { ...diagnostics, errors: Array.from({ length: 30 }, () => 'e'.repeat(100)) }, includeErrors: true });
    expect(long.length).toBeLessThanOrEqual(MAX_MAILTO_LENGTH);
  });
  it('kinds and diagnostics text', () => {
    expect(isFeedbackKind('love')).toBe(true);
    expect(isFeedbackKind('rant')).toBe(false);
    expect(diagnosticsText({ ...diagnostics, errors: [] })).toBe('KRNL0 0.11.0 · Windows 11 · x64');
  });
});

describe('taskbar / menu bar view (F10, F11)', () => {
  const now = Date.parse('2026-11-06T10:00:00Z');
  const snap = (state: Partial<ReturnType<typeof defaultPomoState>>, config: Partial<ReturnType<typeof defaultPomoConfig>> = {}): PocketSnapshot => ({
    nodeId: 'pomo', state: { ...defaultPomoState(), ...state }, config: { ...defaultPomoConfig(), ...config },
    easy: false, away: false, library: [], face: 'blocks', root: { attrs: {}, style: '' },
  });
  it('idle shows nothing', () => {
    expect(systemTimerView(null, now)).toEqual(IDLE_VIEW);
    expect(systemTimerView(snap({ status: 'idle' }), now).live).toBe(false);
  });
  it('Pomodoro: progress fills, paused is yellow, controls match the node', () => {
    const started = new Date(now - 5 * 60_000).toISOString();
    const v = systemTimerView(snap({ status: 'running', startedAt: started, durationMin: 25, sessionWorkSec: 0 }, { sessionMin: 25 }), now);
    expect(v.progress).toBeCloseTo(0.2, 2);
    expect(v.time).toBe('20:00');
    expect(v.barMode).toBe('normal');
    expect(v.controls.map((c) => c.id)).toEqual(['stop', 'break', 'pause']);
    const p = systemTimerView(snap({ status: 'paused', startedAt: null, durationMin: 25, sessionWorkSec: 300 }, { sessionMin: 25 }), now);
    expect(p.barMode).toBe('paused');
    expect(p.label).toBe('Paused');
  });
  it('Observe counts up with no bar; breaks get a badge', () => {
    const started = new Date(now - 65 * 60_000).toISOString();
    const o = systemTimerView(snap({ status: 'running', startedAt: started, sessionWorkSec: 0 }, { mode: 'observe' }), now);
    expect(o.progress).toBeNull();
    expect(o.badge).toBe('observe');
    expect(o.time).toBe('1:05:00 ↑');
    const b = systemTimerView(snap({ status: 'break', startedAt: started }), now);
    expect(b.badge).toBe('break');
    expect(b.time.startsWith('break ')).toBe(true);
  });
  it('no controls while KRNL0 asks about time away', () => {
    const v = { ...snap({ status: 'running', startedAt: new Date(now).toISOString() }), away: true };
    expect(systemTimerView(v, now).controls).toEqual([]);
  });
});

describe('feedback links stay openable with any title (F16, CLI too)', () => {
  it('a pasted paragraph as the title is cut, and both links stay within limits and pass the open-link check', () => {
    const r = { kind: 'bug' as const, title: 'word '.repeat(3000), text: 'z'.repeat(9000), diagnostics: null, includeErrors: false };
    const issue = buildIssueUrl(r);
    const mail = buildMailto(r);
    expect(issue.length).toBeLessThanOrEqual(MAX_URL_LENGTH);
    expect(mail.length).toBeLessThanOrEqual(MAX_MAILTO_LENGTH);
    expect(isAllowedExternalUrl(issue)).toBe(true);
    expect(isAllowedExternalUrl(mail)).toBe(true);
    expect(new URL(issue).searchParams.get('title')!.length).toBeLessThanOrEqual('Bug: '.length + MAX_TITLE_LENGTH);
  });
});

describe('krnl feedback --kind', () => {
  it('a mistyped kind is an error, not a silent bug report', async () => {
    const { feedbackLink } = await import('../../../src/sys/commands/launch');
    expect(feedbackLink('Calendar', 'idae').ok).toBe(false);
    expect(feedbackLink('Calendar', 'idea').ok).toBe(true);
    expect(feedbackLink('Calendar', undefined).ok).toBe(true);
  });
});
