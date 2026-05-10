// @vitest-environment jsdom
/**
 * useOrbStore tests — Decision #16 (Full AI Orb).
 */

import { describe, it, expect, beforeEach } from 'vitest';

// Reset localStorage before each test to prevent persist middleware leakage.
beforeEach(() => {
  localStorage.removeItem('krnl0-orb');
});

// Re-import the store fresh each test by resetting its state via actions.
// (Zustand singletons persist across tests within a file unless reset.)

import { useOrbStore } from '../../../src/renderer/store/useOrbStore';
import type { OrbMessage } from '../../../src/renderer/store/useOrbStore';

function resetStore() {
  const s = useOrbStore.getState();
  s.setState('idle');
  s.clearMessages();
  s.setSuggestions(['Add a task', 'Start pomo', 'Show habits', 'Check calendar']);
  s.setCaption('');
  s.setMicActive(false);
  // Close panel if open
  if (useOrbStore.getState().panelOpen) s.togglePanel();
  s.setPosition({ x: 22, y: 700 });
}

describe('useOrbStore (Decision #16)', () => {
  beforeEach(() => {
    resetStore();
  });

  describe('initial state', () => {
    it('starts in idle orb state', () => {
      expect(useOrbStore.getState().state).toBe('idle');
    });

    it('starts with empty messages array', () => {
      expect(useOrbStore.getState().messages).toEqual([]);
    });

    it('starts with 4 default suggestions', () => {
      const { suggestions } = useOrbStore.getState();
      expect(suggestions).toHaveLength(4);
      expect(suggestions).toContain('Add a task');
      expect(suggestions).toContain('Start pomo');
      expect(suggestions).toContain('Show habits');
      expect(suggestions).toContain('Check calendar');
    });

    it('starts with empty caption', () => {
      expect(useOrbStore.getState().caption).toBe('');
    });

    it('starts with micActive = false', () => {
      expect(useOrbStore.getState().micActive).toBe(false);
    });

    it('starts with panelOpen = false', () => {
      expect(useOrbStore.getState().panelOpen).toBe(false);
    });

    it('position has x: 22', () => {
      // y depends on window.innerHeight at module load; only assert x is stable
      expect(useOrbStore.getState().position.x).toBe(22);
    });
  });

  describe('togglePanel', () => {
    it('opens panel when it is closed', () => {
      expect(useOrbStore.getState().panelOpen).toBe(false);
      useOrbStore.getState().togglePanel();
      expect(useOrbStore.getState().panelOpen).toBe(true);
    });

    it('closes panel when it is open', () => {
      useOrbStore.getState().togglePanel(); // open
      useOrbStore.getState().togglePanel(); // close
      expect(useOrbStore.getState().panelOpen).toBe(false);
    });

    it('toggles twice returns to original closed state', () => {
      const initial = useOrbStore.getState().panelOpen;
      useOrbStore.getState().togglePanel();
      useOrbStore.getState().togglePanel();
      expect(useOrbStore.getState().panelOpen).toBe(initial);
    });
  });

  describe('addMessage', () => {
    it('appends a user message to the messages array', () => {
      const msg: OrbMessage = { role: 'user', content: 'hello', timestamp: 1000 };
      useOrbStore.getState().addMessage(msg);
      expect(useOrbStore.getState().messages).toHaveLength(1);
      expect(useOrbStore.getState().messages[0]).toEqual(msg);
    });

    it('appends an assistant message', () => {
      const msg: OrbMessage = { role: 'assistant', content: 'I can help!', timestamp: 2000 };
      useOrbStore.getState().addMessage(msg);
      expect(useOrbStore.getState().messages[0]?.role).toBe('assistant');
    });

    it('appends multiple messages in order', () => {
      const m1: OrbMessage = { role: 'user', content: 'first', timestamp: 1 };
      const m2: OrbMessage = { role: 'assistant', content: 'second', timestamp: 2 };
      const m3: OrbMessage = { role: 'user', content: 'third', timestamp: 3 };
      useOrbStore.getState().addMessage(m1);
      useOrbStore.getState().addMessage(m2);
      useOrbStore.getState().addMessage(m3);
      const msgs = useOrbStore.getState().messages;
      expect(msgs).toHaveLength(3);
      expect(msgs[0]?.content).toBe('first');
      expect(msgs[1]?.content).toBe('second');
      expect(msgs[2]?.content).toBe('third');
    });

    it('clearMessages empties the array', () => {
      const msg: OrbMessage = { role: 'user', content: 'hello', timestamp: 1 };
      useOrbStore.getState().addMessage(msg);
      useOrbStore.getState().clearMessages();
      expect(useOrbStore.getState().messages).toEqual([]);
    });
  });

  describe('setPosition', () => {
    it('updates position x and y', () => {
      useOrbStore.getState().setPosition({ x: 100, y: 200 });
      expect(useOrbStore.getState().position).toEqual({ x: 100, y: 200 });
    });

    it('replaces position entirely (does not merge)', () => {
      useOrbStore.getState().setPosition({ x: 50, y: 600 });
      useOrbStore.getState().setPosition({ x: 0, y: 0 });
      expect(useOrbStore.getState().position).toEqual({ x: 0, y: 0 });
    });

    it('accepts negative coordinates (dragged off-screen edge)', () => {
      useOrbStore.getState().setPosition({ x: -10, y: -5 });
      expect(useOrbStore.getState().position).toEqual({ x: -10, y: -5 });
    });
  });

  describe('setState (orb activity state)', () => {
    it('transitions to listening', () => {
      useOrbStore.getState().setState('listening');
      expect(useOrbStore.getState().state).toBe('listening');
    });

    it('transitions to thinking', () => {
      useOrbStore.getState().setState('thinking');
      expect(useOrbStore.getState().state).toBe('thinking');
    });

    it('transitions to speaking', () => {
      useOrbStore.getState().setState('speaking');
      expect(useOrbStore.getState().state).toBe('speaking');
    });

    it('returns to idle from any state', () => {
      useOrbStore.getState().setState('thinking');
      useOrbStore.getState().setState('idle');
      expect(useOrbStore.getState().state).toBe('idle');
    });
  });

  describe('setMicActive', () => {
    it('sets micActive to true', () => {
      useOrbStore.getState().setMicActive(true);
      expect(useOrbStore.getState().micActive).toBe(true);
    });

    it('sets micActive back to false', () => {
      useOrbStore.getState().setMicActive(true);
      useOrbStore.getState().setMicActive(false);
      expect(useOrbStore.getState().micActive).toBe(false);
    });
  });

  describe('setSuggestions', () => {
    it('replaces suggestions array', () => {
      const newSuggestions = ['Do something', 'Do another thing'];
      useOrbStore.getState().setSuggestions(newSuggestions);
      expect(useOrbStore.getState().suggestions).toEqual(newSuggestions);
    });

    it('accepts empty suggestions array', () => {
      useOrbStore.getState().setSuggestions([]);
      expect(useOrbStore.getState().suggestions).toEqual([]);
    });
  });
});
