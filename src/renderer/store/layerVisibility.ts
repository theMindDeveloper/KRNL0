/**
 * useLayerVisibility — persisted canvas-wide layer filters.
 *
 * Three boolean flags, one per node-kind category. Flipping a layer OFF
 * sets `hidden: true` on every node of that kind in the React Flow mapping
 * (see toRfNode in rfAdapters). Persisted in localStorage so the user's
 * filter preferences survive reloads.
 *
 * Driven by the KRNL Dock bottom-rail switches.
 */

import { create } from 'zustand';

export type Layer = 'tasks' | 'texts' | 'images';

export interface LayerVisibilityState {
  tasks: boolean;
  texts: boolean;
  images: boolean;
  setLayer(layer: Layer, visible: boolean): void;
  toggleLayer(layer: Layer): void;
}

const STORAGE_KEY = 'krnl0-layer-visibility';

function readStored(): { tasks: boolean; texts: boolean; images: boolean } {
  if (typeof localStorage === 'undefined') return { tasks: true, texts: true, images: true };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { tasks: true, texts: true, images: true };
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      tasks: parsed.tasks !== false,
      texts: parsed.texts !== false,
      images: parsed.images !== false,
    };
  } catch {
    return { tasks: true, texts: true, images: true };
  }
}

function writeStored(state: { tasks: boolean; texts: boolean; images: boolean }): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota errors */
  }
}

export const useLayerVisibility = create<LayerVisibilityState>((set, get) => {
  const initial = readStored();
  return {
    tasks: initial.tasks,
    texts: initial.texts,
    images: initial.images,
    setLayer: (layer, visible) => {
      set({ [layer]: visible } as Partial<LayerVisibilityState>);
      const s = get();
      writeStored({ tasks: s.tasks, texts: s.texts, images: s.images });
    },
    toggleLayer: (layer) => {
      const current = get()[layer];
      set({ [layer]: !current } as Partial<LayerVisibilityState>);
      const s = get();
      writeStored({ tasks: s.tasks, texts: s.texts, images: s.images });
    },
  };
});

/** Map a node kind to its layer category, or null if unfiltered. */
export function kindToLayer(kind: string): Layer | null {
  if (kind === 'todo.task') return 'tasks';
  if (kind === 'text') return 'texts';
  if (kind === 'image') return 'images';
  return null;
}
