/** The guide's recorded voice (tourVoice.ts, scripts/gen-tour-voice.ts). */
import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { join } from 'path';
import { spokenText, voiceKey } from '../../../src/renderer/components/Tour/tourVoice';
import { TOURS, stepsFor } from '../../../src/renderer/components/Tour/tours';

const VOICE = join(process.cwd(), 'src/renderer/components/Tour/voice');

describe('spoken text', () => {
  it('a step without a script is read as words: keys, arrows, capitals', () => {
    expect(spokenText('**Esc** stops. Settings → Mode. Press **START**.', 'easy')).toBe('Escape stops. Settings, Mode. Press "Start".');
  });
  it('a script keeps its audio tags and fills the mode words', () => {
    expect(spokenText('x', 'easy', '[calm] The {pomo} timer.')).toBe('[calm] The Record timer.');
    expect(spokenText('x', 'advanced', '[calm] The {pomo} timer.')).toBe('[calm] The Pomo timer.');
  });
  it('the clip name follows the words exactly', () => {
    expect(voiceKey('a')).not.toBe(voiceKey('b'));
    expect(voiceKey('same')).toBe(voiceKey('same'));
  });
});

describe('Every tour is voiced (#227)', () => {
  it('each step has its own words for the voice, with audio tags, nothing the voice would garble', () => {
    for (const t of TOURS) for (const s of t.steps) {
      expect(s.say, `${t.id}: ${s.text}`).toBeTruthy();
      expect(s.say!, `${t.id}: ${s.say}`).toMatch(/\[[a-zA-Z ]+\]/);
      expect(s.say!, `${t.id}: ${s.say}`).not.toMatch(/\bEsc\b|→|\*\*|\b[A-Z]{3,}\b|\d|KRNL0/);
    }
  });
  // Every step a user can meet — each mode, each way the timer works — has its clip.
  for (const t of TOURS) {
    for (const mode of ['easy', 'advanced'] as const) {
      if (t.onlyIn && t.onlyIn !== mode) continue;
      for (const timer of mode === 'easy' ? (['stopwatch'] as const) : (['stopwatch', 'pomo'] as const)) {
        it(`${t.id} (${mode}, ${timer}): every step has its clip`, () => {
          for (const s of stepsFor(t, mode, timer)) {
            const key = voiceKey(spokenText(s.text, mode, s.say));
            expect(existsSync(join(VOICE, `${key}.mp3`)), `${key}: ${s.text}`).toBe(true);
          }
        });
      }
    }
  }
});
