// MediaNode — every dropped / pasted thing that isn't a still image:
//   video · embed  react-player (YouTube, Vimeo, files …)
//   audio          custom player: big play button, live bars, seek, time
//   pdf            pdf.js, one page fitted to the card, ‹ › to turn pages
//   link           live website preview + open in browser
//   file           type badge, name, size, download
// Links can be switched to plain text from the header.

import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { NodeResizeControl } from '@xyflow/react';
import type { NodeProps } from '../types';
import { useBoardStore } from '../../../store/boardStore';
import { MEDIA_SIZE, mediaUrl, type MediaConfig, type MediaState } from './types';

const ReactPlayer = lazy(() => import('react-player/lazy'));

const KIND: Record<MediaState['media'], { label: string; tone: string; icon: ReactNode }> = {
  video: { label: 'Video', tone: '#ff8e64', icon: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M10 9l5 3-5 3z" /></> },
  embed: { label: 'Video', tone: '#ff5d8f', icon: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M10 9l5 3-5 3z" /></> },
  audio: { label: 'Audio', tone: '#b48cff', icon: <><path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></> },
  pdf: { label: 'PDF', tone: '#ff6b6b', icon: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" /><path d="M9 13h6M9 17h4" /></> },
  link: { label: 'Website', tone: '#5ad1e6', icon: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" /></> },
  file: { label: 'File', tone: '#c9f158', icon: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" /></> },
};

const Svg = ({ children, size = 14 }: { children: ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>
);

function fmtBytes(n?: number): string {
  if (!n) return '';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${u[i]}`;
}

export function MediaNode({ node, selected, onCommand }: NodeProps<MediaState, MediaConfig>) {
  const s = node.state as MediaState;
  const url = mediaUrl(s);
  const k = KIND[s.media];
  const min = s.media === 'file' ? { w: 220, h: 96 } : s.media === 'audio' ? { w: 280, h: 104 } : { w: 240, h: 160 };
  const isUrl = s.media === 'embed' || s.media === 'link';
  // The card takes the content's shape: embeds start 16:9, files report theirs.
  const fit = (aspect: number) => onCommand('media.setAspect', { aspect });
  useEffect(() => {
    if (s.media === 'embed' && s.aspect === undefined) fit(16 / 9);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.media, s.aspect]);

  // Links: show as plain text instead (turns the node into a text note).
  const toText = () => {
    useBoardStore.getState().updateNode(node.id, { kind: 'text', state: { text: url, width: 320, height: 90 }, config: {} });
  };

  return (
    <div
      data-testid="media-node"
      data-media={s.media}
      style={{
        width: '100%', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column',
        background: 'linear-gradient(180deg, var(--paper-2) 0%, var(--paper) 100%)',
        border: `1px solid ${selected ? 'var(--acid)' : 'var(--paper-3)'}`,
        borderRadius: 14, overflow: 'hidden',
        boxShadow: selected ? '0 0 0 3px color-mix(in srgb, var(--acid) 25%, transparent), 0 14px 34px rgba(0,0,0,0.38)' : '0 14px 34px rgba(0,0,0,0.32)',
        transition: 'box-shadow 160ms ease, border-color 160ms ease',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px 7px 9px', minWidth: 0 }}>
        <span aria-hidden style={{ width: 22, height: 22, flexShrink: 0, borderRadius: 7, display: 'grid', placeItems: 'center', color: k.tone, background: `color-mix(in srgb, ${k.tone} 16%, transparent)` }}>
          <Svg size={13}>{k.icon}</Svg>
        </span>
        <span title={s.title} style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.title}</span>
        {isUrl && (
          <button type="button" className="nodrag" data-testid="media-as-text" title="Show as plain text" onClick={toText} style={chipBtn}>
            Aa
          </button>
        )}
        {(isUrl || s.media === 'pdf' || s.media === 'file') && (
          <a className="nodrag" href={url} target="_blank" rel="noreferrer" download={s.media === 'file' ? s.title : undefined} title={s.media === 'file' ? 'Download' : 'Open'} style={{ ...chipBtn, display: 'grid', placeItems: 'center', textDecoration: 'none' }}>
            <Svg size={12}>{s.media === 'file' ? <><path d="M12 4v11M7 10l5 5 5-5" /><path d="M5 20h14" /></> : <><path d="M14 4h6v6" /><path d="M20 4l-9 9" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>}</Svg>
          </a>
        )}
      </div>

      {/* Body */}
      <div className="nodrag nowheel" style={{ flex: 1, minHeight: 0, position: 'relative', margin: '0 6px 6px', borderRadius: 10, overflow: 'hidden', background: s.media === 'video' || s.media === 'embed' ? '#000' : 'var(--paper-2)' }}>
        {s.media === 'pdf' && <PdfView url={url} page={s.page ?? 1} onPage={(page) => onCommand('media.setPage', { page })} onAspect={fit} />}
        {s.media === 'audio' && <AudioPlayer url={url} tone={k.tone} />}
        {s.media === 'file' && <FileCard name={s.title} size={s.size} tone={k.tone} />}
        {s.media === 'link' && <WebPreview url={url} />}
        {(s.media === 'video' || s.media === 'embed') && <VideoPlayer url={url} onAspect={fit} />}
      </div>

      <NodeResizeControl
        position="bottom-right"
        minWidth={min.w}
        minHeight={min.h}
        keepAspectRatio={s.aspect !== undefined}
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

const chipBtn: React.CSSProperties = {
  height: 22, minWidth: 26, padding: '0 6px', borderRadius: 7, border: '1px solid var(--paper-3)', background: 'transparent',
  color: 'var(--ink-2)', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 600,
};

// ── Video / embed ───────────────────────────────────────────────────────────

function VideoPlayer({ url, onAspect }: { url: string; onAspect: (a: number) => void }) {
  const [error, setError] = useState(false);
  const isFile = url.startsWith('krnl-asset://');
  if (error) {
    return (
      <Centered>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: '#e8ebee', textAlign: 'center', padding: 16, lineHeight: 1.45 }}>
          {isFile
            ? <>This video's format can't play here (common with .mov from phones).<br /><a href={url} download style={{ color: 'var(--accent-on-dark)' }}>Download it</a> or convert to MP4.</>
            : <>This video can't be embedded here.<br /><a href={url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-on-dark)' }}>Open it in the browser ↗</a></>}
        </span>
      </Centered>
    );
  }
  return (
    <Suspense fallback={<Centered><Spinner /></Centered>}>
      <ReactPlayer
        url={url}
        controls
        width="100%"
        height="100%"
        playsinline
        onError={() => setError(true)}
        onReady={(p: { getInternalPlayer: () => unknown }) => {
          // Files: read the real frame size. Embeds stay 16:9.
          const el = p.getInternalPlayer() as HTMLVideoElement | null;
          if (el && 'videoWidth' in el && el.videoWidth > 0 && el.videoHeight > 0) onAspect(el.videoWidth / el.videoHeight);
        }}
        style={{ position: 'absolute', inset: 0 }}
      />
    </Suspense>
  );
}

// ── Audio: custom player ────────────────────────────────────────────────────

function AudioPlayer({ url, tone }: { url: string; tone: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);
  const [error, setError] = useState(false);
  const fmt = (x: number) => (Number.isFinite(x) ? `${Math.floor(x / 60)}:${String(Math.floor(x % 60)).padStart(2, '0')}` : '0:00');
  const toggle = () => {
    const a = ref.current;
    if (!a) return;
    if (a.paused) void a.play().catch(() => setError(true));
    else a.pause();
  };
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '0 14px' }}>
      <audio
        ref={ref}
        src={url}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
        onError={() => setError(true)}
      />
      <button
        type="button"
        data-testid="audio-play"
        aria-label={playing ? 'Pause' : 'Play'}
        onClick={toggle}
        style={{
          width: 44, height: 44, flexShrink: 0, borderRadius: 999, border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center',
          background: tone, color: '#0e1012', boxShadow: `0 6px 18px color-mix(in srgb, ${tone} 45%, transparent)`,
          transition: 'transform 120ms ease',
        }}
      >
        <Svg size={18}>{playing ? <><path d="M9 5v14M15 5v14" strokeWidth={3} /></> : <path d="M8 5l11 7-11 7z" fill="currentColor" />}</Svg>
      </button>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* Live bars */}
        <div aria-hidden style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 22 }}>
          {Array.from({ length: 24 }, (_, i) => (
            <span key={i} style={{
              flex: 1, borderRadius: 2, background: i / 24 <= (dur ? t / dur : 0) ? tone : 'var(--paper-3)',
              height: `${30 + ((i * 37) % 70)}%`, transformOrigin: 'bottom',
              animation: playing ? `krnl-audio-bar ${0.6 + (i % 5) * 0.12}s ease-in-out ${i * 0.03}s infinite alternate` : 'none',
            }} />
          ))}
        </div>
        <input
          type="range"
          aria-label="Seek"
          min={0}
          max={dur || 0}
          step={0.1}
          value={t}
          onChange={(e) => { const a = ref.current; if (a) a.currentTime = Number(e.target.value); }}
          style={{ width: '100%', accentColor: tone, height: 4 }}
        />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: error ? 'var(--rust)' : 'var(--ink-3)' }}>
          {error ? "Can't play this audio format here" : `${fmt(t)} / ${fmt(dur)}`}
        </span>
      </div>
      <style>{'@keyframes krnl-audio-bar { from { transform: scaleY(0.55); } to { transform: scaleY(1); } }'}</style>
    </div>
  );
}

// ── Website preview ─────────────────────────────────────────────────────────

function WebPreview({ url }: { url: string }) {
  const host = (() => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } })();
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
      <iframe
        title={host}
        src={url}
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        referrerPolicy="no-referrer"
        style={{ flex: 1, border: 'none', background: '#fff' }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-3)', borderTop: '1px solid var(--paper-3)', background: 'var(--paper-2)' }}>
        <img alt="" width={12} height={12} src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`} style={{ borderRadius: 3 }} />
        <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{url}</span>
        <span style={{ opacity: 0.7 }}>blank? use ↗</span>
      </div>
    </div>
  );
}

// ── Any other file ──────────────────────────────────────────────────────────

function FileCard({ name, size, tone }: { name: string; size: number | undefined; tone: string }) {
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot + 1).toUpperCase().slice(0, 5) : 'FILE';
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '0 14px' }}>
      <div aria-hidden style={{ position: 'relative', width: 38, height: 46, flexShrink: 0, borderRadius: 6, background: 'var(--paper-3)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)' }}>
        <span style={{ position: 'absolute', left: -4, bottom: 7, padding: '2px 5px', borderRadius: 4, background: tone, color: '#0e1012', fontFamily: 'var(--font-mono)', fontSize: 8.5, fontWeight: 700 }}>{ext}</span>
      </div>
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-3)' }}>{fmtBytes(size) || 'file'} · download from ↓</span>
      </div>
    </div>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>{children}</div>;
}

