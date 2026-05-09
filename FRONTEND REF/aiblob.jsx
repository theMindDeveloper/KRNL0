// AI Assistant Blob — glowing liquid orb that listens

function AIBlob() {
  const { useState, useEffect, useRef } = React;
  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [reply, setReply] = useState(null);
  const [history, setHistory] = useState([]);
  const inputRef = useRef(null);
  const [pos, setPos] = useState(() => ({
    left: 22,
    bottom: 56,
  }));
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef(null);

  // Pulse animation when listening — fake amplitude
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    if (!listening) { setPulse(0); return; }
    let raf;
    const start = performance.now();
    const tick = (t) => {
      const dt = (t - start) / 1000;
      setPulse(0.5 + 0.5 * Math.sin(dt * 5) * Math.sin(dt * 1.3));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [listening]);

  // Drag the orb anywhere on screen
  useEffect(() => {
    const onMove = (e) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.sx;
      const dy = e.clientY - d.sy;
      const moved = Math.abs(dx) + Math.abs(dy);
      if (moved > 4) d.didMove = true;
      setPos({
        left: Math.max(8, Math.min(window.innerWidth - 80, d.left + dx)),
        bottom: Math.max(40, Math.min(window.innerHeight - 80, d.bottom - dy)),
      });
    };
    const onUp = () => {
      const d = dragRef.current;
      if (d) {
        dragRef.current = null;
        setDragging(false);
        // If barely moved, treat as click → toggle panel
        if (!d.didMove) setOpen(o => !o);
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const onOrbDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
    dragRef.current = {
      sx: e.clientX, sy: e.clientY,
      left: pos.left, bottom: pos.bottom,
      didMove: false,
    };
  };

  const toggleListen = () => {
    if (listening) {
      setListening(false);
      // Submit whatever transcript we have
      if (transcript.trim()) submit(transcript);
    } else {
      setListening(true);
      setOpen(true);
      setTranscript('');
      setReply(null);
      // Focus input so user can also type
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const submit = async (text) => {
    if (!text?.trim()) return;
    setListening(false);
    setThinking(true);
    setHistory(h => [...h, { role: 'user', text }]);
    setTranscript('');
    try {
      const result = await window.claude.complete(
        `You are KRNL0, an AI assistant embedded in a productivity whiteboard app. ` +
        `The user is on a board with nodes: pomodoro, todos, habits, journal, terminal. ` +
        `Be terse, warm, and a bit witty. 1-2 short sentences max. No markdown. ` +
        `User: ${text}`
      );
      setReply(result);
      setHistory(h => [...h, { role: 'ai', text: result }]);
    } catch (e) {
      setReply('connection lost. retry?');
    }
    setThinking(false);
  };

  const onSubmit = (e) => {
    e.preventDefault();
    submit(transcript);
  };

  const blobClass = [
    'ai-blob',
    listening && 'listening',
    thinking && 'thinking',
    open && 'open',
    dragging && 'dragging',
  ].filter(Boolean).join(' ');

  const orbScale = 1 + (listening ? pulse * 0.18 : 0);

  return (
    <div className={blobClass} style={{ left: pos.left, bottom: pos.bottom, right: 'auto' }}>
      {/* Panel */}
      {open && (
        <div className="ai-panel">
          <div className="ai-panel-head">
            <span className="ai-name">krnl0 · assistant</span>
            <button className="ai-close" onClick={() => setOpen(false)}>×</button>
          </div>

          <div className="ai-history">
            {history.length === 0 && !thinking && !listening && (
              <div className="ai-hint">
                <div className="ai-greet">how can i help?</div>
                <div className="ai-suggest">
                  <button onClick={() => submit('what should I work on next?')}>what should i work on next</button>
                  <button onClick={() => submit('summarize my board')}>summarize my board</button>
                  <button onClick={() => submit('start a 25 minute focus session')}>start a focus session</button>
                </div>
              </div>
            )}
            {history.map((m, i) => (
              <div key={i} className={`ai-msg ${m.role}`}>
                {m.role === 'user' ? '› ' : '◆ '}{m.text}
              </div>
            ))}
            {thinking && <div className="ai-msg ai thinking-line">◆ <span className="dots"><span/><span/><span/></span></div>}
            {listening && (
              <div className="ai-listening">
                <span className="lis-dot" /> listening{transcript ? `: "${transcript}"` : '…'}
              </div>
            )}
          </div>

          <form className="ai-form" onSubmit={onSubmit}>
            <span className="ai-prompt">›</span>
            <input
              ref={inputRef}
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder={listening ? 'or type instead…' : 'ask anything · ⌘+J to listen'}
              disabled={thinking}
            />
            <button type="button" className={`ai-mic ${listening ? 'on' : ''}`} onClick={toggleListen} title="listen">
              {listening ? '■' : '◉'}
            </button>
          </form>
        </div>
      )}

      {/* The orb itself */}
      <button
        className="ai-orb"
        onMouseDown={onOrbDown}
        title="krnl0 assistant — drag to move"
        style={{ transform: `scale(${orbScale})` }}
      >
        <svg viewBox="0 0 80 80" className="orb-svg">
          <defs>
            <radialGradient id="orbGrad" cx="35%" cy="35%" r="70%">
              <stop offset="0%" stopColor="#f0ffb8" stopOpacity="1"/>
              <stop offset="35%" stopColor="#c9f158" stopOpacity="0.95"/>
              <stop offset="70%" stopColor="#7fa830" stopOpacity="0.9"/>
              <stop offset="100%" stopColor="#1a2f00" stopOpacity="1"/>
            </radialGradient>
            <radialGradient id="orbHi" cx="32%" cy="28%" r="22%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95"/>
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0"/>
            </radialGradient>
            <filter id="orbBlur" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="0.4"/>
            </filter>
          </defs>
          {/* outer glow halos */}
          <circle cx="40" cy="40" r="38" fill="url(#orbGrad)" opacity="0.18" />
          <circle cx="40" cy="40" r="32" fill="url(#orbGrad)" opacity="0.35" />
          {/* main orb */}
          <circle cx="40" cy="40" r="26" fill="url(#orbGrad)" filter="url(#orbBlur)" />
          {/* liquid swirl — animated via CSS rotate */}
          <g className="orb-swirl">
            <ellipse cx="40" cy="36" rx="22" ry="7" fill="#c9f158" opacity="0.35" />
            <ellipse cx="40" cy="44" rx="18" ry="5" fill="#7fa830" opacity="0.4" />
          </g>
          {/* highlight */}
          <ellipse cx="32" cy="30" rx="9" ry="6" fill="url(#orbHi)" />
          <circle cx="29" cy="27" r="2" fill="#ffffff" opacity="0.9" />
        </svg>
        {/* pulse rings when listening */}
        {listening && (
          <>
            <span className="orb-ring r1" />
            <span className="orb-ring r2" />
            <span className="orb-ring r3" />
          </>
        )}
      </button>
    </div>
  );
}
