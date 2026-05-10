import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface OrbMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface OrbStore {
  state: 'idle' | 'listening' | 'thinking' | 'speaking';
  messages: OrbMessage[];
  suggestions: string[];
  caption: string;
  micActive: boolean;
  panelOpen: boolean;
  position: { x: number; y: number };

  // actions
  setState: (s: OrbStore['state']) => void;
  addMessage: (m: OrbMessage) => void;
  clearMessages: () => void;
  setSuggestions: (s: string[]) => void;
  setCaption: (c: string) => void;
  togglePanel: () => void;
  setMicActive: (active: boolean) => void;
  setPosition: (pos: { x: number; y: number }) => void;
}

const DEFAULT_SUGGESTIONS = [
  'Add a task',
  'Start pomo',
  'Show habits',
  'Check calendar',
];

// Split into two stores: persisted (position, panelOpen) and in-memory (messages, state).
// We compose them by using persist only on a sub-slice via a partialize function.

export const useOrbStore = create<OrbStore>()(
  persist(
    (set) => ({
      state: 'idle',
      messages: [],
      suggestions: DEFAULT_SUGGESTIONS,
      caption: '',
      micActive: false,
      panelOpen: false,
      position: { x: 22, y: (typeof window !== 'undefined' ? window.innerHeight - 120 : 700) },

      setState: (s) => set({ state: s }),
      addMessage: (m) => set((prev) => ({ messages: [...prev.messages, m] })),
      clearMessages: () => set({ messages: [] }),
      setSuggestions: (suggestions) => set({ suggestions }),
      setCaption: (caption) => set({ caption }),
      togglePanel: () => set((prev) => ({ panelOpen: !prev.panelOpen })),
      setMicActive: (micActive) => set({ micActive }),
      setPosition: (position) => set({ position }),
    }),
    {
      name: 'krnl0-orb',
      // Only persist position and panelOpen. Messages are in-memory only.
      partialize: (s) => ({ position: s.position, panelOpen: s.panelOpen }),
    }
  )
);
