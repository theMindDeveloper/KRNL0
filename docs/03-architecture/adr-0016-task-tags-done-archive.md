# ADR 0016 — Task tags, Done/Archive lifecycle, time by tag

**Status:** Accepted (2026-11-02)
**Requirements:** [docs/06-requirements/todo-node.md](../06-requirements/todo-node.md) F16–F25, NF5

## Context

Before this change, a ticked Todo item stayed in the list, struck through and sorted to the bottom, until "CLEAR DONE" deleted it and its task node. There was no record of *what kind* of work a completed task was. The only tag was a free-text, 4-character label that nothing read.

The user wants three things:

- Finished tasks should wait in a "Done" dropdown.
- At the end of the day they should move to an archive.
- Tasks should be tagged smartly (specific but not too specific) so analytics can show where the time goes, and users can add their own tags.

## Decision

1. **Buckets are derived from the clock, not stored.**
   - **Active:** not done.
   - **Done:** done, and completed today (local date).
   - **Archived:** done, and either completed on an earlier day or carrying `archivedAt`, which "Archive now" sets.

   `todoBuckets(state, nowMs)` is the single source. The existing 60 s tick re-buckets at midnight, so no scheduled job is needed. This also works when the app was closed overnight, and the CLI behaves the same way. Reopening an item clears `archivedAt`.
2. **Archive keeps task nodes.** Archiving only changes which dropdown an item shows in.
   - "Clear archive" (`todo.clearArchived`) deletes the archived rows and their task nodes, using the existing cascade.
   - The completion ledger (#169) is never touched, so analytics keeps the history.
   - `todo.clearDone` stays for scripts, but the UI no longer offers it.
3. **Tags.**
   - `TodoItem.tag` holds a tag id. Legacy free-text tags still display as their raw label.
   - `TodoItem.tagSource` is `'auto' | 'user'`. A tag with no `tagSource` counts as a hand tag.
   - **Built-in tags** are code constants (`src/shared/tags/taxonomy.ts`), 11 mid-level categories: Code, Study, Writing, Reading, Meetings, Admin, Planning, Health, Chores, Social, Creative.
   - **Custom tags** live on `TodoState.tagLibrary`. They are merged after the built-ins and can never shadow a built-in id.
4. **Classifier** (`src/shared/tags/classify.ts`). It is deterministic, local, and dependency-free. It deliberately does not call the brain/LLM, so it works offline, is unit-testable, and adds no demo-day risk.
   - **Scoring:** stemmed keyword hits count 1, and "strong" keywords count 2.
   - **Learned votes:** words from hand-tagged items vote for their tag, weighted by how exclusively a word belongs to one tag. A near-duplicate of an example (Jaccard ≥ 0.6) gets +3 × similarity.
   - **Threshold:** below a score of 1 the item stays untagged ("Other") rather than taking a guess.
   - **When it runs:** on add, on edit (auto tags only), on re-tag (it re-classifies other open auto-tagged items), and once on mount to backfill items from before tags existed. It never runs on render.
   - Done items are never re-filed.
5. **Ledger.**
   - `CompletionRecord.tag` is written at completion time by both the renderer (`syncCompletionLedger`) and the shared/CLI path (`syncCompletion`), through `completionTagFor`. It resolves the linked item's tag first, then the task's own tag, then a fresh classification.
   - Re-tagging a done item refreshes its entry.
   - Entries written before this change are classified from their text when analytics reads them, so no migration is needed.
6. **Analytics.** `computeTagBreakdown(board, range, nowMs)` (`src/renderer/analytics/tags.ts`) adds up the minutes of completed tasks per tag. A task's minutes are the pomo work tracked against it when there is any, and its plan otherwise. The AnalyticsNode **Time** view (donut, ranked list, daily stacked bars) and `sys analytics show --view tags` both use it.
7. **CLI parity** (hard rule 8):
   - `todo list [--done|--archived|--all]`
   - `todo tag <ref> <tag|auto>`
   - `todo tags [list|add|remove]`
   - `todo archive`
   - `todo clear-archive`

## Consequences

- One correction teaches the classifier immediately. Its history is the user's own hand-tagged items, and needs no extra storage.
- Over a very long time the archive can hold many items. "Clear archive" is the release valve. An automatic cap was left out on purpose, because dropping rows would leave orphaned task nodes.
- Classification quality is bounded by the keyword lists. Extending a list is a one-line change in `taxonomy.ts`.
