/// <reference types="vite/client" />

// Eagerly resolve all .mp3 files under ./sounds at bundle time.
const _sounds = import.meta.glob('./sounds/**/*.mp3', { as: 'url', eager: true }) as Record<string, string>;

const _stemToUrl: Record<string, string> = {};
for (const [path, url] of Object.entries(_sounds)) {
  const stem = path.replace(/^.*\//, '').replace(/\.mp3$/, '');
  _stemToUrl[stem] = url;
}

class SfxEngine {
  private cache = new Map<string, HTMLAudioElement>();
  private current: HTMLAudioElement | null = null;

  play(clipId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = _stemToUrl[clipId];
      if (!url) {
        reject(new Error(`SFX clip not found: ${clipId}`));
        return;
      }

      let audio = this.cache.get(clipId);
      if (!audio) {
        audio = new Audio(url);
        this.cache.set(clipId, audio);
      }

      if (this.current && this.current !== audio) {
        this.current.pause();
        this.current.currentTime = 0;
      }
      this.current = audio;

      audio.currentTime = 0;
      audio.onended = () => { this.current = null; resolve(); };
      audio.onerror = () => { this.current = null; reject(new Error(`SFX playback error: ${clipId}`)); };
      audio.play().catch((err) => { this.current = null; reject(err); });
    });
  }

  stop(): void {
    if (this.current) {
      this.current.pause();
      this.current.currentTime = 0;
      this.current = null;
    }
  }

  clips(): string[] {
    return Object.keys(_stemToUrl);
  }
}

export const sfxEngine = new SfxEngine();