function Spinner() {
  return (
    <>
      <style>{'@keyframes krnl-spin { to { transform: rotate(360deg); } }'}</style>
      <span aria-label="Loading" style={{ width: 22, height: 22, borderRadius: 999, border: '2px solid rgba(255,255,255,0.15)', borderTopColor: '#fff', animation: 'krnl-spin 0.8s linear infinite' }} />
    </>
  );
}

// ── PDF (pdf.js) — one page fitted to the card, ‹ › to turn pages ──────────

function PdfView({ url, page, onPage, onAspect }: { url: string; page: number; onPage: (p: number) => void; onAspect: (a: number) => void }) {
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
      // Card follows the page shape (page bar adds a little height).
      if (page === 1) onAspect(base.width / (base.height + 34));
      const scale = Math.min((box.w - 12) / base.width, (box.h - 12) / base.height) * (window.devicePixelRatio || 1);
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
      <div ref={boxRef} style={{ flex: 1, minHeight: 0, display: 'grid', placeItems: 'center', background: 'repeating-linear-gradient(45deg, #2a2d31 0 8px, #2d3034 8px 16px)' }}>
        {error
          ? <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--term-rust)', padding: 12, textAlign: 'center' }}>Couldn't open this PDF.</span>
          : pages === 0 ? <Spinner />
          : <canvas ref={canvasRef} style={{ maxWidth: 'calc(100% - 12px)', maxHeight: 'calc(100% - 12px)', borderRadius: 3, boxShadow: '0 6px 20px rgba(0,0,0,0.5)' }} />}
      </div>
      {pages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '5px 0', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-2)', background: 'var(--paper-2)' }}>
          <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)} style={pageBtn(page <= 1)}>‹</button>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{Math.min(page, pages)} / {pages}</span>
          <button type="button" aria-label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)} style={pageBtn(page >= pages)}>›</button>
        </div>
      )}
    </div>
  );
}

const pageBtn = (disabled: boolean): React.CSSProperties => ({
  width: 28, height: 24, borderRadius: 7, border: '1px solid var(--paper-3)', background: 'transparent', fontSize: 14, lineHeight: 1,
  color: disabled ? 'var(--ink-4)' : 'var(--ink)', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1,
});

export { MEDIA_SIZE };
