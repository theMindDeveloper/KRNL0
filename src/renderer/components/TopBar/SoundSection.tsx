// Settings → Sounds (docs/06-requirements/ui-sounds.md F4): on/off, volume,
// and the pack. Picking a pack plays a sample so the user hears it at once.

import { Switch } from '../ui/Switch';
import { MOMENT_LABELS, SOUND_MOMENTS, SOUND_PACK_IDS, SOUND_PACKS } from '../../sfx/soundPacks';
import { useSoundSettings } from '../../sfx/soundSettings';
import { uiSounds } from '../../sfx/uiSounds';

const heading = { fontSize: 9.5, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 } as const;

export function SoundSection() {
  const { pack, volume, enabled, setPack, setVolume, setEnabled } = useSoundSettings();
  const sample = () => uiSounds.play('done');

  return (
    <div data-testid="settings-sounds" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <span style={heading}>Sounds</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: 'var(--ink-3)', marginRight: 8 }}>{enabled ? 'On' : 'Off'}</span>
        <Switch
          checked={enabled}
          onChange={(on) => { setEnabled(on); if (on) sample(); }}
          testId="settings-sound-enabled"
          title={enabled ? 'Turn sounds off' : 'Turn sounds on'}
          size="sm"
        />
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: enabled ? 1 : 0.45 }}>
        <span style={{ fontSize: 10, color: 'var(--ink-2)', width: 52 }}>Volume</span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={volume}
          disabled={!enabled}
          aria-label="Sound volume"
          data-testid="settings-sound-volume"
          onChange={(e) => setVolume(Number(e.target.value))}
          onPointerUp={sample}
          onKeyUp={sample}
          style={{ flex: 1, accentColor: 'var(--acid)', cursor: enabled ? 'pointer' : 'default' }}
        />
        <span style={{ fontSize: 10, color: 'var(--ink-2)', width: 26, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{volume}</span>
      </label>

      <div role="radiogroup" aria-label="Sound style" style={{ display: 'flex', gap: 6, opacity: enabled ? 1 : 0.45 }}>
        {SOUND_PACK_IDS.map((id) => {
          const p = SOUND_PACKS[id];
          const on = pack === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={!enabled}
              data-testid={`settings-sound-pack-${id}`}
              onClick={() => { setPack(id); uiSounds.play('done', { pack: id }); }}
              style={{
                flex: 1, padding: '8px 10px', borderRadius: 8, cursor: enabled ? 'pointer' : 'default', textAlign: 'left',
                fontFamily: 'var(--font-mono)', color: 'var(--ink)',
                border: `1px solid ${on ? 'var(--acid)' : 'var(--paper-3)'}`,
                background: on ? 'color-mix(in srgb, var(--acid) 16%, transparent)' : 'transparent',
              }}
            >
              <div style={{ fontSize: 11, letterSpacing: '0.04em', fontWeight: 700 }}>{p.name}</div>
              <div style={{ fontSize: 9.5, color: 'var(--ink-3)', marginTop: 3, lineHeight: 1.4 }}>{p.feel}</div>
            </button>
          );
        })}
      </div>

      {/* Hear every moment in the chosen pack. */}
      <div data-testid="settings-sound-try" style={{ display: 'flex', flexWrap: 'wrap', gap: 4, opacity: enabled ? 1 : 0.45 }}>
        {SOUND_MOMENTS.map((m) => (
          <button
            key={m}
            type="button"
            disabled={!enabled}
            data-testid={`settings-sound-try-${m}`}
            onClick={() => uiSounds.play(m)}
            style={{
              height: 24, padding: '0 8px', borderRadius: 999, cursor: enabled ? 'pointer' : 'default',
              border: '1px solid var(--paper-3)', background: 'transparent', color: 'var(--ink-2)',
              fontFamily: 'var(--font-mono)', fontSize: 10,
            }}
          >
            ▸ {MOMENT_LABELS[m]}
          </button>
        ))}
      </div>

      <span data-testid="settings-sound-credit" style={{ fontSize: 9, color: 'var(--ink-3)', lineHeight: 1.5 }}>
        {SOUND_PACKS[pack].credit}
      </span>
    </div>
  );
}
