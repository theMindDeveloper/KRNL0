// #207 / time-log F7b — "+ log past time" under the Pomo when it is idle
// (forgot to press Start: add the session). Fixing where a session really
// ended is done on the session itself (double-click its end time).

import type { PomoState } from './types';
import { openLogTime, logTimeDefaults } from '../../ui/SpanEditor';


export function PomoTimeLinks({ state }: { state: PomoState }): JSX.Element | null {
  if (state.status === 'idle' || state.status === 'done') {
    return (
      <button
        type="button"
        className="kw-action nodrag"
        data-testid="pomo-log-past"
        title="Forgot to press Start? Add the time you worked"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          openLogTime({ ...logTimeDefaults(Date.now() - 60 * 60_000), x: r.left, y: r.bottom });
        }}
      >
        + log past time
      </button>
    );
  }
  return null;
}
