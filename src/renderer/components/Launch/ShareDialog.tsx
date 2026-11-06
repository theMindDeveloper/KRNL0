// Share a milestone (launch-experience.md F21–F23): every card the board can
// make — each habit's streak and the focus sessions — shown full size, in
// square or story format, with Save image and Copy. Opened from Help › Share
// a milestone, a milestone notice ("See card") or `krnl share`.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Z } from '../ui/layers';
import { CloseButton } from '../ui/CloseButton';
import { closeShare, useLaunchStore } from '../../launch/launchStore';
import { cardFileName, drawMilestoneCard, formatsFor, type CardFormat } from '../../launch/milestoneCard';
import type { Milestone } from '../../launch/milestones';

export function saveCard(canvas: HTMLCanvasElement, name: string): void {
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = name;
  a.click();
}

export function copyCard(canvas: HTMLCanvasElement): Promise<boolean> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) { resolve(false); return; }
      navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).then(() => resolve(true), () => resolve(false));
    }, 'image/png');
  });
}

function cardLabel(c: Milestone): string {
  return c.kind === 'streak' ? `${c.habit} · ${c.value} day${c.value === 1 ? '' : 's'}` : `Focus sessions · ${c.value}`;
}

export function ShareDialog() {
  const share = useLaunchStore((s) => s.share);
  const [format, setFormat] = useState<CardFormat>('square');
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [png, setPng] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const card = share?.cards.find((c) => c.id === share.id) ?? null;
  const fmt: CardFormat = card && formatsFor(card).includes(format) ? format : 'square';

  useEffect(() => {
    setCanvas(null);
    setPng(null);
    setCopied(false);
    if (!card) return;
    let live = true;
    void drawMilestoneCard(card, fmt).then((c) => {
      if (!live) return;
      setCanvas(c);
      setPng(c.toDataURL('image/png'));
    });
    return () => { live = false; };
  }, [card, fmt]);

  useEffect(() => {
    if (!share) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeShare(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [share]);

  if (!share || !card) return null;
  const story = fmt === 'story';

  return createPortal(
    <div className="ln-scrim" style={{ zIndex: Z.modal }} onClick={closeShare} data-testid="share-dialog">
      <div className="ln-dialog" role="dialog" aria-modal="true" aria-labelledby="ln-share-title" onClick={(e) => e.stopPropagation()}
        style={{ width: 860, display: 'flex' }}>
        <div className="ln-dots" style={{ flex: 1, minWidth: 0, background: 'var(--paper-2)', display: 'grid', placeItems: 'center', padding: 32, boxShadow: 'inset -1px 0 0 var(--paper-3)' }}>
          <div style={{ width: story ? 270 : 440, aspectRatio: story ? '1080 / 1920' : '1 / 1', borderRadius: 16, overflow: 'hidden', boxShadow: '0 18px 44px rgba(0,0,0,.45)', background: 'var(--paper-3)' }}>
            {png && <img src={png} alt={`Card: ${cardLabel(card)}`} style={{ width: '100%', height: '100%', display: 'block' }} data-testid="share-preview" />}
          </div>
        </div>
        <div style={{ width: 300, flexShrink: 0, padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="ln-row">
            <h2 id="ln-share-title" style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Share a milestone</h2>
            <span style={{ flex: 1 }} />
            <CloseButton onClick={closeShare} label="Close" />
          </div>
          <div className="ln-field">
            <span className="ln-label">Card</span>
            <div role="radiogroup" aria-label="Card" style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
              {share.cards.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={c.id === card.id}
                  onClick={() => useLaunchStore.setState({ share: { ...share, id: c.id } })}
                  className="ln-step"
                  style={{ height: 40, fontSize: 12.5 }}
                  data-testid={`share-card-${c.kind}`}
                >
                  <span aria-hidden style={{ width: 10, height: 10, borderRadius: 3, flexShrink: 0, background: c.kind === 'streak' ? '#d9a55a' : '#c9f158' }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: c.id === card.id ? 'var(--ink)' : undefined }}>{cardLabel(c)}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="ln-field">
            <span className="ln-label">Format</span>
            <div className="ln-seg" role="radiogroup" aria-label="Format">
              <button type="button" aria-pressed={fmt === 'square'} onClick={() => setFormat('square')}>Square · post</button>
              <button type="button" aria-pressed={fmt === 'story'} disabled={!formatsFor(card).includes('story')} onClick={() => setFormat('story')}
                title={card.kind === 'streak' ? 'For Instagram and WhatsApp stories' : 'Story cards are for habit streaks'}>
                Story
              </button>
            </div>
          </div>
          <p className="ln-meta" style={{ margin: 0 }}>Only the habit name and numbers are on the card. No tasks, no times of day.</p>
          <div className="ln-row" style={{ marginTop: 'auto', gap: 8 }}>
            <button type="button" className="ln-btn ln-btn--sm ln-btn--line" disabled={!canvas} onClick={() => { if (canvas) void copyCard(canvas).then(setCopied); }}>
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button type="button" className="ln-btn ln-btn--sm ln-btn--primary" style={{ flex: 1 }} disabled={!canvas}
              onClick={() => { if (canvas) saveCard(canvas, cardFileName(card, fmt)); }} data-testid="share-save">
              Save image
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
