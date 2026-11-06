// Milestone card in the app (launch-experience.md F20–F22): a small card,
// bottom right, with a preview of the shareable image and Save image / Copy /
// Not now. Private by default — nothing leaves the app unless the user saves
// or copies the image themselves.

import { useEffect, useState } from 'react';
import { Z } from '../ui/layers';
import { closeMilestone, useLaunchStore } from '../../launch/launchStore';
import { milestoneLine } from '../../launch/milestones';
import { cardFileName, drawMilestoneCard } from '../../launch/milestoneCard';

export function MilestoneNotice() {
  const m = useLaunchStore((s) => s.milestone);
  const [png, setPng] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setPng(null);
    setBlob(null);
    setCopied(false);
    if (!m) return;
    let live = true;
    void drawMilestoneCard(m).then((canvas) => {
      if (!live) return;
      setPng(canvas.toDataURL('image/png'));
      canvas.toBlob((b) => { if (live) setBlob(b); }, 'image/png');
    });
    return () => { live = false; };
  }, [m]);

  if (!m) return null;
  const { title, sub } = milestoneLine(m);

  const save = (): void => {
    if (!png) return;
    const a = document.createElement('a');
    a.href = png;
    a.download = cardFileName(m);
    a.click();
  };
  const copy = (): void => {
    if (!blob) return;
    void navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).then(() => setCopied(true), () => setCopied(false));
  };

  return (
    <div className="ln-toast" role="status" data-testid="milestone-notice" style={{ zIndex: Z.notice, width: 420, gap: 16 }}>
      <div style={{ width: 112, height: 112, flexShrink: 0, borderRadius: 8, overflow: 'hidden', background: 'var(--paper-2)', boxShadow: 'inset 0 0 0 1px var(--paper-3)' }}>
        {png && <img src={png} alt={`Card: ${title}`} style={{ width: '100%', height: '100%', display: 'block' }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 40, lineHeight: 1, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--acid-ink, var(--acid))' }}>{m.value}</span>
        <span className="ln-toast__title" style={{ marginTop: 4 }}>{title}</span>
        <span className="ln-meta">{sub}</span>
        <div className="ln-row" style={{ gap: 4, marginTop: 8 }}>
          <button type="button" className="ln-btn ln-btn--xs ln-btn--primary" disabled={!png} onClick={save} data-testid="milestone-save">Save image</button>
          <button type="button" className="ln-btn ln-btn--xs ln-btn--line" disabled={!blob} onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
          <button type="button" className="ln-btn ln-btn--xs" onClick={closeMilestone} data-testid="milestone-close">Not now</button>
        </div>
      </div>
    </div>
  );
}
