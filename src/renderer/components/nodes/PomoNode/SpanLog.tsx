// Pomo span log — every recorded work/break span for a day, newest first,
// with a delete button each. Tiny or misclicked spans that are hard to hit on
// the Calendar/Clock are easy to find and remove here.

import { LineGlyph } from '../../ui/LineGlyph';
import { useState } from 'react';
import type { PomoSessionRecord } from './types';
import type { TagDef } from '../../../../shared/tags/classify';
import { tagDisplay } from '../../../../shared/tags/classify';
import { CategoryIcon } from './CategoryIcon';
import { spanTone } from '../../../store/spanTags';

export interface SpanLogProps {
  history: readonly PomoSessionRecord[];
  library: readonly TagDef[];
  taskName: (id: string) => string | undefined;
  onDelete: (id: string) => void;
  /** Name or rename a work span (opens the labeler). Absent in Easy mode:
   *  names are hidden and spans show in one colour. */
  onName?: (id: string) => void;
}

const ymd = (ms: number) => new Date(ms).toLocaleDateString('en-CA');
const hm = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function fmtDur(ms: number): string {
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.round(sec / 60);
  return min < 60 ? `${min}m` : `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`;
}

export function SpanLog({ history, library, taskName, onDelete, onName }: SpanLogProps) {
  const plain = !onName;
  const [dayOffset, setDayOffset] = useState(0);
  const day = ymd(Date.now() - dayOffset * 86_400_000);
  const rows = history
    .filter((r) => ymd(Date.parse(r.startedAt)) === day)
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));

  return (
    <div data-testid="pomo-log" onMouseDown={(e) => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: 6, minHeight: 240 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        <button type="button" aria-label="Previous day" onClick={() => setDayOffset((d) => d + 1)} style={navBtn}>‹</button>
        <span style={{ flex: 1, textAlign: 'center' }}>{dayOffset === 0 ? 'today' : dayOffset === 1 ? 'yesterday' : day} · {rows.length} spans</span>
        <button type="button" aria-label="Next day" disabled={dayOffset === 0} onClick={() => setDayOffset((d) => Math.max(0, d - 1))} style={{ ...navBtn, opacity: dayOffset === 0 ? 0.3 : 1 }}>›</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto', maxHeight: 300 }}>
        {rows.length === 0 && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-4)', padding: '12px 0', textAlign: 'center' }}>nothing recorded</span>
        )}
        {rows.map((r) => {
          const start = Date.parse(r.startedAt);
          const end = Date.parse(r.endedAt);
          const isBreak = r.kind === 'break';
          const cat = !plain && !isBreak && !r.taskId && r.tag ? tagDisplay(library, r.tag) : null;
          const unnamed = !isBreak && !r.taskId && !r.label;
          const name = isBreak ? 'Break' : plain ? 'Work' : r.taskId ? (taskName(r.taskId) ?? r.label) || 'task' : r.label || 'name it…';
          return (
            <div
              key={r.id}
              data-testid="pomo-log-row"
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', borderRadius: 4, background: 'var(--paper-2)', fontFamily: 'var(--font-mono)', fontSize: 10 }}
            >
              {isBreak
                ? <span aria-hidden style={{ width: 10, height: 10, borderRadius: 2, flexShrink: 0, background: 'repeating-linear-gradient(135deg, var(--ink-3) 0 1px, transparent 1px 3px)' }} />
                : cat
                  ? <CategoryIcon id={cat.id} color={cat.color} size={11} />
                  : <span aria-hidden style={{ width: 7, height: 7, borderRadius: 999, flexShrink: 0, background: spanTone(library, r, plain) }} />}
              <span style={{ color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{hm(start)}–{hm(end)}</span>
              {isBreak || !onName ? (
                <span style={{ flex: 1, minWidth: 0, color: isBreak ? 'var(--ink-3)' : 'var(--ink)' }}>{name}</span>
              ) : (
                <button
                  type="button"
                  data-testid="pomo-log-name"
                  title={unnamed ? 'Name this span' : 'Rename / change category or task'}
                  onClick={() => onName(r.id)}
                  style={{
                    flex: 1, minWidth: 0, textAlign: 'left', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
                    fontFamily: 'var(--font-mono)', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    color: unnamed ? 'var(--acid-ink, var(--acid))' : 'var(--ink)', textDecoration: unnamed ? 'underline dotted' : 'none',
                  }}
                >
                  {r.taskId ? <><LineGlyph name="task" size={10} /> </> : ''}{name}{cat ? <span style={{ color: 'var(--ink-3)' }}> · {cat.label}</span> : null}
                </button>
              )}
              <span style={{ color: 'var(--ink-3)', flexShrink: 0 }}>{fmtDur(end - start)}</span>
              <button
                type="button"
                data-testid="pomo-log-delete"
                aria-label="Delete span"
                title="Delete this span (Ctrl+Z undoes)"
                onClick={() => onDelete(r.id)}
                style={{ background: 'transparent', border: 'none', color: 'var(--ink-3)', cursor: 'pointer', fontSize: 12, padding: '0 2px', lineHeight: 1 }}
              >
                <LineGlyph name="close" size={10} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const navBtn: React.CSSProperties = {
  background: 'transparent', border: '1px solid var(--paper-3)', color: 'var(--ink-2)', borderRadius: 4,
  width: 22, height: 20, cursor: 'pointer', fontFamily: 'var(--font-mono)', lineHeight: 1,
};
