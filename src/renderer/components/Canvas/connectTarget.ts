// Easier wiring: which node is under the pointer when a connection is dropped.

/** Id of the canvas node under a screen point (the dropped-on node). Exported for tests. */
export function targetNodeIdAt(x: number, y: number): string | null {
  if (typeof document === 'undefined' || !document.elementsFromPoint) return null;
  for (const el of document.elementsFromPoint(x, y)) {
    const node = (el as HTMLElement).closest?.('.react-flow__node') as HTMLElement | null;
    if (node?.dataset.id) return node.dataset.id;
  }
  return null;
}
