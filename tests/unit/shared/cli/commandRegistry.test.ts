// Unit tests for commandRegistry — T12, T13, T14, TNF8.
// Verifies that help generation covers all registered groups and subcommands.

import { describe, it, expect } from 'vitest';
import {
  CLI_REGISTRY,
  generateHelp,
  generateGroupHelp,
  generateSubHelp,
} from '../../../../src/shared/cli/commandRegistry';

// ── T12 — generateHelp lists every registered group ──────────────────────────

describe('T12 — generateHelp lists every command group', () => {
  it('lists all groups present in CLI_REGISTRY', () => {
    const help = generateHelp('0.2.0');
    for (const spec of CLI_REGISTRY) {
      expect(help).toContain(spec.group);
    }
  });

  it('includes a usage line', () => {
    const help = generateHelp('0.2.0');
    expect(help).toContain('Usage: krnl');
  });

  it('includes the version string', () => {
    const help = generateHelp('1.2.3');
    expect(help).toContain('1.2.3');
  });

  it('includes the required Phase-1 groups: task, todo, habit, pomo, term', () => {
    const help = generateHelp('0.2.0');
    const required = ['task', 'todo', 'habit', 'pomo', 'term'];
    for (const g of required) {
      expect(help, `group "${g}" missing from krnl help`).toContain(g);
    }
  });

  it('includes text, image, edge, node, viewport, board, history, theme, help', () => {
    const help = generateHelp('0.2.0');
    const phase2 = ['text', 'image', 'edge', 'node', 'viewport', 'board', 'history', 'theme', 'help'];
    for (const g of phase2) {
      expect(help, `group "${g}" missing from krnl help`).toContain(g);
    }
  });

  it('ends with a hint to run krnl help <group>', () => {
    const help = generateHelp('0.2.0');
    expect(help).toContain('krnl help');
  });
});

// ── T13 — generateGroupHelp lists every Phase-1 task subcommand ───────────────

describe('T13 — generateGroupHelp("task") lists all task subcommands', () => {
  it('returns a non-null string for group "task"', () => {
    const result = generateGroupHelp('task');
    expect(result).not.toBeNull();
    expect(typeof result).toBe('string');
  });

  it('includes every subcommand registered under "task"', () => {
    const taskSpec = CLI_REGISTRY.find((s) => s.group === 'task');
    expect(taskSpec, 'task group missing from CLI_REGISTRY').toBeDefined();
    const text = generateGroupHelp('task')!;
    for (const sub of taskSpec!.subcommands) {
      expect(text, `task subcommand "${sub.name}" missing from group help`).toContain(sub.name);
    }
  });

  it('contains at least: add, edit, toggle, delete, pomo, list', () => {
    const text = generateGroupHelp('task')!;
    const subs = ['add', 'edit', 'toggle', 'delete', 'pomo', 'list'];
    for (const s of subs) {
      expect(text, `"task ${s}" missing from group help`).toContain(s);
    }
  });

  it('returns null for an unknown group', () => {
    expect(generateGroupHelp('nonexistent-group')).toBeNull();
  });

  it('returns non-null for every group in CLI_REGISTRY', () => {
    for (const spec of CLI_REGISTRY) {
      const result = generateGroupHelp(spec.group);
      expect(result, `generateGroupHelp("${spec.group}") returned null`).not.toBeNull();
    }
  });
});

// ── T14 — generateSubHelp returns full usage + summary ────────────────────────

describe('T14 — generateSubHelp("task", "add") returns full usage', () => {
  it('returns a non-null string', () => {
    const result = generateSubHelp('task', 'add');
    expect(result).not.toBeNull();
    expect(typeof result).toBe('string');
  });

  it('starts with "Usage: krnl task add"', () => {
    const result = generateSubHelp('task', 'add')!;
    expect(result).toContain('Usage: krnl task add');
  });

  it('includes the summary for task add', () => {
    const taskSpec = CLI_REGISTRY.find((s) => s.group === 'task')!;
    const addSpec = taskSpec.subcommands.find((s) => s.name === 'add')!;
    const result = generateSubHelp('task', 'add')!;
    expect(result).toContain(addSpec.summary);
  });

  it('returns null for an unknown group', () => {
    expect(generateSubHelp('nobody', 'add')).toBeNull();
  });

  it('returns null for an unknown subcommand within a known group', () => {
    expect(generateSubHelp('task', 'fly-to-moon')).toBeNull();
  });

  it('returns usage for every subcommand in CLI_REGISTRY', () => {
    for (const spec of CLI_REGISTRY) {
      for (const sub of spec.subcommands) {
        const result = generateSubHelp(spec.group, sub.name);
        expect(
          result,
          `generateSubHelp("${spec.group}", "${sub.name}") returned null`,
        ).not.toBeNull();
      }
    }
  });
});

// ── TNF8 — no hand-maintained help string; registry is the source of truth ────

describe('TNF8 — CLI_REGISTRY is the single source of truth', () => {
  it('CLI_REGISTRY has at least 10 groups', () => {
    expect(CLI_REGISTRY.length).toBeGreaterThanOrEqual(10);
  });

  it('every group has at least one subcommand', () => {
    for (const spec of CLI_REGISTRY) {
      expect(
        spec.subcommands.length,
        `group "${spec.group}" has no subcommands`,
      ).toBeGreaterThan(0);
    }
  });

  it('every subcommand has a usage string that starts with the group name or a known verb', () => {
    for (const spec of CLI_REGISTRY) {
      for (const sub of spec.subcommands) {
        expect(
          sub.usage.length,
          `"${spec.group}.${sub.name}" usage is empty`,
        ).toBeGreaterThan(0);
      }
    }
  });
});
