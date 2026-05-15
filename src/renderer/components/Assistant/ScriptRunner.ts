import type { Flow, FlowStep, BoardSnapshot, OrbState } from './types';
import type { VoicePlayer } from './VoicePlayer';
import type { Viewport } from '@xyflow/react';

// Callbacks the runner uses to update React state and the canvas.
export type RunnerDeps = {
  voice: VoicePlayer;
  setCaption: (text: string | null) => void;
  setOrbState: (state: OrbState) => void;
  setActiveFlowId: (id: string | null) => void;
  setViewport: (vp: Viewport, opts?: { duration?: number }) => void;
  getBoardSnapshot: () => BoardSnapshot;
};

export class ScriptRunner {
  private aborted = false;
  private ptySession: string | null = null;

  constructor(private deps: RunnerDeps) {}

  abort(): void {
    this.aborted = true;
    this.deps.voice.stop();
    if (this.ptySession) {
      window.krnl?.ptyKill(this.ptySession).catch(() => {});
      this.ptySession = null;
    }
    this.deps.setCaption(null);
    this.deps.setOrbState('idle');
    this.deps.setActiveFlowId(null);
  }

  async run(flow: Flow, params?: Record<string, string>): Promise<void> {
    this.aborted = false;
    this.deps.setActiveFlowId(flow.id);

    const snapshot = this.deps.getBoardSnapshot();
    const steps = flow.steps(snapshot, params);

    for (const step of steps) {
      if (this.aborted) break;
      await this.executeStep(step);
    }

    if (!this.aborted) {
      this.deps.setCaption(null);
      this.deps.setOrbState('idle');
      this.deps.setActiveFlowId(null);
    }
  }

  private async executeStep(step: FlowStep): Promise<void> {
    if (this.aborted) return;

    switch (step.kind) {
      case 'speak': {
        this.deps.setOrbState('speaking');
        this.deps.setCaption(step.text);
        await this.deps.voice.play(step.clip).catch(() => {
          // Clip missing — wait proportional to word count so timing feels right.
          const ms = Math.max(1500, step.text.split(' ').length * 280);
          return new Promise<void>((r) => setTimeout(r, ms));
        });
        break;
      }

      case 'camera': {
        this.deps.setViewport(
          { x: step.x, y: step.y, zoom: step.zoom },
          { duration: 800 },
        );
        break;
      }

      case 'runCommand': {
        this.deps.setOrbState('running');
        this.deps.setCaption(`$ krnl ${step.argv.join(' ')}`);

        await this.runViaPty(step.argv);

        this.deps.setOrbState('speaking');
        break;
      }

      case 'wait': {
        await new Promise<void>((r) => setTimeout(r, step.ms));
        break;
      }

      case 'waitForBoard': {
        this.deps.setOrbState('idle');
        this.deps.setCaption(step.caption);

        const startedAt = Date.now();
        const POLL_MS = 500;
        let satisfied = false;

        while (!this.aborted && Date.now() - startedAt < step.timeoutMs) {
          if (step.predicate(this.deps.getBoardSnapshot())) {
            satisfied = true;
            break;
          }
          await new Promise<void>((r) => setTimeout(r, POLL_MS));
        }

        if (!satisfied && !this.aborted && step.onTimeout) {
          this.deps.setOrbState('speaking');
          this.deps.setCaption(step.onTimeout.text);
          await this.deps.voice.play(step.onTimeout.clip).catch(() => {
            const ms = Math.max(1500, step.onTimeout!.text.split(' ').length * 280);
            return new Promise<void>((r) => setTimeout(r, ms));
          });
        }
        break;
      }

      case 'verify': {
        const branch = step.predicate(this.deps.getBoardSnapshot()) ? step.onPass : step.onFail;
        for (const sub of branch) {
          if (this.aborted) break;
          await this.executeStep(sub);
        }
        break;
      }
    }
  }

  // Spawn a hidden PTY, run the krnl command, wait for exit or 5s timeout.
  // Falls back gracefully if krnl isn't in PATH.
  private async runViaPty(argv: string[]): Promise<void> {
    try {
      const result = await window.krnl?.ptyCreate(80, 24);
      if (!result) {
        await new Promise<void>((r) => setTimeout(r, 1500));
        return;
      }
      const sessionId = typeof result === 'string' ? result : result.sessionId;
      this.ptySession = sessionId;

      await new Promise<void>((resolve) => {
        const TIMEOUT = 5000;
        let settled = false;

        const settle = () => {
          if (settled) return;
          settled = true;
          this.ptySession = null;
          resolve();
        };

        const unsubExit = window.krnl!.onPtyExit(sessionId, settle);
        window.krnl!.ptyWrite(sessionId, `krnl ${argv.join(' ')}\r`);

        setTimeout(() => {
          unsubExit();
          window.krnl?.ptyKill(sessionId).catch(() => {});
          settle();
        }, TIMEOUT);
      });
    } catch {
      await new Promise<void>((r) => setTimeout(r, 1500));
    }
  }
}
