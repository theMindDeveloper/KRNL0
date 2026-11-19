// The Line layout (docs/06-requirements/line-layout.md): one day line instead
// of seven windows. It is a way of looking at the same board, so its settings
// are a preference of this install (localStorage), never part of board.json:
// older versions of the app open the board unchanged.

import { create } from 'zustand';

export const LINE_VIEWS = ['today', 'week', 'habits', 'board'] as const;
export type LineView = (typeof LINE_VIEWS)[number];
export const LINE_SHAPES = ['line', 'clock'] as const;
export type LineShape = (typeof LINE_SHAPES)[number];

export const isLineView = (v: unknown): v is LineView => typeof v === 'string' && (LINE_VIEWS as readonly string[]).includes(v);
export const isLineShape = (v: unknown): v is LineShape => typeof v === 'string' && (LINE_SHAPES as readonly string[]).includes(v);

export const LINE_KEY = 'krnl0-line-layout';

interface Stored { on: boolean; view: LineView; shape: LineShape }
const DEFAULTS: Stored = { on: false, view: 'today', shape: 'line' };

export function parseLineLayout(raw: string | null): Stored {
  if (!raw) return { ...DEFAULTS };
  try {
    const v = JSON.parse(raw) as Partial<Record<keyof Stored, unknown>>;
    return {
      on: typeof v.on === 'boolean' ? v.on : DEFAULTS.on,
      view: isLineView(v.view) ? v.view : DEFAULTS.view,
      shape: isLineShape(v.shape) ? v.shape : DEFAULTS.shape,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

interface LineStore extends Stored {
  setOn: (on: boolean) => void;
  setView: (view: LineView) => void;
  setShape: (shape: LineShape) => void;
}

export const useLineLayout = create<LineStore>((set, get) => {
  let initial = { ...DEFAULTS };
  try { initial = parseLineLayout(localStorage.getItem(LINE_KEY)); } catch { /* no storage */ }
  const save = (patch: Partial<Stored>): void => {
    set(patch);
    const { on, view, shape } = get();
    try { localStorage.setItem(LINE_KEY, JSON.stringify({ on, view, shape })); } catch { /* no storage */ }
  };
  return {
    ...initial,
    setOn: (on) => save({ on }),
    setView: (view) => save({ view }),
    setShape: (shape) => save({ shape }),
  };
});

/** True while the Line layout is on screen (the windows are not mounted then). */
export const lineLayoutOn = (): boolean => useLineLayout.getState().on;

function status(): string {
  const { on, view, shape } = useLineLayout.getState();
  return on ? `line layout: on · ${view} · drawn as a ${shape}` : 'line layout: off (the windows are shown)';
}

/** `krnl line …` in the renderer: the same store the layout's own buttons use. */
export function runLineCommand(command: string, args: Record<string, unknown>): { ok: boolean; message: string } {
  const st = useLineLayout.getState();
  switch (command) {
    case 'line.status':
      return { ok: true, message: status() };
    case 'line.on':
      st.setOn(true);
      return { ok: true, message: status() };
    case 'line.off':
      st.setOn(false);
      return { ok: true, message: status() };
    case 'line.view': {
      const v = args['view'];
      if (!isLineView(v)) return { ok: false, message: `Unknown view "${String(v)}" (use: ${LINE_VIEWS.join(', ')})` };
      st.setOn(true);
      st.setView(v);
      return { ok: true, message: status() };
    }
    case 'line.shape': {
      const s = args['shape'];
      if (!isLineShape(s)) return { ok: false, message: `Unknown shape "${String(s)}" (use: ${LINE_SHAPES.join(', ')})` };
      st.setShape(s);
      return { ok: true, message: status() };
    }
    default:
      return { ok: false, message: `Unknown line command "${command}"` };
  }
}
