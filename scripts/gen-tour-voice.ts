// Records the guide's voice for the tours with ElevenLabs.
//
//   ELEVENLABS_API_KEY=… ELEVENLABS_VOICE_ID=… npx vite-node scripts/gen-tour-voice.ts [tourId …]
//
// No ids: every tour. For each step, in Easy and in Advanced (Observe and Pomo), it works out
// what the guide says (tourVoice.spokenText) and writes
// src/renderer/components/Tour/voice/<key>.mp3 unless that clip exists, so a
// rerun only records new or reworded steps. voice/manifest.json lists every
// clip with its words. The key is read from the environment only: never put
// it in a file.

import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { TOURS, stepsFor } from '../src/renderer/components/Tour/tours';
import { spokenText, voiceKey } from '../src/renderer/components/Tour/tourVoice';

const KEY = process.env.ELEVENLABS_API_KEY;
const VOICE = process.env.ELEVENLABS_VOICE_ID;
// Eleven v4 (Sep 2026): follows audio tags; no SSML, no speed/style sliders.
const MODEL = process.env.ELEVENLABS_MODEL ?? 'eleven_v4';
const OUT = join(process.cwd(), 'src/renderer/components/Tour/voice');

async function main(): Promise<void> {
  if (!KEY || !VOICE) throw new Error('Set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID');
  mkdirSync(OUT, { recursive: true });
  const manifestPath = join(OUT, 'manifest.json');
  const only = process.argv.slice(2);
  // A full run rebuilds the list (clips no step says any more are removed at the end).
  const manifest: Record<string, { text: string; tours: string[] }> = existsSync(manifestPath) && only.length
    ? JSON.parse(readFileSync(manifestPath, 'utf8'))
    : {};
  const tours = only.length ? TOURS.filter((t) => only.includes(t.id)) : TOURS;
  if (tours.length === 0) throw new Error(`No tour called ${only.join(', ')}`);

  let made = 0;
  let kept = 0;
  const dry = process.env.DRY_RUN === '1';
  let chars = 0;
  const seen = new Set<string>();
  for (const tour of tours) {
    // Every view a user can be in: Easy (Record), Advanced with Observe, Advanced with Pomo.
    // The timer's name and its steps differ between them.
    for (const [mode, timer] of [['easy', 'stopwatch'], ['advanced', 'stopwatch'], ['advanced', 'pomo']] as const) {
      if (tour.onlyIn && tour.onlyIn !== mode) continue;
      for (const step of stepsFor(tour, mode, timer)) {
        const text = spokenText(step.text, mode, step.say, timer);
        if (seen.has(text)) continue;
        seen.add(text);
        const key = voiceKey(text);
        const entry = manifest[key] ?? { text, tours: [] };
        if (!entry.tours.includes(tour.id)) entry.tours.push(tour.id);
        manifest[key] = entry;
        const file = join(OUT, `${key}.mp3`);
        if (existsSync(file)) { kept++; continue; }
        chars += text.length;
        if (dry) { made++; continue; }
        const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_128`, {
          method: 'POST',
          headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
          // stability 0.5 = "Natural": expressive but steady across clips.
          body: JSON.stringify({ text, model_id: MODEL, language_code: 'en', voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
        });
        if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`);
        writeFileSync(file, Buffer.from(await res.arrayBuffer()));
        made++;
        console.log(`${key}  ${tour.id}/${mode}  ${text.slice(0, 70)}${text.length > 70 ? '…' : ''}`);
      }
    }
  }
  if (dry) { console.log(`dry run: ${made} to record (${chars} characters), ${kept} already there`); return; }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  if (!only.length) {
    let removed = 0;
    for (const f of readdirSync(OUT)) if (f.endsWith('.mp3') && !manifest[f.slice(0, -4)]) { unlinkSync(join(OUT, f)); removed++; }
    if (removed) console.log(`removed ${removed} clips no step says any more`);
  }
  console.log(`done: ${made} recorded (${chars} characters), ${kept} already there`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
