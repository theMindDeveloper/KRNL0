// "Open this note for editing" — fired by the canvas when Enter / F2 is
// pressed with exactly one note selected (clicked, not Tab-focused).

export const TEXT_EDIT_EVENT = 'krnl:text:edit';

export function requestTextEdit(nodeId: string): void {
  window.dispatchEvent(new CustomEvent<{ nodeId: string }>(TEXT_EDIT_EVENT, { detail: { nodeId } }));
}
