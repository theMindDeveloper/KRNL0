/**
 * useCliDispatch — Phase 2 CLI bridge.
 *
 * Listens for cli:dispatch:request from main, processes renderer-coupled
 * commands (viewport/undo/redo/theme/marquee/node.move), and sends back
 * cli:dispatch:reply with the result.
 *
 * Only handles commands that require the Zustand store. Board-only mutations
 * are handled by SysFacade in main (via board.json direct writes + board:changed).
 */

import { useEffect } from 'react';
import { useBoardStore } from './boardStore';
import { emit, saveBoard } from './eventLog';
import { deleteTaskNodesCascade } from '../components/Canvas/commandDispatch';
import { sfxEngine } from '../sfx/sfxEngine';
import type { Board } from '../../shared/types';
import type { Node } from '../../shared/types';

export function useCliDispatch(): void {
  const store = useBoardStore;

  useEffect(() => {
    const bridge = window.krnl;
    if (!bridge?.onCliDispatch || !bridge?.cliDispatchReply) return;

    const unsubscribe = bridge.onCliDispatch((id, command, args) => {
      let ok = false;
      let message = `Unknown cli:dispatch command: ${command}`;

      try {
        switch (command) {
          case 'viewport.pan': {
            const { dx, dy } = args as { dx: number; dy: number };
            const { viewport } = store.getState();
            store.getState().setViewport({ ...viewport, x: viewport.x + dx, y: viewport.y + dy });
            ok = true;
            message = `Panned by dx=${dx} dy=${dy}`;
            break;
          }

          case 'viewport.zoom': {
            const { factor } = args as { factor: number };
            const { viewport } = store.getState();
            store.getState().setViewport({ ...viewport, zoom: viewport.zoom * factor });
            ok = true;
            message = `Zoomed by factor=${factor}`;
            break;
          }

          case 'undo': {
            store.getState().undo();
            ok = true;
            message = 'Undo applied';
            break;
          }

          case 'redo': {
            store.getState().redo();
            ok = true;
            message = 'Redo applied';
            break;
          }

          case 'theme.set': {
            const { value } = args as { value: string };
            if (value === 'light' || value === 'dark') {
              store.getState().setTheme(value);
              try {
                localStorage.setItem('krnl0-theme', value);
                document.documentElement.setAttribute('data-theme', value);
              } catch { /* ignore */ }
              ok = true;
              message = `Theme set to ${value}`;
            } else {
              message = `Invalid theme: ${value}`;
            }
            break;
          }

          case 'node.move': {
            const { id, x, y } = args as { id: string; x: number; y: number };
            const { board, updateNode } = store.getState();
            if (!board) { message = 'No board loaded'; break; }
            const node = board.nodes.find((n) => n.id === id);
            if (!node) { message = `No node with id "${id}"`; break; }
            updateNode(id, { position: { x, y } } as Partial<Node>);
            const updated = store.getState().board;
            if (updated) void saveBoard(updated);
            ok = true;
            message = `Node ${id.slice(0, 8)} moved to (${x}, ${y})`;
            break;
          }

          case 'marquee.delete': {
            const { x1, y1, x2, y2 } = args as { x1: number; y1: number; x2: number; y2: number };
            const { board } = store.getState();
            if (!board) { message = 'No board loaded'; break; }

            // Find task nodes in the rect
            const minX = Math.min(x1, x2);
            const maxX = Math.max(x1, x2);
            const minY = Math.min(y1, y2);
            const maxY = Math.max(y1, y2);

            const taskIds = board.nodes
              .filter((n) => {
                if (n.kind !== 'todo.task') return false;
                const px = n.position.x;
                const py = n.position.y;
                return px >= minX && px <= maxX && py >= minY && py <= maxY;
              })
              .map((n) => n.id);

            if (taskIds.length > 0) {
              deleteTaskNodesCascade(taskIds);
              const updated = store.getState().board as Board | null;
              if (updated) void saveBoard(updated);
            }
            ok = true;
            message = `Marquee deleted ${taskIds.length} task(s)`;
            break;
          }

          case 'sfx.play': {
            const { clipId } = args as { clipId: string };
            sfxEngine.play(clipId).catch(() => {/* ignore playback errors in CLI path */});
            ok = true;
            message = `Playing SFX: ${clipId}`;
            break;
          }

          case 'sfx.stop': {
            sfxEngine.stop();
            ok = true;
            message = 'SFX stopped';
            break;
          }

          case 'sfx.list': {
            const clips = sfxEngine.clips();
            ok = true;
            message = clips.length > 0 ? clips.join('\n') : '(no sfx clips registered)';
            break;
          }

          default:
            // Unknown command
            break;
        }
      } catch (err) {
        ok = false;
        message = err instanceof Error ? err.message : String(err);
      }

      if (ok) {
        emit('sys.cmd', `cli: ${command}`, { severity: 'info' });
      } else {
        emit('sys.error', `cli ${command} failed: ${message}`, { severity: 'err' });
      }

      bridge.cliDispatchReply!(id, ok, message);
    });

    return unsubscribe;
  }, [store]);
}
