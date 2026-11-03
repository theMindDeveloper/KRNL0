// The open Ambient Radio's controls, for `krnl radio …`. The radio's mix
// lives in its component state; the component registers these functions on
// mount so the CLI drives the same handlers the chips and sliders do, and the
// panel always shows what the CLI did.

export interface RadioPresetInfo {
  id: string;
  name: string;
  sub: string;
}

export interface RadioStatus {
  playing: boolean;
  layers: string[];
  /** The preset a bare `play` starts when the mix is empty. */
  focused: string;
  volume: number;
}

export interface RadioControl {
  presets(): RadioPresetInfo[];
  status(): RadioStatus;
  /** Start playing; with a preset id, also add that layer to the mix. */
  play(id?: string): void;
  /** Take a layer out of the mix. */
  remove(id: string): void;
  /** Pause everything (the mix is kept). */
  stop(): void;
  setVolume(v0to100: number): void;
}

let current: RadioControl | null = null;

export function registerRadio(control: RadioControl): () => void {
  current = control;
  return () => { if (current === control) current = null; };
}

export function radioControl(): RadioControl | null {
  return current;
}
