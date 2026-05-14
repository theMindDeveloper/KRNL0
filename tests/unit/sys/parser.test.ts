import { describe, it, expect } from 'vitest';
import { SysParser } from '../../../src/sys/parser';

describe('SysParser', () => {
  describe('board commands', () => {
    it('parses board show', () => {
      expect(SysParser.parse(['board', 'show'])).toEqual({ kind: 'board', sub: 'show', json: false });
    });
    it('parses board show --json', () => {
      expect(SysParser.parse(['board', 'show', '--json'])).toEqual({ kind: 'board', sub: 'show', json: true });
    });
    it('parses board save with path', () => {
      expect(SysParser.parse(['board', 'save', '/tmp/board.json'])).toEqual({
        kind: 'board', sub: 'save', path: '/tmp/board.json',
      });
    });
    it('parses board load', () => {
      expect(SysParser.parse(['board', 'load', './board.json'])).toEqual({
        kind: 'board', sub: 'load', path: './board.json',
      });
    });
  });

  describe('pomo commands', () => {
    it('parses pomo start bare', () => {
      expect(SysParser.parse(['pomo', 'start'])).toEqual({
        kind: 'pomo', sub: 'start', label: undefined, minutes: undefined,
      });
    });
    it('parses pomo start with label and minutes', () => {
      expect(SysParser.parse(['pomo', 'start', '--label', 'thesis', '--minutes', '30'])).toEqual({
        kind: 'pomo', sub: 'start', label: 'thesis', minutes: 30,
      });
    });
    it('parses pomo stop', () => {
      expect(SysParser.parse(['pomo', 'stop'])).toEqual({ kind: 'pomo', sub: 'stop' });
    });
    it('parses pomo status', () => {
      expect(SysParser.parse(['pomo', 'status'])).toEqual({ kind: 'pomo', sub: 'status' });
    });
  });

  describe('todo commands', () => {
    it('parses todo add', () => {
      expect(SysParser.parse(['todo', 'add', 'call mom'])).toMatchObject({
        kind: 'todo', sub: 'add', text: 'call mom',
      });
    });
    it('parses todo add with tag', () => {
      expect(SysParser.parse(['todo', 'add', 'call mom', '--tag', 'life'])).toMatchObject({
        kind: 'todo', sub: 'add', text: 'call mom', tag: 'life',
      });
    });
    it('parses todo list', () => {
      expect(SysParser.parse(['todo', 'list'])).toEqual({ kind: 'todo', sub: 'list', json: false });
    });
    it('parses todo list --json', () => {
      expect(SysParser.parse(['todo', 'list', '--json'])).toEqual({ kind: 'todo', sub: 'list', json: true });
    });
    it('parses todo check', () => {
      expect(SysParser.parse(['todo', 'check', 'abc123'])).toMatchObject({
        kind: 'todo', sub: 'check', id: 'abc123',
      });
    });
  });

  describe('task commands', () => {
    it('parses task list', () => {
      expect(SysParser.parse(['task', 'list'])).toEqual({
        kind: 'task', sub: 'list', todoId: undefined, json: false,
      });
    });
    it('parses task list with todoId filter', () => {
      expect(SysParser.parse(['task', 'list', 'mother-todo'])).toEqual({
        kind: 'task', sub: 'list', todoId: 'mother-todo', json: false,
      });
    });
    it('parses task add with text', () => {
      expect(SysParser.parse(['task', 'add', 'write tests'])).toMatchObject({
        kind: 'task', sub: 'add', text: 'write tests', todoId: undefined, durationMin: undefined,
      });
    });
    it('parses task add with --todo and --duration flags', () => {
      expect(SysParser.parse(['task', 'add', 'write tests', '--todo', 'mother-todo', '--duration', '30'])).toMatchObject({
        kind: 'task', sub: 'add', text: 'write tests', todoId: 'mother-todo', durationMin: 30,
      });
    });
    it('parses task edit', () => {
      expect(SysParser.parse(['task', 'edit', 'task-id-1', 'new text'])).toEqual({
        kind: 'task', sub: 'edit', id: 'task-id-1', text: 'new text',
      });
    });
    it('parses task toggle', () => {
      expect(SysParser.parse(['task', 'toggle', 'task-id-1'])).toEqual({
        kind: 'task', sub: 'toggle', id: 'task-id-1',
      });
    });
    it('parses task delete', () => {
      expect(SysParser.parse(['task', 'delete', 'task-id-1'])).toEqual({
        kind: 'task', sub: 'delete', id: 'task-id-1',
      });
    });
    it('parses task pomo', () => {
      expect(SysParser.parse(['task', 'pomo', 'task-id-1'])).toEqual({
        kind: 'task', sub: 'pomo', id: 'task-id-1',
      });
    });
    it('parses task subtask', () => {
      expect(SysParser.parse(['task', 'subtask', 'task-id-1', 'sub item text'])).toEqual({
        kind: 'task', sub: 'subtask', parentId: 'task-id-1', text: 'sub item text',
      });
    });
    it('parses task duration', () => {
      expect(SysParser.parse(['task', 'duration', 'task-id-1', '45'])).toEqual({
        kind: 'task', sub: 'duration', id: 'task-id-1', minutes: 45,
      });
    });
    it('parses task sibling', () => {
      expect(SysParser.parse(['task', 'sibling', 'task-id-1'])).toEqual({
        kind: 'task', sub: 'sibling', id: 'task-id-1',
      });
    });
    it('parses task reset-pomo', () => {
      expect(SysParser.parse(['task', 'reset-pomo', 'task-id-1'])).toEqual({
        kind: 'task', sub: 'reset-pomo', id: 'task-id-1',
      });
    });
  });

  describe('habit commands', () => {
    it('parses habit add', () => {
      expect(SysParser.parse(['habit', 'add', 'meditation'])).toEqual({
        kind: 'habit', sub: 'add', name: 'meditation',
      });
    });
    it('parses habit done with date', () => {
      expect(SysParser.parse(['habit', 'done', 'meditation', '--date', '2026-05-09'])).toEqual({
        kind: 'habit', sub: 'done', name: 'meditation', date: '2026-05-09',
      });
    });
    it('parses habit streak', () => {
      expect(SysParser.parse(['habit', 'streak', 'meditation'])).toEqual({
        kind: 'habit', sub: 'streak', name: 'meditation',
      });
    });
    it('parses habit color', () => {
      expect(SysParser.parse(['habit', 'color', 'meditation', 'rust'])).toEqual({
        kind: 'habit', sub: 'color', name: 'meditation', color: 'rust',
      });
    });
    it('parses habit remove', () => {
      expect(SysParser.parse(['habit', 'remove', 'meditation'])).toEqual({
        kind: 'habit', sub: 'remove', name: 'meditation',
      });
    });
    it('parses habit view', () => {
      expect(SysParser.parse(['habit', 'view', 'month'])).toEqual({
        kind: 'habit', sub: 'view', view: 'month',
      });
    });
    it('parses habit list', () => {
      expect(SysParser.parse(['habit', 'list'])).toEqual({
        kind: 'habit', sub: 'list', json: false,
      });
    });
  });

  describe('edge commands', () => {
    it('parses edge add', () => {
      expect(SysParser.parse(['edge', 'add', '--from', 'pomo:onComplete', '--to', 'habit:markDone'])).toMatchObject({
        kind: 'edge', sub: 'add', from: 'pomo:onComplete', to: 'habit:markDone',
      });
    });
    it('parses edge list', () => {
      expect(SysParser.parse(['edge', 'list'])).toEqual({ kind: 'edge', sub: 'list', json: false });
    });
    it('parses edge remove', () => {
      expect(SysParser.parse(['edge', 'remove', 'edge-id-001'])).toMatchObject({
        kind: 'edge', sub: 'remove', id: 'edge-id-001',
      });
    });
  });

  describe('special commands', () => {
    it('parses say', () => {
      expect(SysParser.parse(['say', 'hello world'])).toMatchObject({ kind: 'say', text: 'hello world' });
    });
    it('parses hear', () => {
      expect(SysParser.parse(['hear'])).toEqual({ kind: 'hear' });
    });
    it('returns help for empty input', () => {
      expect(SysParser.parse([])).toEqual({ kind: 'help' });
    });
    it('returns null for unknown command', () => {
      expect(SysParser.parse(['unknowncmd', 'foo'])).toBeNull();
    });
  });
});
