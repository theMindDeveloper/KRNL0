// FrameNode — glassy container that groups child nodes.
// childIds is the soft-group list: nodes whose center sits inside the frame
// bounds at rest. Mutated on child drag end + frame resize end. Persisted to
// board.json so the grouping survives reloads.

export type FrameTint = 'cyan' | 'spine' | 'rust' | 'plum' | 'neutral';

export interface FrameState {
  label: string;
  width: number;
  height: number;
  childIds: string[];
}

export interface FrameConfig {
  tint?: FrameTint;
}

export function defaultFrameState(): FrameState {
  return { label: '', width: 360, height: 240, childIds: [] };
}

export function defaultFrameConfig(): FrameConfig {
  return { tint: 'neutral' };
}
