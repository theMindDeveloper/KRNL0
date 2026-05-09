import type { BrainProvider, BrainContext, BrainReply } from './BrainProvider';

export class ApiProvider implements BrainProvider {
  constructor(private apiKey: string) {}

  async ask(prompt: string, ctx: BrainContext): Promise<BrainReply> {
    const start = Date.now();
    // TODO (Week 5): POST to https://api.anthropic.com/v1/messages
    // - Build system prompt from CLAUDE.md + board snapshot
    // - Define tool schemas matching sys subcommands
    // - Execute returned tool_use calls via sys
    // - Return final text reply
    void ctx;
    return {
      text: `[ApiProvider] Not yet implemented. Prompt: ${prompt}`,
      durationMs: Date.now() - start,
    };
  }
}
