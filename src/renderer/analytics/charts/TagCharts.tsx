// ADR 0016 — tag charts for the AnalyticsNode "Time" view. SVG-only, like the
// rest of charts/. TagList is a ranked bar list (label · minutes · share);
// TagDailyBars stacks each day's completed minutes by tag.

import type { TagDay, TagSlice } from '../tags';
import { fmtMinutes } from './PlanVsActual';
import { TEXT_INSET, textWidth } from './common';

const AXIS_FONT = 8.5;

const COLOR_LABEL = 'var(--k-an-ink-3, #aab0b7)';
const COLOR_GRID = 'var(--k-an-grid, #2a2e33)';

export function TagList({ tags, width = 320 }: { tags: readonly TagSlice[]; width?: number }) {
  if (tags.length === 0) {
    return <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: COLOR_LABEL }}>No completed tasks in this range yet.</div>;
  }
  const max = Math.max(...tags.map((t) => t.minutes), 1);
  return (
    <div data-testid="tag-list" style={{ display: 'flex', flexDirection: 'column', gap: 7, width }}>
      {tags.map((t) => (
        <div key={t.id} data-testid={`tag-row-${t.id}`} style={{ display: 'grid', gridTemplateColumns: '84px 1fr 92px', alignItems: 'center', gap: 8 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-sans)', fontSize: 11.5, color: 'var(--k-an-ink-1, #eef1f4)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
            <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: t.color, flexShrink: 0 }} />
            {t.label}
          </span>
          <span style={{ height: 8, borderRadius: 4, background: COLOR_GRID, overflow: 'hidden' }}>
            <span style={{ display: 'block', height: '100%', width: `${(t.minutes / max) * 100}%`, background: t.color, borderRadius: 4 }} />
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: COLOR_LABEL, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
            {fmtMinutes(t.minutes)} · {Math.round(t.share * 100)}% · {t.count}
          </span>
        </div>
      ))}
    </div>
  );
}

export function TagDailyBars({
  days,
  tags,
  width = 560,
  height = 160,
}: {
  days: readonly TagDay[];
  tags: readonly TagSlice[];
  width?: number;
  height?: number;
}) {
  const totals = days.map((d) => Object.values(d.minutes).reduce((s, v) => s + v, 0));
  const max = Math.max(...totals, 1);
  // Text containment rule: the y-axis gutter is as wide as its widest label
  // (+ inset each side), so "10h30" never runs off the left edge.
  const axisW = Math.max(...[0, 0.5, 1].map((f) => textWidth(fmtMinutes(max * f), AXIS_FONT)));
  const pad = { left: Math.ceil(axisW + TEXT_INSET * 2), right: 6, top: 8, bottom: 20 };
  const innerW = Math.max(10, width - pad.left - pad.right);
  const innerH = Math.max(10, height - pad.top - pad.bottom);
  const slot = innerW / Math.max(days.length, 1);
  const barW = Math.max(1, Math.min(18, slot * 0.7));
  // Stack in the same order as the ranked list so the biggest tag sits at the bottom.
  const order = tags.map((t) => t.id);
  const colorOf = new Map(tags.map((t) => [t.id, t.color]));
  const labelEvery = Math.ceil(days.length / 8);

  return (
    <svg data-testid="tag-daily-bars" width={width} height={height} role="img" aria-label="Minutes completed per day by tag">
      {[0, 0.5, 1].map((f) => {
        const y = pad.top + innerH - f * innerH;
        return (
          <g key={f}>
            <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke={COLOR_GRID} strokeWidth={1} />
            <text x={pad.left - TEXT_INSET} y={y + 3} textAnchor="end" fontSize={AXIS_FONT} fontFamily="var(--font-mono)" fill={COLOR_LABEL}>
              {fmtMinutes(max * f)}
            </text>
          </g>
        );
      })}
      {days.map((d, i) => {
        const x = pad.left + i * slot + (slot - barW) / 2;
        let y = pad.top + innerH;
        return (
          <g key={d.date}>
            {order.map((id) => {
              const v = d.minutes[id] ?? 0;
              if (v <= 0) return null;
              const h = (v / max) * innerH;
              y -= h;
              return (
                <rect key={id} x={x} y={y} width={barW} height={h} fill={colorOf.get(id)} rx={1}>
                  <title>{`${d.date} · ${tags.find((t) => t.id === id)?.label ?? id}: ${fmtMinutes(v)}`}</title>
                </rect>
              );
            })}
            {i % labelEvery === 0 && (
              <text x={x + barW / 2} y={height - 6} textAnchor="middle" fontSize={8.5} fontFamily="var(--font-mono)" fill={COLOR_LABEL}>
                {d.date.slice(5)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
