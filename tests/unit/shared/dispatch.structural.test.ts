// TNF4 structural test — cascade code path parity.
//
// Requirement: "Cascade logic invoked from `krnl` is the same code path as
// the renderer's commandDispatch (shared module at src/shared/dispatch/)."
//
// This test asserts that BOTH the renderer commandDispatch and the sys task
// commands delegate task-cascade to the shared deleteTaskCascade function
// at src/shared/dispatch/task.ts — NOT duplicate-local implementations.
//
// IMPLEMENTATION NOTE (2026-05-14):
//   src/renderer/components/Canvas/commandDispatch.ts currently contains its
//   OWN local collectDescendants() (line ~264) and deleteTaskNodesCascade()
//   (line ~335), and does NOT import from src/shared/dispatch/task.ts.
//   src/sys/commands/task.ts DOES import deleteTaskCascade from the shared
//   module. This means TNF4 is NOT satisfied for the renderer path.
//
//   The test below will FAIL until commandDispatch.ts is refactored to
//   import deleteTaskCascade from src/shared/dispatch/task.ts and remove its
//   own local duplicate. This is an intentional blocker — do not merge until
//   backend-dev fixes commandDispatch.ts.

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// __dirname = tests/unit/shared/
// ../../../src → terminal-finish/src
const ROOT = path.resolve(__dirname, '../../../src');

const SHARED_CASCADE_PATH = path.join(ROOT, 'shared', 'dispatch', 'task.ts');
const RENDERER_DISPATCH_PATH = path.join(ROOT, 'renderer', 'components', 'Canvas', 'commandDispatch.ts');
const SYS_TASK_PATH = path.join(ROOT, 'sys', 'commands', 'task.ts');

function readSource(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8');
}

describe('TNF4 — shared cascade code path', () => {
  it('shared/dispatch/task.ts exports deleteTaskCascade', () => {
    const src = readSource(SHARED_CASCADE_PATH);
    expect(src, 'deleteTaskCascade must be exported from shared/dispatch/task.ts').toContain(
      'export function deleteTaskCascade',
    );
  });

  it('sys/commands/task.ts imports deleteTaskCascade from the shared module', () => {
    const src = readSource(SYS_TASK_PATH);
    // Must import from ../../shared/dispatch/task (or similar relative path resolving there)
    expect(
      src,
      'sys/commands/task.ts must import deleteTaskCascade from shared/dispatch/task',
    ).toMatch(/import[^;]+deleteTaskCascade[^;]+shared\/dispatch\/task/);
  });

  it('renderer commandDispatch.ts imports deleteTaskCascade from the shared module (TNF4)', () => {
    const src = readSource(RENDERER_DISPATCH_PATH);
    // This assertion CURRENTLY FAILS because commandDispatch.ts has a local
    // deleteTaskNodesCascade instead of importing the shared one.
    // Fix: commandDispatch.ts should import { deleteTaskCascade } from '../../../shared/dispatch/task'
    // and delegate its deleteTaskNodesCascade wrapper to it.
    expect(
      src,
      [
        'BLOCKER (TNF4): renderer/commandDispatch.ts does NOT import deleteTaskCascade',
        'from src/shared/dispatch/task.ts — it has a duplicate-local implementation.',
        'This means krnl task delete and UI task.delete take DIFFERENT code paths,',
        'violating the shared-dispatch invariant. Fix commandDispatch.ts before merging.',
      ].join(' '),
    ).toMatch(/import[^;]+deleteTaskCascade[^;]+shared\/dispatch\/task/);
  });

  it('renderer commandDispatch.ts does NOT define its own collectDescendants (must use shared)', () => {
    const src = readSource(RENDERER_DISPATCH_PATH);
    // A local re-definition of collectDescendants is the smoking gun for the duplicate path.
    // Search for a function definition of collectDescendants in commandDispatch.ts.
    const hasLocalImpl = /function\s+collectDescendants\s*\(/.test(src);
    expect(
      hasLocalImpl,
      [
        'BLOCKER (TNF4): renderer/commandDispatch.ts defines its own collectDescendants().',
        'This must be removed; import the shared version from src/shared/dispatch/task.ts.',
      ].join(' '),
    ).toBe(false);
  });

  it('renderer commandDispatch.ts does NOT define its own deleteTaskNodesCascade duplicate', () => {
    const src = readSource(RENDERER_DISPATCH_PATH);
    // Local deleteTaskNodesCascade that doesn't delegate to shared module is the duplication.
    // After the fix, commandDispatch.ts may keep a thin wrapper but it must call deleteTaskCascade.
    // Here we check that if deleteTaskNodesCascade exists, it imports from shared.
    const hasLocalCascade = /function\s+deleteTaskNodesCascade\s*\(/.test(src);
    if (hasLocalCascade) {
      // If it exists, it MUST use deleteTaskCascade from the shared module
      expect(
        src,
        [
          'BLOCKER (TNF4): commandDispatch.ts has deleteTaskNodesCascade but does not',
          'import or call deleteTaskCascade from src/shared/dispatch/task.ts.',
        ].join(' '),
      ).toContain('deleteTaskCascade');
    }
    // If the function doesn't exist at all, that's also acceptable (shared used directly).
    expect(true).toBe(true);
  });
});
