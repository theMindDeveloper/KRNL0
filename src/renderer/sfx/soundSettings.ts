// Sound settings (docs/06-requirements/ui-sounds.md F5): pack, volume, on/off.
// Per install, in localStorage like the theme — not board data. Settings →
// Sounds and `sys sound …` both write here, so each shows what the other set.

import { create } from 'zustand';
import { DEFAULT_SOUND_PACK, isSoundPackId, type SoundPackId } from './soundPacks';

export const SOUND_SETTINGS_KEY = 'krnl0-sound';

export interface SoundSettings {
  pack: SoundPackId;
  /** 0–100. */
  volume: number;
  enabled: boolean;
}

export const DEFAULT_SOUND_SETTINGS: SoundSettings = { pack: DEFAULT_SOUND_PACK, volume: 70, enabled: true };

export const clampVolume = (v: number): number =>
  Number.isFinite(v) ? Math.min(100, Math.max(0, Math.round(v))) : DEFAULT_SOUND_SETTINGS.volume;

/** Parse stored JSON; anything missing or invalid falls back to the default. */
export function parseSoundSettings(raw: string | null): SoundSettings {
  if (!raw) return { ...DEFAULT_SOUND_SETTINGS };
  try {
    const v = JSON.parse(raw) as Partial<Record<keyof SoundSettings, unknown>>;
    return {
      pack: isSoundPackId(v.pack) ? v.pack : DEFAULT_SOUND_SETTINGS.pack,
      volume: typeof v.volume === 'number' ? clampVolume(v.volume) : DEFAULT_SOUND_SETTINGS.volume,
      enabled: typeof v.enabled === 'boolean' ? v.enabled : DEFAULT_SOUND_SETTINGS.enabled,
    };
  } catch {
    return { ...DEFAULT_SOUND_SETTINGS };
  }
}

function read(): SoundSettings {
  try { return parseSoundSettings(localStorage.getItem(SOUND_SETTINGS_KEY)); } catch { return { ...DEFAULT_SOUND_SETTINGS }; }
}

function write(s: SoundSettings): void {
  try { localStorage.setItem(SOUND_SETTINGS_KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}

interface SoundSettingsStore extends SoundSettings {
  setPack: (pack: SoundPackId) => void;
  setVolume: (volume: number) => void;
  setEnabled: (enabled: boolean) => void;
}

export const useSoundSettings = create<SoundSettingsStore>((set, get) => {
  const save = (patch: Partial<SoundSettings>) => {
    set(patch);
    const { pack, volume, enabled } = get();
    write({ pack, volume, enabled });
  };
  return {
    ...read(),
    setPack: (pack) => save({ pack }),
    setVolume: (volume) => save({ volume: clampVolume(volume) }),
    setEnabled: (enabled) => save({ enabled }),
  };
});
