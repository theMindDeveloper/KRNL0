// @vitest-environment jsdom
/** UI sound packs — docs/06-requirements/ui-sounds.md (F1–F8). */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Node } from '../../../src/shared/types';
import { SOUND_MOMENTS, SOUND_PACK_IDS, spriteWindow } from '../../../src/renderer/sfx/soundPacks';
import { commandCanSound, momentFromChange, soundSnapshot } from '../../../src/renderer/sfx/soundMoments';
import {
  DEFAULT_SOUND_SETTINGS, parseSoundSettings, SOUND_SETTINGS_KEY, useSoundSettings,
} from '../../../src/renderer/sfx/soundSettings';
import { resolvePhrase, uiSounds } from '../../../src/renderer/sfx/uiSounds';
import { runSoundCommand } from '../../../src/renderer/sfx/soundCli';
import { SysParser } from '../../../src/sys/parser';

const node = (id: string, kind: string, state: unknown): Node => ({ id, kind, position: { x: 0, y: 0 }, state, config: {}, isMother: false });
const task = (id: string, done = false, scheduledFor?: string) => node(id, 'todo.task', { text: id, done, ...(scheduledFor ? { scheduledFor } : {}) });
const todo = (items: Array<{ id: string; done?: boolean; scheduledFor?: string }>) =>
  node('todo', 'todo', { items: items.map((i) => ({ done: false, ...i })) });
const pomo = (status: string, sessionsCompleted = 0) => node('pomo', 'pomo', { status, sessionsCompleted });
const habits = (logs: string[][]) => node('habit', 'habit', { habits: logs.map((log, i) => ({ id: `h${i}`, log })) });
const snap = (...nodes: Node[]) => soundSnapshot({ nodes });

function resetSettings() {
  localStorage.clear();
  useSoundSettings.setState({ ...DEFAULT_SOUND_SETTINGS });
}

describe('F1 — packs and defaults', () => {
  beforeEach(resetSettings);

  it('ships snd01, zen and crisp; snd01 is the default, sounds on', () => {
    expect([...SOUND_PACK_IDS]).toEqual(['snd01', 'zen', 'crisp']);
    expect(parseSoundSettings(null)).toEqual({ pack: 'snd01', volume: 70, enabled: true });
  });

  it('every pack has a bundled sound for every moment', () => {
    for (const pack of SOUND_PACK_IDS) {
      for (const m of SOUND_MOMENTS) expect(resolvePhrase(pack, m), `${pack}/${m}`).not.toBeNull();
    }
  });

  it('SND sprite slices play at least 100 ms, like snd-lib', () => {
    expect(spriteWindow({ start: 30, end: 30.01 })).toEqual({ offset: 30, duration: 0.1 });
    expect(spriteWindow({ start: 4, end: 5 })).toEqual({ offset: 4, duration: 1 });
    const done = resolvePhrase('snd01', 'done');
    expect(done?.[0]?.offset).toBe(16);
  });

  it('neighbouring moments are different phrases; Start counts in before it goes', () => {
    for (const pack of SOUND_PACK_IDS) {
      const start = resolvePhrase(pack, 'start')!;
      expect(start.length).toBeGreaterThanOrEqual(4);
      expect(start.slice(0, 3).map((s) => s.at)).toEqual([0, 170, 340]);
      const key = (m: Parameters<typeof resolvePhrase>[1]) => JSON.stringify(resolvePhrase(pack, m));
      const set = new Set(['start', 'pause', 'resume', 'break', 'stop', 'done', 'delete'].map((m) => key(m as never)));
      expect(set.size, pack).toBe(7);
    }
  });
});

describe('F2/F3 — the moment comes from what changed', () => {
  it('ticking a task done is "done"; un-ticking is "reopen"', () => {
    expect(momentFromChange(snap(task('a')), snap(task('a', true)))).toBe('done');
    expect(momentFromChange(snap(task('a', true)), snap(task('a')))).toBe('reopen');
  });

  it('a to-do item ticked done is "done"', () => {
    expect(momentFromChange(snap(todo([{ id: '1' }])), snap(todo([{ id: '1', done: true }])))).toBe('done');
  });

  it('done wins when ticking a task also stops the timer', () => {
    expect(momentFromChange(snap(task('a'), pomo('running')), snap(task('a', true), pomo('idle')))).toBe('done');
  });

  it('timer: start, pause, resume, break, back from break, stop, session done', () => {
    const p = (a: string, b: string) => momentFromChange(snap(pomo(a)), snap(pomo(b)));
    expect(p('idle', 'running')).toBe('start');
    expect(p('running', 'paused')).toBe('pause');
    expect(p('paused', 'running')).toBe('resume');
    expect(p('running', 'break')).toBe('break');
    expect(p('break', 'running')).toBe('resume');
    expect(p('running', 'idle')).toBe('stop');
    expect(p('break', 'idle')).toBe('stop');
    expect(momentFromChange(snap(pomo('running', 1)), snap(pomo('break', 2)))).toBe('sessionDone');
  });

  it('habit check-in and its removal', () => {
    expect(momentFromChange(snap(habits([[]])), snap(habits([['2026-11-06']])))).toBe('habit');
    expect(momentFromChange(snap(habits([['2026-11-06']])), snap(habits([[]])))).toBe('unhabit');
  });

  it('add, delete (also of a done task), plan', () => {
    expect(momentFromChange(snap(todo([])), snap(todo([{ id: '1' }])))).toBe('add');
    expect(momentFromChange(snap(task('a'), task('b')), snap(task('a')))).toBe('delete');
    expect(momentFromChange(snap(task('a', true)), snap())).toBe('delete');
    expect(momentFromChange(snap(task('a')), snap(task('a', false, '2026-11-06T14:00')))).toBe('plan');
    expect(momentFromChange(snap(), snap(task('a', false, '2026-11-06T14:00')))).toBe('plan');
  });

  it('nothing that matters changed: no sound', () => {
    expect(momentFromChange(snap(task('a')), snap(task('a')))).toBeNull();
  });

  it('only action families can sound; view changes and time keeping never', () => {
    expect(commandCanSound('todo.toggle')).toBe(true);
    expect(commandCanSound('pomo.start')).toBe(true);
    expect(commandCanSound('calendar.schedule')).toBe(true);
    expect(commandCanSound('calendar.setZoom')).toBe(false);
    expect(commandCanSound('task.accumulateSeconds')).toBe(false);
    expect(commandCanSound('clock.setViewWindow')).toBe(false);
  });
});

