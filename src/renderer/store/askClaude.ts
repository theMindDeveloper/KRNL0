// Decision 41 — the orb's side of asking Claude Code. Sends one question to
// main (`assistant:ask`) and hands its streamed events to the caller.
// Returns null where there is no Electron bridge (browser preview).

import type { AskEvent } from '../../shared/assistant/claudeStream';

type Listener = (e: AskEvent) => void;
const listeners = new Map<string, Listener>();
let unsubscribe: (() => void) | null = null;

function bridge(): Window['krnl'] | undefined {
  return typeof window !== 'undefined' ? window.krnl : undefined;
}

export function canAskClaude(): boolean {
  const b = bridge();
  return !!(b?.assistantAsk && b.onAssistantEvent);
}

/** Ask; `onEvent` gets text / tool / session events, then exactly one done or error. */
export function askClaude(prompt: string, resume: string | undefined, onEvent: Listener): { cancel: () => void } | null {
  const b = bridge();
  if (!b?.assistantAsk || !b.onAssistantEvent) return null;
  if (!unsubscribe) {
    unsubscribe = b.onAssistantEvent((id, e) => {
      const fn = listeners.get(id);
      if (!fn) return;
      const ev = e as AskEvent;
      if (ev.type === 'done' || ev.type === 'error') listeners.delete(id);
      fn(ev);
    });
  }
  const id = `ask-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  listeners.set(id, onEvent);
  void b.assistantAsk(id, prompt, resume).catch((err: unknown) => {
    listeners.delete(id);
    onEvent({ type: 'error', code: 'failed', message: err instanceof Error ? err.message : String(err) });
  });
  return { cancel: () => { void b.assistantCancel?.(id); } };
}
