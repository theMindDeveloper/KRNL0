// Prints every tour as each user meets it (Easy; Advanced with Pomo; Advanced
// with Observe): the words on the card and what the voice says. For reviewing
// the scripts before recording (npx tsx scripts/print-tour-scripts.ts > out.md).
import { TOURS, stepsFor } from '../src/renderer/components/Tour/tours';
import { fillTour, spokenText } from '../src/renderer/components/Tour/tourVoice';

const VIEWS = [
  { name: 'Easy', mode: 'easy', timer: 'stopwatch' },
  { name: 'Advanced · Pomo', mode: 'advanced', timer: 'pomo' },
  { name: 'Advanced · Observe', mode: 'advanced', timer: 'stopwatch' },
] as const;

const out: string[] = ['# Tour scripts, as each user meets them', ''];
for (const t of TOURS) {
  out.push(`## ${t.id}`, '');
  const seen = new Map<string, string[]>();
  for (const v of VIEWS) {
    if (t.onlyIn && t.onlyIn !== v.mode) continue;
    const steps = stepsFor(t, v.mode, v.timer);
    const body = steps.map((s, i) => `${i + 1}. **Card:** ${fillTour(s.text, v.mode, v.timer).replace(/\*\*/g, '')}\n   **Voice:** ${spokenText(s.text, v.mode, s.say, v.timer)}`).join('\n');
    const key = `${fillTour(t.title, v.mode, v.timer)}\n${body}`;
    seen.set(key, [...(seen.get(key) ?? []), v.name]);
  }
  for (const [key, names] of seen) {
    const [title, ...rest] = key.split('\n');
    out.push(`### ${names.join(' = ')} — “${title}”`, '', rest.join('\n'), '');
  }
}
process.stdout.write(out.join('\n'));
