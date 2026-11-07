/** The orb's opening line fits how long you were away. */
import { describe, it, expect, vi } from 'vitest';
vi.mock('../../../src/renderer/voice/voicePlayer', () => ({ voicePlayer: { play: vi.fn(async () => undefined) } }));
import { pickGreeting } from '../../../src/renderer/components/Orb';

const pool = [
  { clip: 'click_hey', text: 'hey.' },
  { clip: 'pa_welcome_back', text: "welcome back. the board's where you left it." },
  { clip: 'pa_been_a_minute', text: 'been a minute.' },
];

describe('orb greeting', () => {
  it('after a short absence (or unknown), never "been a minute" or "welcome back"', () => {
    for (const away of [null, 30_000, 3 * 3_600_000]) {
      for (let r = 0; r < 1; r += 0.05) expect(pickGreeting(pool, away, r).clip).toBe('click_hey');
    }
  });
  it('after 4 hours or more, those lines can come up', () => {
    const seen = new Set<string>();
    for (let r = 0; r < 1; r += 0.05) seen.add(pickGreeting(pool, 5 * 3_600_000, r).clip);
    expect(seen.has('pa_been_a_minute')).toBe(true);
    expect(seen.has('pa_welcome_back')).toBe(true);
  });
});
