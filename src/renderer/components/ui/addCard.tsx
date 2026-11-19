// One layout for the small cards that add or edit one thing: the plan card
// (WhenPopover), the Calendar's "New here" card (EventCard), the habit card
// (HabitAddAsk) and "Log time you didn't record" (LogTimeCard).
// docs/04-visual-system/window-frame.md, "Cards" (owner pick A, 2026-11-19).
//
// The rule: a card is a name with an X, then one filled block with a line per
// setting (its name on the left, what it is set to on the right), then one
// main button across the card. No outlined boxes. Words are set in the reading
// font; only times and numbers keep the code font.

import type { CSSProperties, ReactNode } from 'react';
import { LineGlyph } from './LineGlyph';

/** Every card is this wide. */
export const CARD_W = 330;
/** Every control in a line (pill, stepper button, time field, select) is this tall. */
export const CTL_H = 30;
const CTL_R = 8;
const READ = 'var(--font-read)';
const MONO = 'var(--font-mono)';

export const cardBox: CSSProperties = {
  width: CARD_W, boxSizing: 'border-box', padding: 16, borderRadius: 14,
  background: 'var(--paper)', color: 'var(--ink)', border: '1px solid var(--paper-3)',
  boxShadow: '0 18px 44px rgba(0,0,0,0.5)',
  display: 'flex', flexDirection: 'column', gap: 14,
  fontFamily: READ, fontSize: 13.5, lineHeight: 1.35,
};

/** The top line: the name, then the X. */
export const cardHead: CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, minHeight: 28 };
export const cardTitle: CSSProperties = { flex: 1, minWidth: 0, fontFamily: READ, fontSize: 17, fontWeight: 600, lineHeight: 1.3, letterSpacing: '-0.01em' };

export function CardClose({ onClick, label = 'Close' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick}
      style={{ width: 28, height: 28, flexShrink: 0, border: 'none', borderRadius: CTL_R, background: 'var(--paper-2)', color: 'var(--ink-3)', cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <LineGlyph name="close" size={12} />
    </button>
  );
}

/** The filled block that holds the card's lines (hairlines between them: `.kc-group` in window-frame.css). */
export function CardGroup({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div className="kc-group" style={style}>{children}</div>;
}

/** A line: its name on the left, its controls on the right. */
export const cardRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, minHeight: 42, padding: '0 10px 0 14px', boxSizing: 'border-box' };
export const cardLabel: CSSProperties = { flex: 1, minWidth: 0, fontFamily: READ, fontSize: 13.5, color: 'var(--ink-2)', whiteSpace: 'nowrap' };
/** The controls of one line, side by side at its right end. */
export const cardCtls: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 };
/** A quiet note beside a control ("to 00:00"). */
export const cardNote: CSSProperties = { fontFamily: MONO, fontSize: 12.5, color: 'var(--ink-3)', whiteSpace: 'nowrap' };

/** A two-way switch across the card (Once / Repeats). */
export const cardSeg: CSSProperties = { display: 'flex', gap: 2, padding: 3, borderRadius: 10, background: 'var(--paper-2)' };
export const cardSegBtn = (on: boolean): CSSProperties => ({
  flex: 1, height: 30, borderRadius: CTL_R, border: 'none', cursor: 'pointer', padding: '0 6px',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  fontFamily: READ, fontSize: 13, whiteSpace: 'nowrap', fontWeight: on ? 600 : 500,
  background: on ? 'var(--paper-3)' : 'transparent',
  color: on ? 'var(--ink)' : 'var(--ink-3)',
});

/** The day line: equal choices across the block; the chosen one is solid. */
export const cardDays: CSSProperties = { display: 'grid', gridAutoFlow: 'column', gridAutoColumns: '1fr', gap: 4, padding: 6 };
export const cardDay = (on: boolean): CSSProperties => ({
  height: 34, minWidth: 0, borderRadius: CTL_R, border: 'none', cursor: 'pointer', padding: '0 4px',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  fontFamily: READ, fontSize: 13, whiteSpace: 'nowrap', fontWeight: on ? 600 : 500,
  background: on ? 'var(--acid)' : 'transparent', color: on ? 'var(--ink-on-bright, #111)' : 'var(--ink-2)',
});

/** An option you switch on inside a line (Any time, Tick): tinted when on. */
export const cardPill = (on: boolean): CSSProperties => ({
  height: CTL_H, padding: '0 10px', borderRadius: CTL_R, cursor: 'pointer', boxSizing: 'border-box', border: 'none',
  fontFamily: READ, fontSize: 13, whiteSpace: 'nowrap', fontWeight: on ? 600 : 500,
  background: on ? 'color-mix(in srgb, var(--acid) 18%, var(--paper-3))' : 'var(--paper-3)',
  color: on ? 'var(--acid-ink, var(--acid))' : 'var(--ink-2)',
});

/** − value + : two filled buttons around the value. */
export const cardStepper = (_on = false): CSSProperties => ({ display: 'inline-flex', alignItems: 'center', gap: 2, width: 'fit-content' });
export const cardStepBtn: CSSProperties = {
  width: 28, height: 28, border: 'none', borderRadius: CTL_R, background: 'var(--paper-3)', color: 'var(--ink-2)', cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: 0, fontFamily: MONO,
};
export const cardStepValue: CSSProperties = { minWidth: 54, textAlign: 'center', fontFamily: MONO, fontSize: 13, fontWeight: 500 };

/** A weekday circle. */
export const cardDayDot = (on: boolean): CSSProperties => ({
  width: 34, height: 34, borderRadius: '50%', cursor: 'pointer', padding: 0, fontFamily: READ, fontSize: 12.5, fontWeight: 600, border: 'none',
  background: on ? 'var(--acid)' : 'var(--paper-2)', color: on ? 'var(--ink-on-bright, #111)' : 'var(--ink-3)',
});

/** The time field in a line. */
export const cardTime: CSSProperties = { width: 96, height: CTL_H, background: 'var(--paper-3)', border: '1px solid transparent' };
/** A select in a line. */
export const cardSelect: CSSProperties = { height: CTL_H, minWidth: 0, background: 'var(--paper-3)', border: '1px solid transparent', borderRadius: CTL_R, fontFamily: READ, fontSize: 13 };

/** A row of things you can do with it (Mark done, Won't do, Delete, More). */
export const cardAct: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 8, height: 36, padding: '0 12px', borderRadius: 10, cursor: 'pointer', whiteSpace: 'nowrap',
  border: 'none', background: 'var(--paper-2)', fontFamily: READ, fontSize: 13, boxSizing: 'border-box',
};

/** The last part: the main button across the card (and, under it, one quiet line). */
export const cardFoot: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10 };
export const cardPrimary = (ready: boolean): CSSProperties => ({
  height: 40, padding: '0 12px', borderRadius: 10, border: 'none', cursor: ready ? 'pointer' : 'default',
  background: ready ? 'var(--btn-primary-bg, var(--acid))' : 'var(--paper-2)', color: ready ? 'var(--btn-primary-fg, #111)' : 'var(--ink-4)',
  fontFamily: READ, fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
});
/** The quiet second action beside the main button ("No day"). */
export const cardGhost: CSSProperties = { height: 40, padding: '0 10px', borderRadius: 10, border: 'none', background: 'transparent', color: 'var(--ink-3)', cursor: 'pointer', fontFamily: READ, fontSize: 13, whiteSpace: 'nowrap' };
/** A quiet line under the button ("Not something you tick? …"). */
export const cardLink: CSSProperties = { fontFamily: READ, fontSize: 12.5, color: 'var(--ink-3)' };
