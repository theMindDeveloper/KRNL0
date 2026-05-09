import type { BrainProvider, BrainSettings } from './BrainProvider';
import { ClaudeCodeProvider } from './ClaudeCodeProvider';
import { ApiProvider } from './ApiProvider';
import { OllamaProvider } from './OllamaProvider';

export class BrainFactory {
  static create(settings: BrainSettings): BrainProvider {
    switch (settings.kind) {
      case 'claude-code':
        return new ClaudeCodeProvider(settings.cliPath ?? 'claude');
      case 'api':
        return new ApiProvider(settings.apiKey ?? '');
      case 'ollama':
        return new OllamaProvider(settings.modelName ?? 'gemma2:2b');
    }
  }
}
