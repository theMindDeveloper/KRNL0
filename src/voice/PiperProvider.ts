import { spawn } from 'child_process';
import type { TtsProvider } from './TtsProvider';

export class PiperProvider implements TtsProvider {
  constructor(private piperBin: string = 'piper') {}

  async speak(text: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // TODO (Week 6): pipe text to piper, capture raw audio, play via OS audio
      // piper --output-raw | aplay (Linux) / afplay (Mac) / wmplayer (Win)
      const child = spawn(this.piperBin, ['--output-raw'], { env: process.env });

      child.stdin.write(text);
      child.stdin.end();

      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`piper exited with code ${code ?? 'null'}`));
          return;
        }
        resolve();
      });

      child.on('error', (err) => reject(err));
    });
  }
}
