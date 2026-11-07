// Dial look (pocket-timer.md F12, the default): a 184 px round timer that
// borrows the Clock's ticks. Pomodoro: the ring is the time left in the
// session. Observe: the ring is your day, 06–22, with today's spans on it.
// Hover shows the controls under it; collapsed it is a small tab.

import { fmtMin } from '../components/nodes/PomoNode/daySpans';
import { ACID, COAL, CYAN, DRAG, EDGE, INK, INK3, MONO, MUTED, NO_DRAG, POCKET_SHADOW, openMain, setCollapsed, type PocketModel } from './model';
import { ControlRow, DayRing, Icon, RoundButton, Ring, Ticks, cardStyle, labelStyle } from './parts';

const SIZE = 184;

function centerLabel(m: PocketModel): { text: string; color: string } {
  if (m.snap.away) return { text: 'Away · open KRNL0', color: '#ee8466' };
  if (m.observe) {
    if (m.onBreak) return { text: 'On break', color: INK3 };
    if (m.idle) return { text: 'Start', color: ACID };
    return { text: 'Working', color: ACID };
  }
  if (m.promptDone) return { text: 'Done?', color: ACID };
  if (m.onBreak) return { text: 'Break', color: CYAN };
  if (m.paused) return { text: 'Paused', color: INK3 };
  return { text: `Focus · ${m.doneDots + 1}/${m.pips}`, color: ACID };
}

export function DialTab({ m }: { m: PocketModel }) {
  const minutes = m.observe ? m.time.split(':').slice(0, -1).join(':') || m.time : m.time.split(':')[0];
  return (
    <div style={{ padding: 8 }}>
      <div style={{ ...cardStyle, ...DRAG, width: 44, height: 92, borderRadius: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <button type="button" aria-label="Show the dial" title="Show the dial" onClick={() => setCollapsed(false)}
          style={{ ...NO_DRAG, border: 0, background: 'transparent', padding: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, color: INK }}>
          {m.observe
            ? <span style={{ width: 8, height: 8, borderRadius: 999, background: m.onBreak ? 'transparent' : ACID, boxShadow: m.onBreak ? `inset 0 0 0 1.5px ${MUTED}` : '0 0 0 3px rgba(201,241,88,.18)' }} />
            : <Ring size={18} stroke={3} fraction={m.onBreak ? m.breakUsed : m.remaining} color={m.tone} />}
          <span style={{ fontFamily: MONO, fontSize: m.observe ? 13 : 15, fontWeight: 500 }}>{minutes}</span>
          <span style={{ ...labelStyle, fontSize: 8.5 }}>{m.observe ? '↑' : m.onBreak ? 'break' : 'left'}</span>
        </button>
      </div>
    </div>
  );
}

export function DialView({ m, hover }: { m: PocketModel; hover: boolean }) {
  const { text, color } = centerLabel(m);
  const ringFraction = m.onBreak ? m.breakUsed : m.promptDone ? 1 : m.remaining;
  return (
    // No fixed width: the window follows the widest part, so nothing is clipped.
    <div style={{ padding: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, minWidth: SIZE }} data-testid="pocket-dial">
      <div style={{ ...DRAG, position: 'relative', width: SIZE, height: SIZE, borderRadius: '50%', background: COAL, boxShadow: `inset 0 0 0 1px ${EDGE}, ${POCKET_SHADOW}` }}>
        {m.observe ? (
          <DayRing size={SIZE} stroke={7} day={m.day} now={m.now} />
        ) : (
          <>
            <div style={{ position: 'absolute', inset: 4 }}>
              <Ring size={SIZE - 8} stroke={6} fraction={m.idle ? 0 : ringFraction} color={m.tone} pulse={m.promptDone} />
            </div>
            <Ticks size={SIZE} inset={17} />
          </>
        )}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, textAlign: 'center' }}>
          <span style={{ fontFamily: MONO, fontSize: m.observe ? 30 : 36, fontWeight: 300, letterSpacing: '-0.02em', lineHeight: 1, color: m.paused ? INK3 : INK, fontVariantNumeric: 'tabular-nums' }}>{m.time}</span>
          <span style={{ ...labelStyle, color }}>{text}</span>
          {m.observe && <span style={{ fontFamily: MONO, fontSize: 11, color: INK3 }}>{fmtMin(m.day.workMs)} today</span>}
        </div>
      </div>
      {hover && (
        <div style={{ ...cardStyle, ...NO_DRAG, borderRadius: 999, height: 48, padding: '0 6px', display: 'flex', alignItems: 'center' }} data-testid="pocket-dial-bar">
          {m.snap.away ? (
            <button type="button" onClick={openMain} className="pk-btn" style={{ ...NO_DRAG, height: 32, padding: '0 14px', borderRadius: 999, border: 0, background: ACID, color: COAL, fontFamily: MONO, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
              Decide in KRNL0
            </button>
          ) : (
            // Icons (labels on hover), so the bar fits under the 184 px dial.
            <ControlRow
              controls={m.controls}
              words={false}
              size={30}
              extra={<RoundButton title="Shrink to a tab" size={30} onClick={() => setCollapsed(true)}><Icon name="dock" /></RoundButton>}
            />
          )}
        </div>
      )}
    </div>
  );
}
