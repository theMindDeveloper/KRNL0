import { z } from 'zod';

export const NodeSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  position: z.object({ x: z.number(), y: z.number() }),
  state: z.unknown(),
  config: z.unknown(),
  isMother: z.boolean(),
  slot: z.number().optional(),
  canvasId: z.string().optional(),
});

export const EdgeSchema = z.object({
  id: z.string().min(1),
  from: z.object({ nodeId: z.string(), event: z.string() }),
  to: z.object({ nodeId: z.string(), command: z.string() }),
  args: z.record(z.unknown()).optional(),
  enabled: z.boolean(),
});

export const BoardViewportSchema = z.object({
  x: z.number(),
  y: z.number(),
  zoom: z.number().positive(),
});

// ADR 0008 § 4.1 — schemaVersion bumped to 2. The Zod schema validates boards
// that have already been migrated. Raw files on disk may arrive as version 1
// and are migrated by loadBoardFrom() before they reach this schema.
export const BoardSchema = z.object({
  version: z.literal(1),
  schemaVersion: z.literal(2),
  savedAt: z.string().datetime(),
  viewport: BoardViewportSchema,
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
  // ADR 0008 § 2.1: layout mode required after migration
  layoutMode: z.enum(['canvas', 'station']),
  // Decision 33 — free-content canvases
  canvases: z.array(z.object({ id: z.string().min(1), name: z.string() })).optional(),
  activeCanvasId: z.string().optional(),
  // Easy / Advanced UI mode; absent = advanced
  uiMode: z.enum(['easy', 'advanced']).optional(),
  // Align to grid (invisible snap grid): cards only, or everything; absent = off
  alignGrid: z.enum(['cards', 'all']).optional(),
  // ADR 0008 § 4.1: station geometry optional (persisted only after user resizes)
  layoutGeometry: z
    .object({
      station: z
        .object({
          rowFraction: z.number(),
          columnFractions: z.array(z.number()),
          rightColumnSplit: z.number(),
          canvasHidden: z.boolean().optional(),
          bottomFractions: z.record(z.number()).optional(),
        })
        .optional(),
    })
    .optional(),
});

export type BoardSchemaType = z.infer<typeof BoardSchema>;
