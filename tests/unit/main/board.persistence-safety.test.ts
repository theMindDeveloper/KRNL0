/**
 * Persistence safety — a corrupt or half-written board.json must never be
 * silently replaced, and saves must be atomic (temp file + rename).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync, existsSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadBoardFrom, saveBoardTo, RendererRevGuard } from '../../../src/main/persistence/board';

let tmpDir = '';
let boardPath = '';

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'krnl-persist-'));
  boardPath = join(tmpDir, 'board.json');
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('board persistence safety', () => {
  it('backs up an unparseable board.json before falling back to the seed', () => {
    writeFileSync(boardPath, '{"nodes": [ {"id": "mine"', 'utf-8');
    const loaded = loadBoardFrom(boardPath) as { nodes: Array<{ id: string }> };
    expect(loaded.nodes.some((n) => n.id === 'mother-pomo')).toBe(true);
    const backups = readdirSync(tmpDir).filter((f) => f.startsWith('board.json.corrupt-'));
    expect(backups).toHaveLength(1);
    expect(readFileSync(join(tmpDir, backups[0]!), 'utf-8')).toBe('{"nodes": [ {"id": "mine"');
  });

  it('does not create a backup when the file simply does not exist', () => {
    loadBoardFrom(boardPath);
    expect(readdirSync(tmpDir)).toHaveLength(0);
  });

  it('saves atomically and leaves no temp file behind', () => {
    saveBoardTo(boardPath, { nodes: [], edges: [] });
    expect(JSON.parse(readFileSync(boardPath, 'utf-8'))).toEqual({ nodes: [], edges: [] });
    expect(readdirSync(tmpDir)).toEqual(['board.json']);
  });

  it('overwrites an existing board via save', () => {
    saveBoardTo(boardPath, { nodes: [{ id: 'a' }], edges: [] });
    saveBoardTo(boardPath, { nodes: [{ id: 'b' }], edges: [] });
    expect(JSON.parse(readFileSync(boardPath, 'utf-8')).nodes[0].id).toBe('b');
    expect(existsSync(`${boardPath}.tmp`)).toBe(false);
  });
});

describe('RendererRevGuard — lost-update protection', () => {
  it('is not stale right after the renderer synced', () => {
    saveBoardTo(boardPath, { nodes: [], edges: [] });
    const guard = new RendererRevGuard(boardPath);
    guard.sync();
    expect(guard.isStale()).toBe(false);
  });

  it('becomes stale when another writer changes board.json', () => {
    saveBoardTo(boardPath, { nodes: [], edges: [] });
    const guard = new RendererRevGuard(boardPath);
    guard.sync();
    saveBoardTo(boardPath, { nodes: [{ id: 'from-cli' }], edges: [] });
    const later = new Date(Date.now() + 5_000);
    utimesSync(boardPath, later, later); // guarantee a distinct mtime
    expect(guard.isStale()).toBe(true);
    guard.sync();
    expect(guard.isStale()).toBe(false);
  });

  it('is never stale before the first sync (fresh app, no board yet)', () => {
    expect(new RendererRevGuard(boardPath).isStale()).toBe(false);
  });
});
