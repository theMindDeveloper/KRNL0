import { spawn } from 'child_process';
import type { BrainProvider, BrainContext, BrainReply } from './BrainProvider';

export class ClaudeCodeProvider implements BrainProvider {
  constructor(private cliPath: string) {}

  async ask(prompt: string, ctx: BrainContext): Promise<BrainReply> {
    const start = Date.now();

    return new Promise((resolve, reject) => {
      const child = spawn(
        this.cliPath,
        [
          '-p', prompt,
          '--output-format', 'json',
          '--allowedTools', 'Bash,Read,Edit,Write',
        ],
        { cwd: ctx.workingDir, env: process.env }
      );

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
      child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`claude exited with code ${code}: ${stderr.trim()}`));
          return;
        }
        try {
          const parsed = JSON.parse(stdout) as { result?: string };
          resolve({
            text: parsed.result ?? stdout.trim(),
            durationMs: Date.now() - start,
          });
        } catch {
          resolve({ text: stdout.trim(), durationMs: Date.now() - start });
        }
      });

      child.on('error', (err) => reject(err));
    });
  }
}
