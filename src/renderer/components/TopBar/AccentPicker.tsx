// Settings → General → Appearance: the accent colour (owner, 2026-11-24).
// Eight swatches, a field for any colour (#rrggbb), and a reset to KRNL0 green.
// App-styled controls only (never the system colour picker).

import { useEffect, useState } from 'react';
import { ACCENT_DEFAULT, ACCENT_PRESETS, accentProblem, loadAccent, onAccentChange, parseAccent, saveAccent } from '../../themes/accent';

export function AccentPicker(): JSX.Element {
  const [accent, setAccent] = useState<string>(() => loadAccent() ?? ACCENT_DEFAULT);
  const [text, setText] = useState(accent);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => onAccentChange(() => { const a = loadAccent() ?? ACCENT_DEFAULT; setAccent(a); setText(a); }), []);

  const pick = (hex: string | null): void => {
    const err = saveAccent(hex);
    setError(err);
    if (!err) { const a = loadAccent() ?? ACCENT_DEFAULT; setAccent(a); setText(a); }
  };
  const typed = parseAccent(text);
  const preview = typed && !accentProblem(typed) ? typed : null;
  const isDefault = accent === ACCENT_DEFAULT;

  return (
    <div data-testid="settings-accent" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <div className="st-row__title">Accent colour</div>
        <div className="st-row__hint">The colour of buttons, today, the time now and what is selected. On this device only.</div>
      </div>
      <div role="radiogroup" aria-label="Accent colour" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {ACCENT_PRESETS.map((p) => {
          const on = accent === p.hex;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={p.name}
              title={p.name}
              data-testid={`settings-accent-${p.id}`}
              onClick={() => pick(p.hex)}
              style={{
                width: 28, height: 28, borderRadius: 999, border: 0, cursor: 'pointer', padding: 0, background: p.hex,
                boxShadow: on ? `0 0 0 2px var(--paper-2), 0 0 0 4px ${p.hex}` : 'inset 0 0 0 1px color-mix(in srgb, var(--ink) 15%, transparent)',
              }}
            />
          );
        })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 32, padding: '0 10px', borderRadius: 8, background: 'var(--paper)', boxShadow: 'inset 0 0 0 1px var(--paper-3)' }}>
          <span aria-hidden style={{ width: 14, height: 14, borderRadius: 4, background: preview ?? accent, boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--ink) 20%, transparent)' }} />
          <input
            data-testid="settings-accent-hex"
            aria-label="Any colour (#rrggbb)"
            value={text}
            spellCheck={false}
            onChange={(e) => { setText(e.target.value); setError(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); pick(text); } }}
            onBlur={() => { if (parseAccent(text) && parseAccent(text) !== accent) pick(text); }}
            style={{ width: 84, border: 0, outline: 'none', background: 'transparent', color: 'var(--ink)', fontFamily: 'var(--font-mono)', fontSize: 12.5 }}
          />
        </label>
        <button
          type="button"
          data-testid="settings-accent-reset"
          disabled={isDefault}
          onClick={() => pick(null)}
          style={{
            height: 32, padding: '0 12px', borderRadius: 8, border: 0, cursor: isDefault ? 'default' : 'pointer',
            background: 'var(--paper)', boxShadow: 'inset 0 0 0 1px var(--paper-3)', color: isDefault ? 'var(--ink-4)' : 'var(--ink-2)',
            fontFamily: 'var(--font-read)', fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6,
          }}
        >
          <span aria-hidden style={{ width: 10, height: 10, borderRadius: 999, background: ACCENT_DEFAULT }} />
          Reset to KRNL0 green
        </button>
      </div>
      {error && <div role="alert" data-testid="settings-accent-error" style={{ fontSize: 11.5, color: 'var(--rust-deep, var(--rust))' }}>{error}</div>}
    </div>
  );
}
