// Fit-to-view padding that keeps content clear of the floating tool rail on
// the canvas's left edge (the rail is ~64 px wide, 14 px in). Fitting with an
// even padding opened the board with the left column of cards under the rail.
import type { FitViewOptions } from '@xyflow/react';

type Padding = NonNullable<FitViewOptions['padding']>;

export const CANVAS_FIT_PADDING: Padding = { top: '28px', right: '32px', bottom: '28px', left: '104px' };
