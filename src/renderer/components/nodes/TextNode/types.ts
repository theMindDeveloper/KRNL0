// Brainstorming looks (Miro-style): a plain note, a coloured sticky, or a shape.
export type TextLookKind = 'note' | 'sticky' | 'rect' | 'ellipse' | 'diamond';

export interface TextLook {
  kind: TextLookKind;
  color?: string; // CSS colour (sticky paper / shape fill)
}

export const STICKY_COLORS = ['#ffe28a', '#ffb3c7', '#a8e6ff', '#b9f5a8', '#d9c2ff', '#ffc89a'] as const;
export const LOOK_KINDS: readonly TextLookKind[] = ['note', 'sticky', 'rect', 'ellipse', 'diamond'];

export interface TextState {
  text: string;
  width?: number;
  height?: number;
  /** Absent = plain note. */
  look?: TextLook;
}

export interface TextConfig {
  fontSize?: number;
}
