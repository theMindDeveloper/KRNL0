// Settings → Finished cards (docs/06-requirements/engagement.md F5–F6): when
// done task cards leave the canvas, and a switch to show them anyway.

import { Switch } from '../ui/Switch';
import { useFinishedCards, type FinishedPolicy } from '../../store/finishedCards';

const heading = { fontSize: 9.5, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 } as const;

const OPTIONS: ReadonlyArray<[FinishedPolicy, string, string]> = [
  ['overnight', 'Overnight', 'Gone the next morning'],
  ['hour', 'After 1 hour', 'Keeps the board tidy'],
  ['keep', 'Keep', 'Until you delete them'],
];

export function FinishedSection() {
  const { policy, showFinished, setPolicy, setShowFinished } = useFinishedCards();
  return (
    <div data-testid="settings-finished" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
      <span style={heading}>Finished cards</span>
      <div role="radiogroup" aria-label="When finished cards leave the board" style={{ display: 'flex', gap: 6 }}>
        {OPTIONS.map(([id, label, hint]) => {
          const on = policy === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={on}
              data-testid={`settings-finished-${id}`}
              onClick={() => setPolicy(id)}
              style={{
                flex: 1, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                fontFamily: 'var(--font-mono)', color: 'var(--ink)',
                border: `1px solid ${on ? 'var(--acid)' : 'var(--paper-3)'}`,
                background: on ? 'color-mix(in srgb, var(--acid) 16%, transparent)' : 'transparent',
              }}
            >
              <div style={{ fontSize: 11, letterSpacing: '0.04em', fontWeight: 700 }}>{label}</div>
              <div style={{ fontSize: 9.5, color: 'var(--ink-3)', marginTop: 3, lineHeight: 1.4 }}>{hint}</div>
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Switch checked={showFinished} onChange={setShowFinished} testId="settings-show-finished" title="Show finished cards on the board" size="sm" />
        <span style={{ fontSize: 10.5, color: 'var(--ink-2)' }}>Show finished cards on the board</span>
      </div>
      <span style={{ fontSize: 9.5, color: 'var(--ink-3)', lineHeight: 1.5 }}>
        Finished tasks stay in the Todo list under Done and in Analytics. A chain or a task with subtasks leaves together, when all of it is done.
      </span>
    </div>
  );
}
