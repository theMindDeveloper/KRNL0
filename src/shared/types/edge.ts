export interface Edge {
  id: string;
  from: { nodeId: string; event: string };
  to:   { nodeId: string; command: string };
  args?: Record<string, unknown>;
  enabled: boolean;
  visual?: 'default' | 'task-flow' | 'pomo-edge';
}
