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

// Default breath between consecutive spoken lines. Without it, ElevenLabs
// clips feel rushed when stacked back-to-back. Tune here if needed.
const SPEAK_TAIL_PAUSE_MS = 700;

// How often waitForBoard re-checks its predicate. Lower = snappier reaction
// when the user takes an action mid-flow, but more wasted polls. 150ms feels
// near-instant without burning CPU.
const WAIT_FOR_BOARD_POLL_MS = 150;

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

    for (let i = 0; i < steps.length; i++) {
      if (this.aborted) break;
      const step = steps[i]!;
      const next = steps[i + 1];
      await this.executeStep(step, next);
    }

    if (!this.aborted) {
      this.deps.setCaption(null);
      this.deps.setOrbState('idle');
      this.deps.setActiveFlowId(null);
    }
  }

  private async executeStep(step: FlowStep, next?: FlowStep): Promise<void> {
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
        // Breath between lines — but skip it when the next step is going
        // to wait for the user. Handing off to user input mode, so the
        // tail pause just adds dead air when the user is already acting.
        const handsOffToUser = next?.kind === 'waitForBoard';
        if (!handsOffToUser) {
          await new Promise<void>((r) => setTimeout(r, SPEAK_TAIL_PAUSE_MS));
        }
        break;
      }

      case 'camera': {
        this.deps.setViewport(
          { x: step.x, y: step.y, zoom: step.zoom },
          { duration: 800 },
        );
        break;
      }

      case 'cameraToNode': {
        const snap = this.deps.getBoardSnapshot();
        const pos = snap.nodePositions[step.nodeKind];
        if (!pos) break; // node not on board — silently skip the pan
        const zoom = step.zoom ?? snap.viewport.zoom ?? 1;
        // Approximate node-center offset (mother nodes are ~300×200).
        // Tune per-kind later if needed.
        const NODE_HALF_W = 150;
        const NODE_HALF_H = 100;
        const cx = pos.x + NODE_HALF_W;
        const cy = pos.y + NODE_HALF_H;
        const W = typeof window !== 'undefined' ? window.innerWidth  : 1280;
        const H = typeof window !== 'undefined' ? window.innerHeight : 800;
        this.deps.setViewport(
          { x: W / 2 - cx * zoom, y: H / 2 - cy * zoom, zoom },
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

      case 'radioMoveToCenter': {
        window.dispatchEvent(new CustomEvent('krnl:radio:move-to-center'));
        break;
      }

      case 'radioAddLayer': {
        window.dispatchEvent(new CustomEvent('krnl:radio:add-layer', { detail: { id: step.layer } }));
        break;
      }

      case 'radioRemoveLayer': {
        window.dispatchEvent(new CustomEvent('krnl:radio:remove-layer', { detail: { id: step.layer } }));
        break;
      }

      case 'radioPlayYouTube': {
        window.dispatchEvent(new CustomEvent('krnl:radio:play-youtube', {
          detail: { url: step.url, volume: step.volume },
        }));
        break;
      }

      case 'radioHide': {
        window.dispatchEvent(new CustomEvent('krnl:radio:hide'));
        break;
      }

      case 'radioSnapToEdge': {
        window.dispatchEvent(new CustomEvent('krnl:radio:snap-to-edge'));
        break;
      }

      case 'waitForBoard': {
        this.deps.setOrbState('idle');
        this.deps.setCaption(step.caption);

        const startedAt = Date.now();
        let satisfied = false;

        while (!this.aborted && Date.now() - startedAt < step.timeoutMs) {
          if (step.predicate(this.deps.getBoardSnapshot())) {
            satisfied = true;
            break;
          }
          await new Promise<void>((r) => setTimeout(r, WAIT_FOR_BOARD_POLL_MS));
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
        for (let i = 0; i < branch.length; i++) {
          if (this.aborted) break;
          await this.executeStep(branch[i]!, branch[i + 1]);
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
