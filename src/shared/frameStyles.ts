/**
 * frameStyles — the frame-style catalogue shared by main (sys CLI) and the
 * renderer (dockRegistry). Kept free of React so the CLI can list styles
 * headlessly. dockRegistry.tsx must hold exactly these ids; a unit test
 * enforces that (ADR 0009).
 */

export type FrameMode = 'light' | 'dark';

export interface FrameStyleInfo {
  id: string;
  label: string;
  sublabel: string;
  modes: readonly FrameMode[];
}

export const FRAME_STYLES = [
  // Shown as "Paper" (cream & lime); the id stays 'classic' so saved choices and scripts keep working.
  { id: 'classic', label: 'Paper', sublabel: 'Cream & lime', modes: ['light', 'dark'] },
  { id: 'pro', label: 'Pro', sublabel: 'Matte graphite', modes: ['light', 'dark'] },
  { id: 'synthesizer', label: 'Synthesizer', sublabel: 'Eurorack panel', modes: ['light', 'dark'] },
  { id: 'telemetry', label: 'Telemetry', sublabel: 'Mission control', modes: ['light', 'dark'] },
  // Shown as "Nuclear"; the id stays 'krnl-dock' for the same reason.
  { id: 'krnl-dock', label: 'Nuclear', sublabel: 'Rack chassis', modes: ['dark'] },
  { id: 'blueprint', label: 'Blueprint', sublabel: 'Drafting table', modes: ['light', 'dark'] },
  { id: 'macintosh', label: 'Macintosh', sublabel: '1984 hardware', modes: ['light', 'dark'] },
  { id: 'submarine', label: 'Submarine', sublabel: 'Periscope console', modes: ['dark'] },
] as const satisfies readonly FrameStyleInfo[];

export type FrameStyleId = (typeof FRAME_STYLES)[number]['id'];

export const FRAME_STYLE_IDS: readonly FrameStyleId[] = FRAME_STYLES.map((f) => f.id);

export function isFrameStyleId(v: unknown): v is FrameStyleId {
  return typeof v === 'string' && (FRAME_STYLE_IDS as readonly string[]).includes(v);
}

/** A frame style by id or by its shown name, any case ("Paper" → classic, "nuclear" → krnl-dock). */
export function resolveFrameStyleId(v: unknown): FrameStyleId | undefined {
  if (typeof v !== 'string') return undefined;
  const q = v.trim().toLowerCase();
  return FRAME_STYLES.find((f) => f.id === q || f.label.toLowerCase() === q)?.id;
}
