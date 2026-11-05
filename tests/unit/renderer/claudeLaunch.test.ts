// @vitest-environment jsdom
/** Issue #206 — start Claude Code in the board terminal (Orb + `krnl term claude`). */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useBoardStore } from '../../../src/renderer/store/boardStore';
import { launchClaudeInTerminal, claudeCommandLine, revealTerminal } from '../../../src/renderer/store/claudeLaunch';
import { setLiveTerminal } from '../../../src/renderer/components/nodes/TerminalNode/liveTerminals';
import type { LiveTerminal } from '../../../src/renderer/components/nodes/TerminalNode/liveTerminals';
import { FOCUS_NODE_EVENT } from '../../../src/renderer/store/scheduleActions';
import { SysParser } from '../../../src/sys/parser';
import type { Board, Node } from '../../../src/shared/types';

vi.mock('../../../src/renderer/store/eventLog', async (orig) => ({
  ...(await orig<typeof import('../../../src/renderer/store/eventLog')>()),
  saveBoard: vi.fn(async () => undefined),
}));

function term(config: Record<string, unknown> = {}): Node {
  return { id: 'mother-term', kind: 'term', isMother: true, position: { x: 0, y: 0 }, state: {}, config } as unknown as Node;
}
function setBoard(nodes: Node[], layoutMode: 'station' | 'canvas'): void {
  useBoardStore.setState({
    board: { version: 1, savedAt: '', viewport: { x: 0, y: 0, zoom: 1 }, nodes, edges: [], layoutMode } as unknown as Board,
  });
}
function live(sessionId: string | null): LiveTerminal {
  return { sessionId, term: { focus: vi.fn() } } as unknown as LiveTerminal;
}

beforeEach(() => setLiveTerminal('mother-term', live(null)));
afterEach(() => vi.useRealTimers());

describe('claudeCommandLine', () => {
  it('adds the bypass flag only when asked', () => {
    expect(claudeCommandLine(false)).toBe('claude');
    expect(claudeCommandLine(true)).toBe('claude --dangerously-skip-permissions');
  });
});

describe('revealTerminal', () => {
  it('shows a hidden terminal panel in Station mode', () => {
    setBoard([term({ stationHidden: true })], 'station');
    expect(revealTerminal()).toBe('mother-term');
    const t = useBoardStore.getState().board!.nodes.find((n) => n.kind === 'term')!;
    expect((t.config as { stationHidden?: boolean }).stationHidden).toBe(false);
  });

  it('centres the terminal in Canvas mode', () => {
    setBoard([term()], 'canvas');
    const seen: string[] = [];
    const on = (e: Event): void => { seen.push((e as CustomEvent<{ nodeId: string }>).detail.nodeId); };
    window.addEventListener(FOCUS_NODE_EVENT, on);
    revealTerminal();
    window.removeEventListener(FOCUS_NODE_EVENT, on);
    expect(seen).toEqual(['mother-term']);
  });

  it('returns null without a terminal', () => {
    setBoard([], 'canvas');
    expect(revealTerminal()).toBeNull();
  });
});

describe('launchClaudeInTerminal', () => {
  it('types the bypass command into the shell session and focuses it', async () => {
    setBoard([term()], 'canvas');
    const lt = live('sess-1');
    setLiveTerminal('mother-term', lt);
    const write = vi.fn(async () => undefined);
    const r = await launchClaudeInTerminal(true, { write });
    expect(r.ok).toBe(true);
    expect(write).toHaveBeenCalledWith('sess-1', 'claude --dangerously-skip-permissions\r');
    expect(lt.term.focus).toHaveBeenCalled();
  });

  it('waits for the shell to start', async () => {
    setBoard([term({ stationHidden: true })], 'station');
    const write = vi.fn(async () => undefined);
    setTimeout(() => setLiveTerminal('mother-term', live('late')), 30);
    const r = await launchClaudeInTerminal(false, { write, stepMs: 10, timeoutMs: 500 });
    expect(r.ok).toBe(true);
    expect(write).toHaveBeenCalledWith('late', 'claude\r');
  });

  it('fails clearly when the shell never starts', async () => {
    setBoard([term()], 'canvas');
    const write = vi.fn(async () => undefined);
    const r = await launchClaudeInTerminal(true, { write, stepMs: 5, timeoutMs: 20 });
    expect(r.ok).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });
});

describe('krnl term claude parser', () => {
  it('parses --bypass', () => {
    expect(SysParser.parse(['term', 'claude', '--bypass'])).toEqual({ kind: 'term', sub: 'claude', bypass: true });
    expect(SysParser.parse(['term', 'claude'])).toEqual({ kind: 'term', sub: 'claude', bypass: false });
  });
});
