// #207 / time-log F7, F7b — the two corrections people need at the Pomo:
//   running → "stopped earlier?"  (forgot to press Stop: stop at the real time)
//   idle    → "+ log past time"   (forgot to press Start: add the session)
// Small text links under the controls, so they never compete with START/STOP.

import { useState, type CSSProperties } from 'react';
import type { PomoState } from './types';
import { SpanTimeEditor, openLogTime, logTimeDefaults } from '../../ui/SpanEditor';

const link: CSSProperties = {
  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
  fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.06em',
  color: 'var(--ink-3)', textDecoration: 'underline', textUnderlineOffset: 2,
};

export function PomoTimeLinks({ state }: { state: PomoState }): JSX.Element | null {
  const [stopOpen, setStopOpen] = useState(false);
  const live = (state.status === 'running' || state.status === 'break') && state.startedAt !== null;

  if (live && state.startedAt) {
    const startMs = Date.parse(state.startedAt);
    return (
      <div className="nodrag" style={{ marginTop: 6 }}>
        {stopOpen ? (
          <SpanTimeEditor
            testIdPrefix="pomo-stop-at"
            seg={{ id: 'live', startMs, endMs: Date.now(), live: true, kind: state.status === 'break' ? 'break' : 'work' }}
            autoEdit="end"
            onSaved={() => setStopOpen(false)}
            onCancel={() => setStopOpen(false)}
          />
        ) : (
          <button type="button" data-testid="pomo-stopped-earlier" style={link} onClick={() => setStopOpen(true)}
            title="Forgot to press Stop? End this session at the time you really stopped">
            stopped earlier?
          </button>
        )}
      </div>
    );
  }

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
