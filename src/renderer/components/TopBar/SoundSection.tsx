// Settings → Sounds (docs/06-requirements/ui-sounds.md F4): on/off, volume,
// the pack (picking one plays a sample), and a try button per moment.
// Laid out in the Settings window's cards (SettingsModal.tsx).

import type { CSSProperties } from 'react';
import { Switch } from '../ui/Switch';
import { SettingsIcon } from '../ui/SettingsIcons';
import { MOMENT_LABELS, SOUND_MOMENTS, SOUND_PACK_IDS, SOUND_PACKS } from '../../sfx/soundPacks';
import { useSoundSettings } from '../../sfx/soundSettings';
import { uiSounds } from '../../sfx/uiSounds';
import { voicePlayer } from '../Assistant/VoicePlayer';

export function SoundSection() {
  const { pack, volume, enabled, voiceVolume, setPack, setVolume, setEnabled, setVoiceVolume } = useSoundSettings();
  const voiceSample = () => { void voicePlayer.play('click_im_here').catch(() => { /* no audio device */ }); };
  const sample = () => uiSounds.play('done');
  const dim: CSSProperties = { opacity: enabled ? 1 : 0.45, pointerEvents: enabled ? 'auto' : 'none' };

  return (
    <div data-testid="settings-sounds" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <section className="st-card">
        <div className="st-row">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="st-row__title">Play sounds</div>
            <div className="st-row__hint">Short, quiet sounds when you add, start, finish or tick things off.</div>
          </div>
          <Switch
            checked={enabled}
            onChange={(on) => { setEnabled(on); if (on) sample(); }}
            testId="settings-sound-enabled"
            title={enabled ? 'Turn sounds off' : 'Turn sounds on'}
          />
        </div>
        <label className="st-row" style={dim}>
          <span className="st-row__title" style={{ width: 84 }}>App sounds</span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={volume}
            disabled={!enabled}
            aria-label="Sound volume"
            data-testid="settings-sound-volume"
            className="st-range"
            style={{ '--st-fill': `${volume}%` } as CSSProperties}
            onChange={(e) => setVolume(Number(e.target.value))}
            onPointerUp={sample}
            onKeyUp={sample}
          />
          <span className="st-row__value">{volume}</span>
        </label>
      </section>

      <section className="st-card">
        <div className="st-row">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="st-row__title">AI voice</div>
            <div className="st-row__hint">How loud KRNL0 speaks: its hello, its replies and the tour guide. At 0 it says nothing.</div>
          </div>
        </div>
        <label className="st-row">
          <span className="st-row__title" style={{ width: 84 }}>Volume</span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={voiceVolume}
            aria-label="AI voice volume"
            data-testid="settings-voice-volume"
            className="st-range"
            style={{ '--st-fill': `${voiceVolume}%` } as CSSProperties}
            onChange={(e) => setVoiceVolume(Number(e.target.value))}
            onPointerUp={voiceSample}
            onKeyUp={voiceSample}
          />
          <span className="st-row__value">{voiceVolume}</span>
        </label>
      </section>

      <section className="st-card" style={dim}>
        <h3 className="st-card__title"><SettingsIcon name="sound" size={15} />Sound style</h3>
        <div role="radiogroup" aria-label="Sound style" className="st-choices" style={{ gridTemplateColumns: `repeat(${SOUND_PACK_IDS.length}, minmax(0, 1fr))` }}>
          {SOUND_PACK_IDS.map((id) => {
            const p = SOUND_PACKS[id];
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={pack === id}
                disabled={!enabled}
                data-testid={`settings-sound-pack-${id}`}
                onClick={() => { setPack(id); uiSounds.play('done', { pack: id }); }}
                className="st-choice st-choice--text"
              >
                <span className="st-choice__label"><SettingsIcon name="play" size={13} />{p.name}</span>
                <span className="st-choice__hint">{p.feel}</span>
              </button>
            );
          })}
        </div>
        <div data-testid="settings-sound-try" className="st-chips">
          {SOUND_MOMENTS.map((m) => (
            <button key={m} type="button" disabled={!enabled} data-testid={`settings-sound-try-${m}`} onClick={() => uiSounds.play(m)} className="st-chip">
              <SettingsIcon name="play" size={11} />{MOMENT_LABELS[m]}
            </button>
          ))}
        </div>
        <span data-testid="settings-sound-credit" className="st-row__hint">{SOUND_PACKS[pack].credit}</span>
      </section>
    </div>
  );
}
