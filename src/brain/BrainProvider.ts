import type { Board } from '../shared/types';

export interface BrainContext {
  boardSnapshot: Board;
  instructionsPath: string; // absolute path to CLAUDE.md
  skillsPath: string;       // absolute path to skills/
  workingDir: string;       // cwd for spawning the subprocess
}

export interface BrainReply {
  text: string;
  durationMs: number;
  commandsRun?: string[]; // for logging only
}

export interface BrainProvider {
  ask(prompt: string, context: BrainContext): Promise<BrainReply>;
}

export type BrainKind = 'claude-code' | 'api' | 'ollama';

export interface BrainSettings {
  kind: BrainKind;
  cliPath?: string;    // for claude-code
  apiKey?: string;     // for api
  modelName?: string;  // for ollama
}
