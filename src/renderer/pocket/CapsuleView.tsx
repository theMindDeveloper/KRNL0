// Capsule look (pocket-timer.md F12): a pill like the 0 in the logo. In
// Pomodoro a small ring empties as time runs out; in Observe a recording dot
// and a count-up. Hover opens a card under it with the details and controls.

import { ObserveDash } from '../components/nodes/PomoNode/ObserveDash';
import { ACID, COAL, CYAN, DRAG, EDGE, INK, INK3, MONO, MUTED, NO_DRAG, POCKET_SHADOW, RUST, endsAt, openMain, type PocketModel } from './model';
import { ControlRow, Ring, cardStyle, labelStyle } from './parts';

function Pill({ m }: { m: PocketModel }) {
  const base = { ...cardStyle, ...DRAG, height: 56, borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 12, padding: '0 20px 0 10px', whiteSpace: 'nowrap' as const };
  if (m.promptDone) {
    return (
      <div style={{ ...base, background: ACID, color: COAL, padding: '0 8px 0 18px', boxShadow: POCKET_SHADOW }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>done?</span>
        <span style={{ height: 40, display: 'inline-flex', alignItems: 'center', padding: '0 12px', borderRadius: 999, background: COAL, color: ACID, fontSize: 11.5, fontWeight: 600 }}>extend · break · stop</span>
      </div>
    );
  }
  const sub = m.observe
    ? (m.onBreak ? 'on break' : `tracking${m.task ? ` · ${m.task}` : ''}`)
    : m.onBreak ? 'break' : m.paused ? 'paused' : `left${m.task ? ` · ${m.task}` : ''}`;
  const lead = m.observe
    ? (m.onBreak
      ? <span style={{ width: 14, height: 14, marginLeft: 10, borderRadius: '50%', boxShadow: `inset 0 0 0 1.5px ${MUTED}`, flexShrink: 0 }} />
      : <span style={{ width: 8, height: 8, marginLeft: 14, borderRadius: '50%', background: ACID, boxShadow: '0 0 0 3px rgba(201,241,88,.18)', flexShrink: 0 }} />)
    : <Ring size={36} stroke={4} fraction={m.onBreak ? m.breakUsed : m.remaining} color={m.tone} />;
  return (
    <div style={{ ...base, boxShadow: `inset 0 0 0 1px ${m.paused ? '#5f5541' : EDGE}, ${POCKET_SHADOW}` }} data-testid="pocket-capsule">
      {lead}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
        <span style={{ fontFamily: MONO, fontSize: 22, fontWeight: 300, lineHeight: 1, color: m.paused ? INK3 : INK, fontVariantNumeric: 'tabular-nums' }}>
          {m.time}{m.observe && !m.onBreak && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={ACID} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-label="counting up" style={{ marginLeft: 6, verticalAlign: '0.1em' }}><path d="M12 19V5M6 11l6-6 6 6" /></svg>}
        </span>
        <span style={{ fontSize: 10, color: m.onBreak ? (m.observe ? INK3 : CYAN) : INK3, maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</span>
      </div>
    </div>
  );
}

export function CapsuleView({ m, hover }: { m: PocketModel; hover: boolean }) {
  const { state } = m.snap;
  return (
    <div style={{ padding: 8, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
      <Pill m={m} />
      {hover && (
        <div style={{ ...cardStyle, ...NO_DRAG, width: 288, boxSizing: 'border-box', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }} data-testid="pocket-capsule-card">
          {m.observe ? (
            <>
              <div style={{ display: 'flex' }}>
                <span style={{ ...labelStyle, color: RUST }}><span aria-hidden style={{ width: 6, height: 6, borderRadius: 999, background: 'currentColor', display: 'inline-block', marginRight: 6, verticalAlign: '0.1em' }} />Time log</span>
                <span style={{ ...labelStyle, marginLeft: 'auto', color: m.onBreak ? INK3 : ACID }}><span aria-hidden style={{ width: 6, height: 6, borderRadius: 999, background: 'currentColor', display: 'inline-block', marginRight: 6, verticalAlign: '0.1em' }} />{m.onBreak ? 'break' : 'working'}</span>
              </div>
              <div className="pk-dash"><ObserveDash state={state} liveMs={m.onBreak ? m.clock.breakElapsedMs : m.clock.liveWorkMs} library={m.snap.library} nowMs={m.now} plain={m.snap.easy} /></div>
            </>
          ) : (
            <>
              <span style={{ ...labelStyle, color: m.tone }}><span aria-hidden style={{ width: 6, height: 6, borderRadius: 999, background: 'currentColor', display: 'inline-block', marginRight: 6, verticalAlign: '0.1em' }} />{m.task ?? 'Deep work'} · pomo.{String(m.clock.sessionMin).padStart(3, '0')}</span>
              <div style={{ display: 'flex', alignItems: 'baseline' }}>
                <span style={{ fontFamily: MONO, fontSize: 48, fontWeight: 300, lineHeight: 1, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{m.time}</span>
                {!m.onBreak && !m.idle && <span style={{ marginLeft: 'auto', fontSize: 11.5, color: INK3 }}>ends {endsAt(m)}</span>}
              </div>
              <div style={{ height: 4, borderRadius: 2, background: '#2f2b24', overflow: 'hidden' }}>
                <span style={{ display: 'block', height: '100%', width: `${Math.round((m.onBreak ? m.breakUsed : 1 - m.remaining) * 100)}%`, background: m.onBreak ? CYAN : ACID, borderRadius: 2 }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11.5, color: INK3 }}>{m.onBreak ? 'break' : `session ${m.doneDots + 1} of ${m.pips}`}</span>
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }} aria-hidden>
                  {Array.from({ length: m.pips }, (_, i) => (
                    <i key={i} style={{ width: 8, height: 8, borderRadius: 2, background: i < m.doneDots ? ACID : 'transparent', boxShadow: i < m.doneDots ? 'none' : 'inset 0 0 0 1px #5f5541' }} />
                  ))}
                </span>
              </div>
            </>
          )}
          {m.snap.away ? (
            <button type="button" onClick={openMain} className="pk-btn" style={{ ...NO_DRAG, height: 32, borderRadius: 999, border: 0, background: ACID, color: COAL, fontFamily: MONO, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
              Away time — decide in KRNL0
            </button>
          ) : (
            <ControlRow controls={m.controls} words={m.observe || m.promptDone} />
          )}
        </div>
      )}
    </div>
  );
}