describe('F5 — settings persist', () => {
  beforeEach(resetSettings);

  it('pack, volume and on/off are written to localStorage and read back', () => {
    useSoundSettings.getState().setPack('crisp');
    useSoundSettings.getState().setVolume(40);
    useSoundSettings.getState().setEnabled(false);
    expect(parseSoundSettings(localStorage.getItem(SOUND_SETTINGS_KEY))).toEqual({ pack: 'crisp', volume: 40, enabled: false });
  });

  it('bad stored values fall back to defaults; volume is clamped', () => {
    expect(parseSoundSettings('not json')).toEqual(DEFAULT_SOUND_SETTINGS);
    expect(parseSoundSettings('{"pack":"nope","volume":250,"enabled":"yes"}')).toEqual({ pack: 'snd01', volume: 100, enabled: true });
  });
});

describe('F6/F8 — engine', () => {
  let starts = 0;
  let fetches = 0;

  beforeEach(() => {
    resetSettings();
    uiSounds.resetGuard();
    starts = 0;
    fetches = 0;
    const gain = () => ({ gain: { value: 1 }, connect: (x: unknown) => x, disconnect: () => {} });
    class FakeContext {
      state = 'running';
      currentTime = 0;
      destination = {};
      createGain = gain;
      createBufferSource = () => ({ buffer: null, playbackRate: { value: 1 }, connect: (x: unknown) => x, disconnect: () => {}, start: () => { starts += 1; }, onended: null });
      decodeAudioData = () => Promise.resolve({ duration: 0.2 });
      resume = () => Promise.resolve();
    }
    vi.stubGlobal('AudioContext', FakeContext);
    window.AudioContext = FakeContext as unknown as typeof AudioContext;
    vi.stubGlobal('fetch', () => { fetches += 1; return Promise.resolve({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }); });
  });

  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('F6 — with sounds off nothing is fetched or played', async () => {
    useSoundSettings.getState().setEnabled(false);
    uiSounds.play('done');
    await flush();
    expect(fetches).toBe(0);
    expect(starts).toBe(0);
  });

  it('F6 — volume 0 plays nothing', async () => {
    useSoundSettings.getState().setVolume(0);
    uiSounds.play('add');
    await flush();
    expect(starts).toBe(0);
  });

  it('F8 — the same moment twice within 80 ms plays once', async () => {
    uiSounds.play('add');
    uiSounds.play('add');
    await flush();
    expect(starts).toBe(2); // one phrase of two hits
  });
});

describe('F7 — sys sound', () => {
  beforeEach(resetSettings);

  it('parses every subcommand', () => {
    expect(SysParser.parse(['sound'])).toEqual({ kind: 'sound', sub: 'status' });
    expect(SysParser.parse(['sound', 'pack', 'zen'])).toEqual({ kind: 'sound', sub: 'pack', pack: 'zen' });
    expect(SysParser.parse(['sound', 'volume', '30'])).toEqual({ kind: 'sound', sub: 'volume', volume: 30 });
    expect(SysParser.parse(['sound', 'off'])).toEqual({ kind: 'sound', sub: 'off' });
    expect(SysParser.parse(['sound', 'play', 'done'])).toEqual({ kind: 'sound', sub: 'play', moment: 'done' });
  });

  it('sets the same store as Settings', () => {
    expect(runSoundCommand('sound.pack', { pack: 'zen' }).ok).toBe(true);
    expect(runSoundCommand('sound.volume', { volume: 30 }).ok).toBe(true);
    expect(runSoundCommand('sound.off', {}).ok).toBe(true);
    const s = useSoundSettings.getState();
    expect([s.pack, s.volume, s.enabled]).toEqual(['zen', 30, false]);
    expect(runSoundCommand('sound.status', {}).message).toBe('sound: off · pack zen (Zen) · volume 30');
  });

  it('rejects unknown packs, moments and bad volumes', () => {
    expect(runSoundCommand('sound.pack', { pack: 'industrial' }).ok).toBe(false);
    expect(runSoundCommand('sound.play', { moment: 'explode' }).ok).toBe(false);
    expect(runSoundCommand('sound.volume', { volume: 101 }).ok).toBe(false);
  });
});
