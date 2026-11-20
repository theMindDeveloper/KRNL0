/// <reference types="vite/client" />

import { CLIP_MAP } from './clipMap';
import { useSoundSettings, voiceLevel } from '../../sfx/soundSettings';

// Eagerly load every .mp3 under ./audio at bundle time.
// Vite resolves them to hashed asset URLs for both dev and production.
const _allClips = import.meta.glob('./audio/**/*.mp3', { query: '?url', import: 'default', eager: true }) as Record<string, string>;

// Build a lookup: filename stem (basename without .mp3) → resolved URL.
// Folder paths are stripped — clipMap references stems only.
const _stemToUrl: Record<string, string> = {};
for (const [path, url] of Object.entries(_allClips)) {
  const stem = path.replace(/^.*\//, '').replace(/\.mp3$/, '');
  _stemToUrl[stem] = url;
}

function resolveUrl(clipId: string): string | undefined {
  const stem = CLIP_MAP[clipId];
  if (!stem) return undefined;
  return _stemToUrl[stem];
}

// Slightly attenuated so the recording's noise floor sits lower in the mix.
// Drops perceived hiss without losing intelligibility. Tune here if needed.
const VOICE_VOLUME = 0.85;
/** The level for a clip right now: the recording's trim times Settings → Sounds → AI voice. */
const level = (): number => VOICE_VOLUME * voiceLevel();

export class VoicePlayer {
  private cache = new Map<string, HTMLAudioElement>();
  private current: HTMLAudioElement | null = null;

  preload(clipIds: string[]): void {
    for (const id of clipIds) {
      if (this.cache.has(id)) continue;
      const url = resolveUrl(id);
      if (url) {
        const audio = new Audio(url);
        audio.preload = 'auto';
        audio.volume = level();
        this.cache.set(id, audio);
      }
    }
  }

  play(clipId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // AI voice at 0: nothing is said, and the caller carries on as if it had been.
      if (voiceLevel() <= 0) { this.stop(); resolve(); return; }
      let audio = this.cache.get(clipId);
      if (!audio) {
        const url = resolveUrl(clipId);
        if (!url) {
          reject(new Error(`Clip not found: ${clipId}`));
          return;
        }
        audio = new Audio(url);
        this.cache.set(clipId, audio);
      }

      this.stop();
      this.current = audio;

      audio.volume = level();
      audio.currentTime = 0;
      audio.onended = () => {
        this.current = null;
        resolve();
      };
      audio.onerror = () => {
        this.current = null;
        reject(new Error(`Audio error: ${clipId}`));
      };
      audio.play().catch((err) => {
        this.current = null;
        reject(err);
      });
    });
  }

  stop(): void {
    if (this.current) {
      this.current.pause();
      this.current.currentTime = 0;
      this.current = null;
    }
  }

  /** Apply the current AI voice volume to the line being spoken. */
  setLevel(): void {
    if (!this.current) return;
    if (voiceLevel() <= 0) this.stop();
    else this.current.volume = level();
  }

  playRandom(clipIds: string[]): Promise<void> {
    const id = clipIds[Math.floor(Math.random() * clipIds.length)];
    return this.play(id!);
  }
}

export const voicePlayer = new VoicePlayer();

// Moving the slider changes a line that is being spoken, not only the next one.
useSoundSettings.subscribe((s, prev) => {
  if (s.voiceVolume !== prev.voiceVolume) voicePlayer.setLevel();
});
