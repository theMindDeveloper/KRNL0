/** The guide's recorded voice (tourVoice.ts, scripts/gen-tour-voice.ts). */
import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { join } from 'path';
import { fillTour, spokenText, timerName, tourTitleOn, voiceKey } from '../../../src/renderer/components/Tour/tourVoice';
import { TOURS, stepsFor } from '../../../src/renderer/components/Tour/tours';
import { ORB_LINES } from '../../../src/renderer/components/Assistant/orbLines';

const VOICE = join(process.cwd(), 'src/renderer/components/Tour/voice');

describe('spoken text', () => {
  it('a step without a script is read as words: keys, arrows, capitals', () => {
    expect(spokenText('**Esc** stops. Settings → Mode. Press **START**.', 'easy')).toBe('Escape stops. Settings, Mode. Press "Start".');
  });
  it('the clip name follows the words exactly', () => {
    expect(voiceKey('a')).not.toBe(voiceKey('b'));
    expect(voiceKey('same')).toBe(voiceKey('same'));
  });
});

describe('The timer is named as its window shows it', () => {
  it('Record in Easy, Observe with the stopwatch, Pomo with sessions', () => {
    expect(timerName('easy', 'stopwatch')).toBe('Record');
    expect(timerName('advanced', 'stopwatch')).toBe('Observe');
    expect(timerName('advanced', 'pomo')).toBe('Pomo');
    expect(spokenText('x', 'advanced', 'The {pomo} timer.', 'stopwatch')).toBe('The Observe timer.');
    expect(fillTour('{pomo} — your timer', 'easy', 'stopwatch')).toBe('Record — your timer');
  });
  it('menus show the tour title for the board: Easy, Observe, Pomo', () => {
    const board = (uiMode: string, mode: string) => ({ uiMode, nodes: [{ kind: 'pomo', isMother: true, config: { mode } }] });
    expect(tourTitleOn('{pomo} — your timer', board('easy', 'pomodoro'))).toBe('Record — your timer');
    expect(tourTitleOn('{pomo} — your timer', board('advanced', 'observe'))).toBe('Observe — your timer');
    expect(tourTitleOn('{pomo} — your timer', board('advanced', 'pomodoro'))).toBe('Pomo — your timer');
  });
});

describe('Every tour is voiced (#227), in plain words', () => {
  it('each step has words for the voice: no mood tags, no pauses, no trailing dots, nothing it would garble', () => {
    for (const t of TOURS) for (const s of t.steps) {
      expect(s.say, `${t.id}: ${s.text}`).toBeTruthy();
      // Tags, [Brief pause] and "..." make the voice drop at the end of a line (owner, 2026-11-09).
      expect(s.say!, `${t.id}: ${s.say}`).not.toMatch(/\[[a-zA-Z ]+\]|\.\.\.|…/);
      expect(s.say!, `${t.id}: ${s.say}`).not.toMatch(/\bEsc\b|→|\*\*|\b[A-Z]{3,}\b|\d|KRNL0/);
      // The voice reads "Todo" as "toodoo": the words say "To-do" (owner, 2026-11-09).
      expect(s.say!, `${t.id}: ${s.say}`).not.toMatch(/\bTodo\b/);
    }
  });
  it('the orb speaks the same way, and its "Aha" goes up', () => {
    for (const [id, l] of Object.entries(ORB_LINES)) expect(l.say, id).not.toMatch(/\[[a-zA-Z ]+\]|\.\.\.|…/);
    expect(ORB_LINES.click_aha1!.say).toBe('Aha?');
    expect(ORB_LINES.click_aha2!.say).toBe('Aha?');
  });
  // Every step a user can meet — Easy, Advanced with Observe, Advanced with Pomo — has its clip.
  for (const t of TOURS) {
    for (const [mode, timer] of [['easy', 'stopwatch'], ['advanced', 'stopwatch'], ['advanced', 'pomo']] as const) {
      if (t.onlyIn && t.onlyIn !== mode) continue;
      it(`${t.id} (${mode}, ${timer}): every step has its clip`, () => {
        for (const s of stepsFor(t, mode, timer)) {
          const key = voiceKey(spokenText(s.text, mode, s.say, timer));
          expect(existsSync(join(VOICE, `${key}.mp3`)), `${key}: ${s.text}`).toBe(true);
        }
      });
    }
  }
});
