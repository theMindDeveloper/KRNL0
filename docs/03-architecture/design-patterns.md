# krnl0 — Design Patterns Map

*Extracted from PRD v0.6.0 §6*

Every pattern used in the architecture, where it lives, and why.

---

## 6.1 Strategy + Provider

**Used for:** the Brain, STT, and TTS — anywhere we want one interface with multiple swappable implementations.

```typescript
// LAYER 2 — Brain
interface BrainProvider {
  ask(prompt: string, context: BrainContext): Promise<BrainReply>;
}

class ClaudeCodeProvider implements BrainProvider { /* spawns claude -p subprocess */ }
class ApiProvider           implements BrainProvider { /* HTTPS to Anthropic */ }
class OllamaProvider        implements BrainProvider { /* spawns ollama run */ }

// LAYER 1 — Voice I/O
interface SttProvider { transcribe(audio: Buffer): Promise<string>; }
interface TtsProvider { speak(text: string): Promise<void>; }

class WhisperProvider implements SttProvider { /* whisper.cpp subprocess */ }
class PiperProvider   implements TtsProvider { /* piper subprocess */ }
```

The rest of the app holds only the interfaces. Concrete classes are unknown to it.

---

## 6.2 Factory

**Used for:** producing the active Brain at startup based on user settings.

```typescript
class BrainFactory {
  static create(settings: BrainSettings): BrainProvider {
    switch (settings.kind) {
      case "claude-code": return new ClaudeCodeProvider(settings.cliPath);
      case "api":         return new ApiProvider(settings.apiKey);
      case "ollama":      return new OllamaProvider(settings.modelName);
    }
  }
}
```

Runs **once** at app startup. Per voice turn, the app calls `brain.ask()` on the already-constructed instance — the Factory does not run per turn.

---

## 6.3 Facade

**Used for:** `sys` CLI itself.

`sys` is one external command. Behind it: parse arguments → validate via Zod → locate node → dispatch command handler → mutate store → persist to disk → return result. Callers see one entry point.

```typescript
class SysFacade {
  async run(argv: string[]): Promise<SysResult> {
    const command = SysParser.parse(argv);
    const result  = await this.kernel.dispatch(command);
    await this.persistence.save(this.kernel.board);
    return result;
  }
}
```

Same surface reached by: GUI buttons, voice flow, Claude Code subprocess, user typing in terminal. Four callers, one facade.

---

## 6.4 Observer

**Used for:** detecting changes to `board.json` and notifying the canvas.

```typescript
class BoardWatcher {
  subscribe(listener: (board: Board) => void): Unsubscribe {
    return fs.watch(this.path, async () => {
      const board = await Persistence.load(this.path);
      listener(board);
    });
  }
}
```

The Canvas subscribes once at mount. Every time `sys` writes the file, the canvas re-renders. Zero polling. Zero manual state sync between `sys` and the UI.

A second use: Zustand's store subscriptions. UI components subscribe to slices. When a slice changes, only that component re-renders.

---

## 6.5 IBoundary (Renderer ↔ Main)

**Used for:** the seam between Electron's renderer process (UI) and main process (filesystem, subprocesses, OS access).

```typescript
interface IBoundary {
  loadBoard(): Promise<Board>;
  runSys(argv: string[]): Promise<SysResult>;
  askBrain(prompt: string): Promise<string>;
  startListening(): Promise<void>;
  stopListening(): Promise<string>;
  speak(text: string): Promise<void>;
}

class IpcBoundary  implements IBoundary { /* routes via Electron IPC */ }
class MockBoundary implements IBoundary { /* returns fixtures — used in tests */ }
```

The UI **never** imports from `electron`, `fs`, `child_process`, or any system module directly. It depends on `IBoundary`. This is what makes the UI testable without an OS.

---

## 6.6 Dependency Injection

**Used everywhere.** No class instantiates its dependencies — they are passed in.

```typescript
class VoiceTurn {
  constructor(
    private stt: SttProvider,
    private brain: BrainProvider,
    private tts: TtsProvider
  ) {}

  async run(audio: Buffer): Promise<void> {
    const text  = await this.stt.transcribe(audio);
    const reply = await this.brain.ask(text, this.gatherContext());
    await this.tts.speak(reply.text);
  }
}
```

`VoiceTurn` has zero dependency on Electron, Whisper, or Claude Code. Tested with three mocks, all unit-level.

**The correctness test for the architecture:** can the orchestrator be tested without spinning up real subprocesses? If yes, the seams are right.

---

## 6.7 Singleton

**Used for:** `board.json` (the file) and the in-memory `BoardStore` that mirrors it.

There is exactly one. Enforced by convention and by passing the same store reference everywhere via DI — not by static state.

---

## 6.8 Component isolation

Modules expose only their public interface. Internal helpers stay internal. No two-way imports between sibling modules. The dependency graph is strictly downward:

```
UI → IBoundary → main process services → providers → external systems
```

---

## 6.9 Mocking strategy

Three flavors:

| Flavor | What | When |
|---|---|---|
| Unit mocks | Implement `BrainProvider`, `SttProvider`, etc. with deterministic fakes | Jest/Vitest unit tests |
| `MockBoundary` | Full `IBoundary` with in-memory state | UI tests, Storybook |
| Integration | Real `sys` CLI, real `board.json` in temp dir, real file watcher. No Whisper/Claude Code | CI |

---

## 6.10 Shared pure-function helper extracted from selector

*Added by Decision 25 / ADR 0003.*

**Rule:** Selector modules in `src/renderer/store/*Selector.ts` MUST NOT import from each other (hard rule #2). When two selectors need the same non-trivial pure helper (e.g. a chain walker, a date-range expander), extract the helper to a separate module named `*Walker.ts` or `*Helper.ts` that **emits no memoized values and exposes no `select*` functions**. Both selectors import from the helper module. The non-cross-import rule is preserved because the helper is not a selector — it has no cache, no result type tied to the board store, and consumers are free to call it from anywhere.

**Threshold:** Duplicate the helper if it is < ~30 lines and has stable semantics (e.g. a trivial filter). Extract when it exceeds ~50 lines OR contains correctness-sensitive logic (graph walks, parser state machines, parallel-fork handling) where divergence between copies would silently produce different results.

**First instance:** `src/renderer/store/chainWalker.ts` (extracted from `timelineSelector.ts` by ADR 0003), imported by both `timelineSelector.ts` (Decision 24) and `scheduleSelector.ts` (Decision 25). Exports: `ChainEntry`, `buildChainIndex`, `WalkUnit`, `walkChain`.

**Forbidden:** a helper module that depends on Zustand store state, returns memoized references, or owns a module-level cache. Those properties make it a selector, and selectors do not import from selectors.
