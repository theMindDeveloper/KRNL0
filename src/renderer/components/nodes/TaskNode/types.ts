import type { EmbeddedPomoState, PomoConfig } from '../PomoNode/types';
import { defaultEmbeddedPomo } from '../PomoNode/types';

export interface TaskState {
  text: string;
  done: boolean;
  tag?: string;
  durationMin: number;
  eta: string;            // human-readable ETA, e.g. "~20 min"
  sequenceNumber: number; // 1-based ordinal among sibling tasks (F1)
  layer: number;          // nesting depth; 0 = direct child of mother (F1)
  createdAt: string;      // ISO
  parentTodoId: string;   // mother-todo id
  // Decision 9 Addendum (2026-05-12) — each task carries its own pomo block.
  // Reuses the mother PomoNode's pure FSM; isolated per task.
  pomo: EmbeddedPomoState;
}

export interface TaskConfig {
  showDuration: boolean;
}

export const defaultTaskConfig = (): TaskConfig => ({ showDuration: true });

export const defaultTaskPomo = (cfg: PomoConfig, label: string): EmbeddedPomoState =>
  defaultEmbeddedPomo(cfg, label);
