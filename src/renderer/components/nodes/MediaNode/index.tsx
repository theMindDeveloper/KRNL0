// MediaNode — video / audio / embed (react-player), PDF (pdf.js), web link.
// A titled card with a resize handle; the player fills the card.

import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { NodeResizeControl } from '@xyflow/react';
import type { NodeProps } from '../types';
import { MEDIA_SIZE, mediaUrl, type MediaConfig, type MediaState } from './types';

const ReactPlayer = lazy(() => import('react-player/lazy'));

const KIND_LABEL: Record<MediaState['media'], string> = { video: 'Video', audio: 'Audio', pdf: 'PDF', embed: 'Embed', link: 'Link' };

export function MediaNode({ node, selected, onCommand }: NodeProps<MediaState, MediaConfig>) {
  const s = node.state as MediaState;
  const url = mediaUrl(s);
  const min = s.media === 'link' ? { w: 220, h: 70 } : s.media === 'audio' ? { w: 260, h: 96 } : { w: 240, h: 160 };

  return (
    <div
      data-testid="media-node"
      data-media={s.media}
      style={{
        width: '100%', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column',
        background: 'var(--node-bg, var(--paper))', border: `1px solid ${selected ? 'var(--acid)' : 'var(--paper-3)'}`,
        borderRadius: 12, overflow: 'hidden', boxShadow: '0 10px 26px rgba(0,0,0,0.3)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderBottom: '1px solid var(--paper-3)', minWidth: 0 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--acid-ink, var(--acid))' }}>{KIND_LABEL[s.media]}</span>
        <span title={s.title} style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.title}</span>
      </div>

      <div className="nodrag nowheel" style={{ flex: 1, minHeight: 0, position: 'relative', background: s.media === 'video' || s.media === 'embed' ? '#000' : 'transparent' }}>
        {s.media === 'pdf' ? (
          <PdfView url={url} page={s.page ?? 1} onPage={(page) => onCommand('media.setPage', { page })} />
        ) : s.media === 'link' ? (
          <a href={url} target="_blank" rel="noreferrer" style={{ display: 'block', padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--cyan)', wordBreak: 'break-all' }}>{url}</a>
        ) : (
          <Suspense fallback={null}>
            <ReactPlayer url={url} controls width="100%" height="100%" playsinline style={{ position: 'absolute', inset: 0 }} />
          </Suspense>
        )}
      </div>

      <NodeResizeControl
        position="bottom-right"
        minWidth={min.w}
        minHeight={min.h}
        onResizeEnd={(_e, p) => onCommand('media.setSize', { width: p.width, height: p.height })}
        style={{ background: 'transparent', border: 'none', width: 18, height: 18, right: 2, bottom: 2, zIndex: 3 }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" style={{ position: 'absolute', right: 2, bottom: 2, cursor: 'nwse-resize', color: '#7d848b', pointerEvents: 'none' }} aria-hidden>
          <path d="M13 5L5 13M13 9L9 13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </NodeResizeControl>
    </div>
  );
}

// ── PDF (pdf.js) — renders one page to fit the card, ‹ › to turn pages ─────

function PdfView({ url, page, onPage }: { url: string; page: number; onPage: (p: number) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<{ numPages: number; getPage: (n: number) => Promise<unknown> } | null>(null);
  const [pages, setPages] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        const doc = await pdfjs.getDocument({ url }).promise;
        if (cancelled) return;
        docRef.current = doc as unknown as typeof docRef.current;
        setPages(doc.numPages);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => { cancelled = true; };
  }, [url]);

  useEffect(() => {
    const doc = docRef.current;
    const canvas = canvasRef.current;
    if (!doc || !canvas || box.w === 0 || box.h === 0) return;
    let cancelled = false;
    (async () => {
      const p = (await doc.getPage(Math.min(page, doc.numPages))) as {
        getViewport: (o: { scale: number }) => { width: number; height: number };
        render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void> };
      };
      if (cancelled) return;
      const base = p.getViewport({ scale: 1 });
      const scale = Math.min(box.w / base.width, box.h / base.height) * (window.devicePixelRatio || 1);
      const vp = p.getViewport({ scale });
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      const ctx = canvas.getContext('2d');
      if (ctx) await p.render({ canvasContext: ctx, viewport: vp }).promise;
    })();
    return () => { cancelled = true; };
  }, [page, pages, box]);

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
      <div ref={boxRef} style={{ flex: 1, minHeight: 0, display: 'grid', placeItems: 'center', background: '#2a2d31' }}>
        {error
          ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--rust)', padding: 10 }}>Couldn't open PDF: {error}</span>
          : <canvas ref={canvasRef} style={{ maxWidth: '100%', maxHeight: '100%', boxShadow: '0 2px 10px rgba(0,0,0,0.4)' }} />}
      </div>
      {pages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '4px 0', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-2)', borderTop: '1px solid var(--paper-3)' }}>
          <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)} style={pageBtn(page <= 1)}>‹</button>
          <span>{Math.min(page, pages)} / {pages}</span>
          <button type="button" aria-label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)} style={pageBtn(page >= pages)}>›</button>
        </div>
      )}
    </div>
  );
}

const pageBtn = (disabled: boolean): React.CSSProperties => ({
  background: 'transparent', border: '1px solid var(--paper-3)', borderRadius: 6, padding: '1px 9px', fontSize: 13,
  color: disabled ? 'var(--ink-4)' : 'var(--ink)', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1,
});

export { MEDIA_SIZE };
