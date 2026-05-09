import type { Node } from './node';
import type { Edge } from './edge';

export interface BoardViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface Board {
  version: 1;
  schemaVersion: 1;
  savedAt: string; // ISO 8601
  viewport: BoardViewport;
  nodes: Node[];
  edges: Edge[];
}
