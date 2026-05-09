import { spawn } from 'child_process';
import type { BrainProvider, BrainContext, BrainReply } from './BrainProvider';

export class OllamaProvider implements BrainProvider {
  constructor(private modelName: string) {}

  async ask(prompt: string, ctx: BrainContext): Promise<BrainReply> {
    const start = Date.now();
    // TODO (Week 5): pipe systemPrompt + boardSnapshot + prompt via stdin to `ollama run`
    // Parse lines starting with "RUN: sys ..." and execute them
    void ctx;

    return new Promise((resolve, reject) => {
      const child = spawn('ollama', ['run', this.modelName], { env: process.env });
      let output = '';

      child.stdout.on('data', (c: Buffer) => { output += c.toString(); });
      child.stdin.write(prompt);
      child.stdin.end();

      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`ollama exited with code ${code ?? 'null'}`));
          return;
        }
        resolve({ text: output.trim(), durationMs: Date.now() - start });
      });

      child.on('error', (err) => reject(err));
    });
  }
}
