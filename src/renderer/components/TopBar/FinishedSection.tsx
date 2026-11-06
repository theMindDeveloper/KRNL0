// Settings → Finished cards (docs/06-requirements/engagement.md F5–F6): when
// done task cards leave the canvas, and a switch to show them anyway.
// Laid out in the Settings window's cards (SettingsModal.tsx).

import { Switch } from '../ui/Switch';
import { SettingsIcon } from '../ui/SettingsIcons';
import { useFinishedCards, type FinishedPolicy } from '../../store/finishedCards';

const OPTIONS: ReadonlyArray<[FinishedPolicy, string, string]> = [
  ['overnight', 'Overnight', 'Gone the next morning'],
  ['hour', 'After 1 hour', 'Keeps the board tidy'],
  ['keep', 'Keep', 'Until you delete them'],
];

export function FinishedSection() {
  const { policy, showFinished, setPolicy, setShowFinished } = useFinishedCards();
  return (
    <div data-testid="settings-finished" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <section className="st-card">
        <h3 className="st-card__title"><SettingsIcon name="finished" size={15} />When finished cards leave the board</h3>
        <div role="radiogroup" aria-label="When finished cards leave the board" className="st-choices" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          {OPTIONS.map(([id, label, hint]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={policy === id}
              data-testid={`settings-finished-${id}`}
              onClick={() => setPolicy(id)}
              className="st-choice st-choice--text"
            >
              <span className="st-choice__label">{label}</span>
              <span className="st-choice__hint">{hint}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="st-card">
        <div className="st-row">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="st-row__title">Show finished cards on the board</div>
            <div className="st-row__hint">
              Finished tasks stay in the Todo list under Done and in Analytics. A chain, or a task with subtasks, leaves together once all of it is done.
            </div>
          </div>
          <Switch checked={showFinished} onChange={setShowFinished} testId="settings-show-finished" title="Show finished cards on the board" />
        </div>
      </section>
    </div>
  );
}
