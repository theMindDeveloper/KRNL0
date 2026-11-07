// One task card shape for every state (open, running, missed, done). The
// frame below is shared by TaskNode and DoneCard, so ticking a task never moves
// anything: the check, the title, the tag row, the meter and the ports stay
// where they are — only colours, the one action icon and the words change.
//
//   ┌──────────────────────────────────────────┐
//   │ [✓] Title …………………………………………… [action] │  row 1
//   │ (● Tag)  [icon] when                      │  row 2
//   │                                           │
//   │ ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬                 │  meter
//   │ left label                    right label │
//   └──────────────────────────────────────────┘

import type { CSSProperties, ReactNode } from 'react';

export const CARD_W = 220;
export const CARD_H = 120;

export type CardTone = 'open' | 'running' | 'paused' | 'missed' | 'done';

const FRAME: Record<CardTone, { border: string; bg: string; shadow: string }> = {
  open: { border: 'var(--paper-3)', bg: 'var(--node-bg)', shadow: 'var(--shadow-1)' },
  running: { border: 'var(--acid)', bg: 'var(--node-bg)', shadow: '0 0 0 3px color-mix(in srgb, var(--acid) 18%, transparent), var(--shadow-1)' },
  paused: { border: 'color-mix(in srgb, var(--acid) 60%, var(--paper-3))', bg: 'var(--node-bg)', shadow: 'var(--shadow-1)' },
  missed: { border: 'color-mix(in srgb, var(--rust) 70%, var(--paper-3))', bg: 'var(--node-bg)', shadow: 'var(--shadow-1)' },
  done: { border: 'color-mix(in srgb, var(--acid) 40%, var(--paper-3))', bg: 'color-mix(in srgb, var(--acid) 5%, var(--node-bg))', shadow: 'var(--shadow-1)' },
};

export function cardFrameStyle(tone: CardTone): CSSProperties {
  const f = FRAME[tone];
  return {
    position: 'relative',
    width: CARD_W,
    minHeight: CARD_H,
    boxSizing: 'border-box',
    padding: '10px 10px 9px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 7,
    borderRadius: 'var(--radius-lg)',
    border: `1px solid ${f.border}`,
    background: f.bg,
    boxShadow: f.shadow,
    transition: 'border-color 0.2s, box-shadow 0.2s, background 0.2s',
  };
}

const ICONS = {
  calendar: <><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12h3.5" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  undo: <><path d="M9 7L4.5 11.5 9 16" /><path d="M5 11.5h9.5a5 5 0 0 1 0 10H12" /></>,
  grip: <><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /><path d="M12 13v4M10 15h4" /></>,
  replan: <><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4.5V11h-6.5" /></>,
  note: <><path d="M5 4.5h10l4 4V19.5H5z" /><path d="M8.5 11h7M8.5 14.5h5" /></>,
} satisfies Record<string, ReactNode>;

export type CardIconName = keyof typeof ICONS;

export function CardIcon({ name, size = 12 }: { name: CardIconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0, display: 'block' }}>
      {ICONS[name]}
    </svg>
  );
}

/** Row 2: the tag (its colour dot) and when — always in the same place. */
export function CardMetaRow({ tag, tone, icon, when, whenColor }: { tag: string; tone: string; icon: CardIconName; when: string; whenColor?: string | undefined }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
      {tag && (
        <span
          className="task-tag"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, height: 20, padding: '0 7px', borderRadius: 999, flexShrink: 0, maxWidth: 96,
            background: `color-mix(in srgb, ${tone} 16%, transparent)`, color: `color-mix(in srgb, ${tone} 75%, var(--ink))`,
            textTransform: 'capitalize', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}
        >
          <span aria-hidden style={{ width: 6, height: 6, borderRadius: 999, background: tone, flexShrink: 0 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{tag.toLowerCase()}</span>
        </span>
      )}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0, color: whenColor ?? 'var(--ink-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        <CardIcon name={icon} size={11} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{when}</span>
      </span>
    </div>
  );
}

/** The meter: one bar, a label under each end. Always the card's last row. */
export function CardMeter({ ratio, color, left, right, leftTestId, rightNode }: {
  ratio: number; color: string; left: ReactNode; right?: ReactNode | undefined; leftTestId?: string | undefined; rightNode?: ReactNode | undefined;
}) {
  return (
    <div style={{ marginTop: 'auto' }} data-testid="task-meter">
      <div style={{ height: 4, borderRadius: 2, background: 'var(--paper-3)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.max(0, Math.min(1, ratio)) * 100}%`, background: color, borderRadius: 2, transition: 'width 0.3s' }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 5, fontFamily: 'var(--font-mono)', fontSize: 11, fontVariantNumeric: 'tabular-nums', gap: 8 }}>
        <span data-testid={leftTestId} style={{ color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{left}</span>
        <span style={{ marginLeft: 'auto', color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>{rightNode ?? right}</span>
      </div>
    </div>
  );
}

/** "Tue 18:00", "Today 09:30" — the day a task is planned for. */
export function fmtWhen(iso: string | undefined, nowMs = Date.now()): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const today = new Date(nowMs);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const tomorrow = new Date(nowMs); tomorrow.setDate(tomorrow.getDate() + 1);
  if (sameDay(d, today)) return `Today ${hm}`;
  if (sameDay(d, tomorrow)) return `Tomorrow ${hm}`;
  return `${d.toLocaleDateString('en-GB', { weekday: 'short' })} ${d.getDate()} · ${hm}`;
}

/** "1h 20m" / "45m". */
export function fmtDur(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${String(r).padStart(2, '0')}m` : `${h}h`;
}
