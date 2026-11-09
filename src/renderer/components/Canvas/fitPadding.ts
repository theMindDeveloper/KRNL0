// Fit-to-view padding that keeps content clear of what floats over the canvas:
// the tool rail on the left (~64 px wide, 14 px in) and the minimap on the
// right (~170 px). An even padding opened the board with the left column of
// cards under the rail and a card's time under the minimap.
import type { FitViewOptions } from '@xyflow/react';

type Padding = NonNullable<FitViewOptions['padding']>;

export const CANVAS_FIT_PADDING: Padding = { top: '28px', right: '184px', bottom: '28px', left: '104px' };
