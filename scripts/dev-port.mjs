import { createHash } from 'node:crypto';

/**
 * Returns a deterministic Vite dev-server port for the given worktree root.
 *
 * Range: [5174, 5273]. Port 5173 is reserved as the no-isolation default so
 * that a single worktree running without this script still works out-of-the-box.
 *
 * Using the absolute path (not basename) prevents two worktrees that happen
 * to share the same directory name under different parents from colliding.
 *
 * @param {string} rootPath - absolute path of the worktree root (process.cwd())
 * @returns {number}
 */
export function portFor(rootPath) {
  const h = createHash('sha1').update(rootPath).digest();
  return 5174 + (h.readUInt16BE(0) % 100);
}
