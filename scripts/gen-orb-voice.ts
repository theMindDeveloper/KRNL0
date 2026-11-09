// Records the orb's own lines (greetings, click replies, the focus session,
// the Commander) in the guide's voice with ElevenLabs (#225), so the app has
// one voice. Writes src/renderer/components/Assistant/audio/voice/<id>.mp3 —
// clipMap.ts maps each id to that file. Existing clips are kept unless
// FORCE=1. The key is read from the environment only: never put it in a file.
//
//   ELEVENLABS_API_KEY=… ELEVENLABS_VOICE_ID=… npx vite-node scripts/gen-orb-voice.ts

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { ORB_LINES } from '../src/renderer/components/Assistant/orbLines';

const KEY = process.env.ELEVENLABS_API_KEY;
const VOICE = process.env.ELEVENLABS_VOICE_ID;
const MODEL = process.env.ELEVENLABS_MODEL ?? 'eleven_v4';
const OUT = join(process.cwd(), 'src/renderer/components/Assistant/audio/voice');

async function main(): Promise<void> {
  if (!KEY || !VOICE) throw new Error('Set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID');
  mkdirSync(OUT, { recursive: true });
  let made = 0;
  for (const [id, line] of Object.entries(ORB_LINES)) {
    const file = join(OUT, `${id}.mp3`);
    if (existsSync(file) && process.env.FORCE !== '1') continue;
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text: line.say, model_id: MODEL, language_code: 'en', voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
    });
    if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    made++;
    console.log(`${id}  ${line.say}`);
  }
  console.log(`done: ${made} recorded`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
