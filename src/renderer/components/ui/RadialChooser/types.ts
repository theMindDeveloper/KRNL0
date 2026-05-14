// ADR 0002 — RadialChooser types.
// Exported as the public API surface for consumers of the primitive.

export const RADIAL_CHOOSER_Z = 2147483000;

export interface RadialOption<T = unknown> {
  id: string;       // stable, used as React key
  label: string;    // short — wedge text, max ~10 chars; truncate with ellipsis
  value: T;         // arbitrary payload returned to onPick
  icon?: string;    // optional single grapheme (emoji or glyph) rendered above label
  color?: string;   // optional CSS color for wedge stroke; defaults to var(--acid)
}

export interface RadialChooserOptions<T = unknown> {
  radius?: number;       // outer radius in CSS px; default 88
  innerRadius?: number;  // dead-zone radius; default 24 (also the cancel target)
  wedgeGap?: number;     // gap between wedges in CSS px on the arc; default 4
  onPick: (value: T, option: RadialOption<T>) => void;
  onCancel?: () => void; // fired on drag-leave OR Escape OR drop in dead zone
}

export interface RadialChooserHandle<T = unknown> {
  open: (origin: { x: number; y: number }, options: RadialOption<T>[]) => void;
  close: () => void;  // imperative cancel; fires onCancel
  isOpen: boolean;    // for guards in caller's event handlers
}

// Internal session state kept by the host singleton.
export interface ChooserSession {
  origin: { x: number; y: number };
  options: RadialOption<unknown>[];
  radius: number;
  innerRadius: number;
  wedgeGap: number;
  hoveredIndex: number | null;
  onPick: (value: unknown, option: RadialOption<unknown>) => void;
  onCancel: (() => void) | undefined;
}
