// Items for the canvas right-click wheel: a few categories on the first ring,
// each opening its own ring (sticky colours, shape kinds, media, pen tools).

import type { PieItem } from '../ui/PieMenu';
import { isEasyBoard } from '../../store/uiMode';
import { useBoardStore } from '../../store/boardStore';
import { STICKY_COLORS, type TextLook } from '../nodes/TextNode/types';

export interface CanvasWheelActions {
  task: () => void;
  habit: () => void;
  note: () => void;
  look: (look: TextLook) => void;
  image: () => void;
  mediaFile: () => void;
  frame: () => void;
  pen: () => void;
}

const I = {
  task: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 12l3 3 5-6" /></>,
  habit: <><path d="M4 12a8 8 0 1 0 3-6.2" /><path d="M4 4v4h4" /></>,
  note: <path d="M5 4h14M12 4v16M8 20h8" />,
  sticky: <><path d="M5 4h14v11l-5 5H5z" /><path d="M14 20v-5h5" /></>,
  shapes: <><rect x="3" y="4" width="10" height="8" rx="1.5" /><circle cx="16" cy="15.5" r="5" /></>,
  rect: <rect x="4" y="6" width="16" height="12" rx="2" />,
  ellipse: <ellipse cx="12" cy="12" rx="8.5" ry="6.5" />,
  diamond: <path d="M12 3.5l8.5 8.5-8.5 8.5L3.5 12z" />,
  media: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M10 9l5 3-5 3z" /></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-9 9" /></>,
  file: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" /></>,
  frame: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 9h18" /></>,
  pen: <><path d="M4 20l1.5-4.5L16 5a2 2 0 0 1 3 3L8.5 18.5z" /><path d="M14 7l3 3" /></>,
  marker: <><path d="M9 15l-4 4h4l2-2" /><path d="M9 15l8.5-8.5a2.1 2.1 0 0 1 3 3L12 18z" /></>,
  highlighter: <><path d="M5 20h6" /><path d="M8 16l-2-2 9-9 4 4-9 9z" /><path d="M12 8l4 4" /></>,
  arrow: <><path d="M5 19L19 5" /><path d="M10 5h9v9" /></>,
  eraser: <><path d="M7 20h13" /><path d="M5.5 14.5l8-8a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L11 19H8z" /></>,
};

export function canvasWheelItems(a: CanvasWheelActions): PieItem[] {
  return [
    { key: 'task', label: 'Task', icon: I.task, onSelect: a.task },
    { key: 'habit', label: 'Habit', icon: I.habit, onSelect: a.habit },
    { key: 'note', label: 'Note', shortcut: 'N', icon: I.note, onSelect: a.note },
    {
      key: 'sticky', label: 'Sticky', shortcut: 'S', icon: I.sticky,
      children: STICKY_COLORS.map((c) => ({ key: `sticky-${c}`, label: 'Sticky', swatch: c, icon: I.sticky, onSelect: () => a.look({ kind: 'sticky', color: c }) })),
    },
    {
      key: 'shapes', label: 'Shapes', shortcut: 'R', icon: I.shapes,
      children: [
        { key: 'rect', label: 'Rectangle', icon: I.rect, onSelect: () => a.look({ kind: 'rect', color: '#a8e6ff' }) },
        { key: 'ellipse', label: 'Ellipse', icon: I.ellipse, onSelect: () => a.look({ kind: 'ellipse', color: '#b9f5a8' }) },
        { key: 'diamond', label: 'Diamond', icon: I.diamond, onSelect: () => a.look({ kind: 'diamond', color: '#d9c2ff' }) },
      ],
    },
    {
      key: 'media', label: 'Media', shortcut: 'I', icon: I.media,
      children: [
        { key: 'image', label: 'Image', icon: I.image, onSelect: a.image },
        { key: 'file', label: 'Video/PDF', icon: I.file, onSelect: a.mediaFile },
      ],
    },
    // easy-mode D24 — frames are Advanced.
    ...(isEasyBoard(useBoardStore.getState().board) ? [] : [{ key: 'frame', label: 'Frame', shortcut: 'F', icon: I.frame, onSelect: a.frame }]),
    // Pen turns the pen on and opens the pen wheel right where you are.
    { key: 'pen', label: 'Pen', shortcut: 'P', icon: I.pen, onSelect: a.pen },
  ];
}
