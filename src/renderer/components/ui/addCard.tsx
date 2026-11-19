// One layout for the small cards that add or edit one thing: the plan card
// (WhenPopover), the Calendar's "New here" card (EventCard) and the habit card
// (HabitAddAsk). docs/04-visual-system/window-frame.md, "Cards".
//
// The rule: one width, one padding, one gap between rows; a name on top with
// an X; rows are a 64 px label and controls that are all 30 px tall with the
// same corner; one footer line with a full-width main button.

import type { CSSProperties } from 'react';
import { LineGlyph } from './LineGlyph';

/** Every card is this wide. */
export const CARD_W = 330;
/** Every control in a row (pill, stepper, time field, select) is this tall. */
export const CTL_H = 30;
/** Corner of a control. */
const CTL_R = 8;

export const cardBox: CSSProperties = {
  width: CARD_W, boxSizing: 'border-box', padding: 14, borderRadius: 12,
  background: 'var(--paper)', color: 'var(--ink)', border: '1px solid var(--paper-3)',
  boxShadow: '0 18px 44px rgba(0,0,0,0.5)',
  display: 'flex', flexDirection: 'column', gap: 12,
  fontFamily: 'var(--font-mono)', fontSize: 12,
};

/** The top line: the name, then the X. */
export const cardHead: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, minHeight: 28 };
export const cardTitle: CSSProperties = { flex: 1, minWidth: 0, fontSize: 15, fontWeight: 700, lineHeight: 1.3 };

export function CardClose({ onClick, label = 'Close' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick}
      style={{ width: 24, height: 24, flexShrink: 0, border: 'none', borderRadius: 6, background: 'transparent', color: 'var(--ink-3)', cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <LineGlyph name="close" size={12} />
    </button>
  );
}

/** A row: its label, then its controls. */
export const cardRow: CSSProperties = { display: 'grid', gridTemplateColumns: '64px 1fr', alignItems: 'center', gap: 8, minHeight: CTL_H };
export const cardLabel: CSSProperties = { fontSize: 11, color: 'var(--ink-3)', letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' };
/** The controls of one row, side by side. */
export const cardCtls: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 };

/** A two-way switch across the card (Once / Repeats). */
export const cardSeg: CSSProperties = { display: 'flex', gap: 2, padding: 2, borderRadius: CTL_R, background: 'var(--paper-2)', border: '1px solid var(--paper-3)' };
export const cardSegBtn = (on: boolean): CSSProperties => ({
  flex: 1, height: 26, borderRadius: 6, border: 'none', cursor: 'pointer', padding: '0 4px',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
  fontFamily: 'var(--font-mono)', fontSize: 11.5, whiteSpace: 'nowrap', fontWeight: on ? 650 : 500,
  background: on ? 'color-mix(in srgb, var(--acid) 18%, transparent)' : 'transparent',
  color: on ? 'var(--acid-ink, var(--acid))' : 'var(--ink-3)',
});

/** An option you switch on (Any time, Tick): tinted when on. */
export const cardPill = (on: boolean): CSSProperties => ({
  height: CTL_H, padding: '0 10px', borderRadius: CTL_R, cursor: 'pointer', boxSizing: 'border-box', border: 'none',
  fontFamily: 'var(--font-mono)', fontSize: 12, whiteSpace: 'nowrap', fontWeight: on ? 650 : 500,
  boxShadow: on ? 'inset 0 0 0 1px color-mix(in srgb, var(--acid) 40%, transparent)' : 'inset 0 0 0 1px var(--paper-3)',
  background: on ? 'color-mix(in srgb, var(--acid) 16%, transparent)' : 'transparent',
  color: on ? 'var(--acid-ink, var(--acid))' : 'var(--ink-3)',
});

/** − value + as one control. */
export const cardStepper = (on = false): CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', height: CTL_H, borderRadius: CTL_R, boxSizing: 'border-box', overflow: 'hidden', width: 'fit-content', border: 'none',
  boxShadow: on ? 'inset 0 0 0 1px color-mix(in srgb, var(--acid) 40%, transparent)' : 'inset 0 0 0 1px var(--paper-3)',
  background: on ? 'color-mix(in srgb, var(--acid) 7%, transparent)' : 'transparent',
});
export const cardStepBtn: CSSProperties = {
  width: 28, height: CTL_H, border: 'none', background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0, fontFamily: 'var(--font-mono)',
};
export const cardStepValue: CSSProperties = { minWidth: 48, textAlign: 'center', fontSize: 12.5, fontWeight: 650 };

/** A weekday circle. */
export const cardDayDot = (on: boolean): CSSProperties => ({
  width: 32, height: 32, borderRadius: '50%', cursor: 'pointer', padding: 0, fontFamily: 'inherit', fontSize: 11.5, fontWeight: on ? 700 : 500, border: 'none',
  boxShadow: on ? 'none' : 'inset 0 0 0 1px var(--paper-3)', background: on ? 'var(--acid)' : 'transparent', color: on ? 'var(--ink-on-bright, #111)' : 'var(--ink-3)',
});

/** The time field in a row. */
export const cardTime: CSSProperties = { width: 96, height: CTL_H };

/** The last line: a rule, then the main button across the card. */
export const cardFoot: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--paper-3)', paddingTop: 12 };
export const cardPrimary = (ready: boolean): CSSProperties => ({
  height: 34, padding: '0 12px', borderRadius: CTL_R, border: 'none', cursor: ready ? 'pointer' : 'default',
  background: ready ? 'var(--btn-primary-bg, var(--acid))' : 'var(--paper-3)', color: ready ? 'var(--btn-primary-fg, #111)' : 'var(--ink-4)',
  fontFamily: 'inherit', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
});
