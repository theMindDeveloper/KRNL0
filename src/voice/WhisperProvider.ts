import { spawn } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { SttProvider } from './SttProvider';

export class WhisperProvider implements SttProvider {
  constructor(
    private whisperBin: string = 'whisper',
    private model: string = 'base.en'
  ) {}

  async transcribe(audio: Buffer): Promise<string> {
    const tmp = join(tmpdir(), `krnl0-audio-${Date.now()}.wav`);
    writeFileSync(tmp, audio);

    return new Promise((resolve, reject) => {
      // TODO (Week 5): integrate whisper.cpp binary properly
      // whisper.cpp CLI: whisper -m models/base.en.bin -f audio.wav --output-txt
      const child = spawn(this.whisperBin, [
        tmp,
        '--model', this.model,
        '--output-txt',
        '--no-timestamps',
      ]);
      let out = '';

      child.stdout.on('data', (c: Buffer) => { out += c.toString(); });
      child.on('close', (code) => {
        try { unlinkSync(tmp); } catch { /* ignore cleanup error */ }
        if (code !== 0) {
          reject(new Error(`whisper exited with code ${code ?? 'null'}`));
          return;
        }
        resolve(out.trim());
      });

      child.on('error', (err) => {
        try { unlinkSync(tmp); } catch { /* ignore */ }
        reject(err);
      });
    });
  }
}
