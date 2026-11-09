// Milestone notice in the app (launch-experience.md F20, F22), as designed:
// a small card bottom right — a badge with the number, one line, one sub
// line — and Save image · Copy · Not now. "See card" opens the share window
// with the full-size image. Nothing leaves the app unless the user saves or
// copies the image.

import { useEffect, useState } from 'react';
import { Z } from '../ui/layers';
import { closeMilestone, openShare, useLaunchStore } from '../../launch/launchStore';
import { milestoneLine } from '../../launch/milestones';
import { cardFileName, drawMilestoneCard } from '../../launch/milestoneCard';
import { copyCard, saveCard } from './ShareDialog';

export function MilestoneNotice() {
  const m = useLaunchStore((s) => s.milestone);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setCanvas(null);
    setCopied(false);
    if (!m) return;
    let live = true;
    void drawMilestoneCard(m).then((c) => { if (live) setCanvas(c); });
    return () => { live = false; };
  }, [m]);

  if (!m) return null;
  const { title, sub } = milestoneLine(m);
  const streak = m.kind === 'streak';

  return (
    <div className="ln-toast" role="status" data-testid="milestone-notice" style={{ zIndex: Z.notice, width: 400, flexDirection: 'column', alignItems: 'stretch', gap: 16 }}>
      <div className="ln-row" style={{ gap: 12 }}>
        <button
          type="button"
          onClick={() => openShare(m)}
          title="See the card"
          style={{
            width: 40, height: 40, borderRadius: 8, flexShrink: 0, border: 0, cursor: 'pointer', display: 'grid', placeItems: 'center',
            fontFamily: 'var(--font-mono)', fontSize: m.value >= 100 ? 11 : 13, fontWeight: 800,
            background: streak ? '#d9a55a' : '#0d1207', color: streak ? '#0a0908' : '#c9f158',
            boxShadow: streak ? 'inset 0 0 0 2px var(--ink)' : 'inset 0 0 0 1px #2a3312',
          }}
        >
          {m.value}
        </button>
        <div style={{ minWidth: 0 }}>
          <div className="ln-toast__title">{title}</div>
          <div className="ln-meta" style={{ marginTop: 2 }}>{sub}</div>
        </div>
      </div>
      <div className="ln-row" style={{ gap: 8 }}>
        <button type="button" className="ln-btn ln-btn--sm ln-btn--primary" disabled={!canvas} onClick={() => { if (canvas) saveCard(canvas, cardFileName(m)); }} data-testid="milestone-save">
          Save image
        </button>
        <button type="button" className="ln-btn ln-btn--sm ln-btn--line" disabled={!canvas} onClick={() => { if (canvas) void copyCard(canvas).then(setCopied); }}>
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button type="button" className="ln-link" style={{ marginLeft: 4 }} onClick={() => openShare(m)}>See card</button>
        <button type="button" className="ln-btn ln-btn--sm" style={{ marginLeft: 'auto' }} onClick={closeMilestone} data-testid="milestone-close">Not now</button>
      </div>
    </div>
  );
}
