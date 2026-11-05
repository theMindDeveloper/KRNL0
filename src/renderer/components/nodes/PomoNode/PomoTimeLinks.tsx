// #207 / time-log F7b — "+ log past time" under the Pomo when it is idle
// (forgot to press Start: add the session). Fixing where a session really
// ended is done on the session itself (double-click its end time).

import { type CSSProperties } from 'react';
import type { PomoState } from './types';
import { openLogTime, logTimeDefaults } from '../../ui/SpanEditor';

const link: CSSProperties = {
  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
  fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.06em',
  color: 'var(--ink-3)', textDecoration: 'underline', textUnderlineOffset: 2,
};

export function PomoTimeLinks({ state }: { state: PomoState }): JSX.Element | null {
  if (state.status === 'idle' || state.status === 'done') {
    return (
      <div className="nodrag" style={{ marginTop: 6 }}>
        <button
          type="button"
          data-testid="pomo-log-past"
          style={link}
          title="Forgot to press Start? Add the time you worked"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            openLogTime({ ...logTimeDefaults(Date.now() - 60 * 60_000), x: r.left, y: r.bottom });
          }}
        >
          + log past time
        </button>
      </div>
    );
  }
  return null;
}
