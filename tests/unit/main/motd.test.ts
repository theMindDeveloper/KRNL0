// Unit tests for MOTD renderer (T1–T6).

import { describe, it, expect } from 'vitest';
import { renderMotd } from '../../../src/main/rpc/motd';

describe('renderMotd', () => {
  const opts = { version: '0.2.0', sessionId: '12345678-abcd-0000-0000-000000000000', cols: 80, rows: 24 };

  it('T2 — includes acid-green ANSI color on wide terminal', () => {
    const motd = renderMotd(opts);
    expect(motd).toContain('\x1b[38;2;201;241;88m');
  });

  it('T3 — includes version and session id prefix', () => {
    const motd = renderMotd(opts);
    expect(motd).toContain('v0.2.0');
    expect(motd).toContain('12345678'); // first 8 chars of sessionId
  });

  it('T3 — includes tagline text', () => {
    const motd = renderMotd(opts);
    expect(motd).toContain('claude code attached');
  });

  it('T4 — includes dim help hint', () => {
    const motd = renderMotd(opts);
    expect(motd).toContain('\x1b[2m');
    expect(motd).toContain("try 'krnl help'");
  });

  it('T5 — compact form for cols < 50', () => {
    const motd = renderMotd({ ...opts, cols: 40 });
    expect(motd).toContain('krnl0 v0.2.0');
    expect(motd).toContain("type 'krnl help'");
    // Must NOT contain multi-line logo characters
    expect(motd).not.toContain('██');
  });

  it('T5 — compact form when rows < 14 even if cols is wide', () => {
    const motd = renderMotd({ ...opts, cols: 80, rows: 12 });
    expect(motd).toContain('krnl0 v0.2.0');
    expect(motd).not.toContain('██');
  });

  it('T5 — full form for cols === 50 with adequate rows', () => {
    const motd = renderMotd({ ...opts, cols: 50, rows: 24 });
    // 50 >= 50 AND rows >= 14 → full form
    expect(motd).toContain('██');
  });

  it('T5 — full form when rows is unspecified (assumes large viewport)', () => {
    const { rows: _ignored, ...noRows } = opts;
    void _ignored;
    const motd = renderMotd(noRows);
    expect(motd).toContain('██');
  });

  it('includes CRLF line endings (required for TTY)', () => {
    const motd = renderMotd(opts);
    expect(motd).toContain('\r\n');
  });

  it('resets ANSI after each colored section', () => {
    const motd = renderMotd(opts);
    expect(motd).toContain('\x1b[0m');
  });
});
