import { z } from 'zod';

export const NodeSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  position: z.object({ x: z.number(), y: z.number() }),
  state: z.unknown(),
  config: z.unknown(),
  isMother: z.boolean(),
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

export const BoardSchema = z.object({
  version: z.literal(1),
  schemaVersion: z.literal(1),
  savedAt: z.string().datetime(),
  viewport: BoardViewportSchema,
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
});

export type BoardSchemaType = z.infer<typeof BoardSchema>;
