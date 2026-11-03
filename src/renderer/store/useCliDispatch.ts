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
import { deleteTaskNodesCascade, makeCommandHandler } from '../components/Canvas/commandDispatch';
import { resolveNodeRef } from '../../shared/dispatch/resolveRef';
import { activeCanvasOf, isOnCanvas } from '../../shared/canvas';
import type { BoardShape } from '../../shared/dispatch/types';
import { TERM_CLEAR_EVENT, TERM_FONT_MIN, TERM_FONT_MAX } from '../components/nodes/TerminalNode/constants';
import { sfxEngine } from '../sfx/sfxEngine';
import { useEventLog } from './eventLog/store';
import type { Board } from '../../shared/types';
import type { Node } from '../../shared/types';
import type { HabitLaneState } from '../components/nodes/HabitLaneNode/types';
import type { TaskState } from '../components/nodes/TaskNode/types';
import { getDockStyle, setDockStyle } from '../components/ChassisLayer/useDockStyle';
import { isFrameStyleId } from '../../shared/frameStyles';
import { radioControl } from '../components/AmbientRadio/radioControl';

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

          // Undo / redo persist like the keyboard shortcut does; otherwise the
          // next CLI write (which reads board.json) brings the change back.
          case 'undo': {
            if (store.getState().history.length === 0) { ok = true; message = 'Nothing to undo'; break; }
            store.getState().undo();
            const undone = store.getState().board;
            if (undone) void saveBoard(undone);
            ok = true;
            message = 'Undo applied';
            break;
          }

          case 'redo': {
            if (store.getState().future.length === 0) { ok = true; message = 'Nothing to redo'; break; }
            store.getState().redo();
            const redone = store.getState().board;
            if (redone) void saveBoard(redone);
            ok = true;
            message = 'Redo applied';
            break;
          }

          case 'term.setShell': {
            const termNode = store.getState().board?.nodes.find((n) => n.kind === 'term');
            if (!termNode) { message = 'No terminal on the board'; break; }
            const shell = typeof args['shell'] === 'string' ? args['shell'].trim() : '';
            if (!shell) { message = 'term setShell requires <shell> (e.g. pwsh.exe, /bin/bash, or default)'; break; }
            makeCommandHandler(termNode.id)('term.setShell', { shell });
            ok = true;
            message = `Terminal shell set to ${shell} — used for the next shell (type exit, then Enter)`;
            break;
          }

          case 'term.setTitle':
          case 'term.setFontSize':
          case 'term.clear': {
            const { board } = store.getState();
            const termNode = board?.nodes.find((n) => n.kind === 'term');
            if (!termNode) { message = 'No terminal on the board'; break; }
            if (command === 'term.clear') {
              window.dispatchEvent(new CustomEvent(TERM_CLEAR_EVENT, { detail: { nodeId: termNode.id } }));
              ok = true;
              message = 'Terminal cleared';
              break;
            }
            if (command === 'term.setTitle') {
              const title = typeof args['title'] === 'string' ? args['title'].trim() : '';
              if (!title) { message = 'term setTitle requires "<title>"'; break; }
              makeCommandHandler(termNode.id)('term.setTitle', { title });
              ok = true;
              message = `Terminal title set to "${title}"`;
              break;
            }
            const size = args['fontSize'];
            if (typeof size !== 'number' || !Number.isFinite(size) || size < TERM_FONT_MIN || size > TERM_FONT_MAX) {
              message = `term setFontSize requires a number from ${TERM_FONT_MIN} to ${TERM_FONT_MAX}`;
              break;
            }
            makeCommandHandler(termNode.id)('term.setFontSize', { fontSize: size });
            ok = true;
            message = `Terminal font size set to ${size}`;
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

          // ADR 0009 — frame styles
          case 'theme.frame': {
            const { value } = args as { value: string };
            if (isFrameStyleId(value)) {
              setDockStyle(value);
              ok = true;
              message = `Frame style set to ${value}`;
            } else {
              message = `Unknown frame style: ${value}`;
            }
            break;
          }

          case 'theme.get': {
            ok = true;
            message = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
            break;
          }

          case 'theme.frame.get': {
            ok = true;
            message = getDockStyle();
            break;
          }

          case 'node.move': {
            const { id, x, y } = args as { id: string; x: number; y: number };
            const { board, updateNode } = store.getState();
            if (!board) { message = 'No board loaded'; break; }
            // Same ref rule as every other command: id, ≥4-char prefix, or unique text.
            const ref = resolveNodeRef(board as unknown as BoardShape, id);
            if (!ref.ok) {
              message = ref.reason === 'ambiguous'
                ? `"${id}" matches several nodes: ${(ref.matches ?? []).map((m) => m.slice(0, 12)).join(', ')}`
                : `No node matching "${id}"`;
              break;
            }
            const node = board.nodes.find((n) => n.id === ref.id);
            if (!node) { message = `No node matching "${id}"`; break; }
            // Mother nodes are fixed-position (AGENTS.md hard rule 6).
            if (node.isMother) { message = `${node.kind} is a fixed window and can't be moved`; break; }
            updateNode(node.id, { position: { x, y } } as Partial<Node>);
            const updated = store.getState().board;
            if (updated) void saveBoard(updated);
            ok = true;
            message = `Node ${node.id.slice(0, 8)} moved to (${x}, ${y})`;
            break;
          }

          case 'marquee.delete': {
            const { x1, y1, x2, y2 } = args as { x1: number; y1: number; x2: number; y2: number };
            const { board } = store.getState();
            if (!board) { message = 'No board loaded'; break; }

            // Every node on the current canvas whose top-left corner is in the
            // rect, as the help says — except the fixed mother windows.
            const minX = Math.min(x1, x2);
            const maxX = Math.max(x1, x2);
            const minY = Math.min(y1, y2);
            const maxY = Math.max(y1, y2);
            const canvasId = activeCanvasOf(board);
            const inside = board.nodes.filter((n) => {
              if (n.isMother || !isOnCanvas(n, canvasId)) return false;
              const { x, y } = n.position;
              return x >= minX && x <= maxX && y >= minY && y <= maxY;
            });
            const taskIds = inside.filter((n) => n.kind === 'todo.task').map((n) => n.id);
            const otherIds = inside.filter((n) => n.kind !== 'todo.task').map((n) => n.id);

            if (taskIds.length > 0) deleteTaskNodesCascade(taskIds);
            for (const id of otherIds) store.getState().removeNode(id);
            if (inside.length > 0) {
              const updated = store.getState().board as Board | null;
              if (updated) void saveBoard(updated);
            }
            ok = true;
            message = `Marquee deleted ${inside.length} node(s) (${taskIds.length} task(s))`;
            break;
          }

          case 'radio.list':
          case 'radio.status':
          case 'radio.play':
          case 'radio.remove':
          case 'radio.stop':
          case 'radio.volume': {
            const radio = radioControl();
            if (!radio) { message = 'The Ambient Radio is not open in this window'; break; }
            const ids = radio.presets().map((p) => p.id).filter((id) => id !== 'yt');
            const preset = (args as { preset?: string }).preset?.toLowerCase();
            if (preset !== undefined && preset === 'yt') { message = 'YouTube needs a link: paste it into the radio'; break; }
            if (preset !== undefined && !ids.includes(preset)) { message = `Unknown preset "${preset}" (${ids.join(', ')})`; break; }
            if (command === 'radio.play') radio.play(preset);
            if (command === 'radio.remove' && preset !== undefined) radio.remove(preset);
            if (command === 'radio.stop') radio.stop();
            if (command === 'radio.volume') radio.setVolume((args as { volume: number }).volume);
            if (command === 'radio.list') {
              ok = true;
              message = radio.presets().filter((p) => p.id !== 'yt').map((p) => `${p.id.padEnd(6)} ${p.sub}`).join('\n');
              break;
            }
            // Report what the panel will show once React applies the change.
            const s = radio.status();
            const playing = command === 'radio.play' ? true : command === 'radio.stop' ? false : s.playing;
            const layers = new Set(s.layers);
            if (command === 'radio.play' && preset) layers.add(preset);
            if (command === 'radio.play' && !preset && layers.size === 0) layers.add(s.focused);
            if (command === 'radio.remove' && preset) layers.delete(preset);
            const volume = command === 'radio.volume' ? Math.round((args as { volume: number }).volume) : s.volume;
            ok = true;
            message = `radio: ${playing && layers.size > 0 ? 'playing' : 'paused'} · ${layers.size > 0 ? [...layers].join(' + ') : 'no layers'} · volume ${volume}`;
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

          // ── Decision 29 — task.setNote (no EventKind — no emit) ──────────
          case 'task.setNote': {
            const { ref, text, clear } = args as { ref?: string; text?: string; clear?: boolean };
            const { board: currentBoard } = store.getState();
            if (!currentBoard) { message = 'No board loaded'; break; }
            const taskNode = currentBoard.nodes.find((n) => {
              if (n.kind !== 'todo.task') return false;
              return n.id === ref || (typeof ref === 'string' && ref.length >= 4 && n.id.startsWith(ref));
            });
            if (!taskNode) { message = `No task node matching "${ref ?? ''}"` ; break; }
            const ts = taskNode.state as TaskState;
            let nextState: TaskState;
            if (clear) {
              const { note: _, ...rest } = ts;
              void _;
              nextState = rest as TaskState;
            } else {
              const trimmed = (text ?? '').trim();
              if (trimmed === '') {
                const { note: _, ...rest } = ts;
                void _;
                nextState = rest as TaskState;
              } else {
                nextState = { ...ts, note: trimmed };
              }
            }
            store.getState().updateNode(taskNode.id, { state: nextState } as Partial<Node>);
            const updated = store.getState().board;
            if (updated) void saveBoard(updated);
            ok = true;
            message = `Task ${taskNode.id.slice(0, 8)} note ${clear || !nextState.note ? 'cleared' : 'set'}`;
            break;
          }

          // ── Decision 29 — habit.spawnLane (cli:dispatch route for `habit pin`) ─
          case 'habit.spawnLane': {
            const { habitId } = args as { habitId?: string };
            if (!habitId || typeof habitId !== 'string') { message = 'habit.spawnLane requires habitId'; break; }
            const { board: currentBoard, addNode } = store.getState();
            if (!currentBoard) { message = 'No board loaded'; break; }
            const habitMother = currentBoard.nodes.find((n) => n.kind === 'habit' && n.isMother === true);
            if (!habitMother) { message = 'No habit mother node found'; break; }
            // Check for duplicate
            const existing = currentBoard.nodes.find(
              (n) => n.kind === 'habit.lane' && (n.state as HabitLaneState | null)?.habitId === habitId,
            );
            if (existing) {
              ok = true;
              message = `habit already pinned (lane ${existing.id.slice(0, 13)})`;
              break;
            }
            const laneCount = currentBoard.nodes.filter((n) => n.kind === 'habit.lane').length;
            // HABIT_LANE_OFFSET_Y must mirror src/sys/layout.ts. Bumped from
            // the old inline 540 (which collided with the task-chain band
            // starting at MOTHER_OFFSET_Y = 760, plus parallel-fork sprawl
            // down to ~1200) so habit lanes land in their own band below
            // the deepest realistic task chain. User report 2026-05-17 r2.
            const HABIT_LANE_OFFSET_Y = 1300;
            const position = {
              x: habitMother.position.x + (laneCount % 3) * 300,
              y: habitMother.position.y + HABIT_LANE_OFFSET_Y + Math.floor(laneCount / 3) * 160,
            };
            const lane: Node = {
              id: `habit-lane-${crypto.randomUUID()}`,
              kind: 'habit.lane',
              position,
              isMother: false,
              state: { habitId },
              config: { days: 28 },
            };
            addNode(lane);
            const finalBoard = store.getState().board;
            if (finalBoard) void saveBoard(finalBoard);
            emit('node.added', `habit.lane spawned for habit ${habitId.slice(0, 8)}`, { refId: lane.id });
            ok = true;
            message = `habit pinned: lane ${lane.id.slice(0, 13)}`;
            break;
          }

          // ── Decision 29 — habit.unpinLane (cli:dispatch route for `habit unpin`) ─
          case 'habit.unpinLane': {
            const { habitId } = args as { habitId?: string };
            if (!habitId || typeof habitId !== 'string') { message = 'habit.unpinLane requires habitId'; break; }
            const { board: currentBoard, removeNode } = store.getState();
            if (!currentBoard) { message = 'No board loaded'; break; }
            const lanes = currentBoard.nodes.filter(
              (n) => n.kind === 'habit.lane' && (n.state as HabitLaneState | null)?.habitId === habitId,
            );
            if (lanes.length === 0) {
              message = 'habit not pinned';
              break;
            }
            if (lanes.length > 1) {
              // Should not happen — dedup invariant. Remove all and warn.
              message = `Warning: ${lanes.length} lane nodes found for habit ${habitId.slice(0, 8)}, removing all`;
            } else {
              message = `habit unpinned: removed lane ${lanes[0]!.id.slice(0, 13)}`;
            }
            for (const lane of lanes) {
              removeNode(lane.id);
              emit('node.removed', `habit.lane removed for habit ${habitId.slice(0, 8)}`, { refId: lane.id });
            }
            const finalBoard = store.getState().board;
            if (finalBoard) void saveBoard(finalBoard);
            ok = true;
            break;
          }

          // ── Decision 29 — log.tail (renderer ring buffer read) ──────────────
          case 'log.tail': {
            const { limit, json } = args as { limit?: number; json?: boolean };
            const entries = useEventLog.getState().entries;
            const n = (typeof limit === 'number' && limit > 0) ? Math.min(limit, entries.length) : Math.min(20, entries.length);
            const tail = entries.slice(-n);
            if (json) {
              ok = true;
              message = JSON.stringify(tail);
            } else {
              if (tail.length === 0) {
                ok = true;
                message = '(empty log)';
              } else {
                const lines = tail.map((e) => {
                  const d = new Date(e.ts);
                  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
                  return `${time}  ${e.kind.padEnd(20)}  ${e.severity}  ${e.text}`;
                });
                ok = true;
                message = lines.join('\n');
              }
            }
            break;
          }

          // ── Decision 29 — log.stats (renderer ring buffer summary) ──────────
          case 'log.stats': {
            const { json } = args as { json?: boolean };
            const entries = useEventLog.getState().entries;
            const byKind: Record<string, number> = {};
            for (const e of entries) {
              byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
            }
            const stats = { total: entries.length, byKind };
            if (json) {
              ok = true;
              message = JSON.stringify(stats);
            } else {
              const kindLines = Object.entries(byKind)
                .sort(([, a], [, b]) => b - a)
                .map(([k, n]) => `  ${k.padEnd(24)}  ${n}`)
                .join('\n');
              ok = true;
              message = [
                `event log: ${entries.length} entries (max 200, cleared on reload)`,
                kindLines || '  (empty)',
              ].join('\n');
            }
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
