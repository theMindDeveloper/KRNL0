import { SysParser } from './parser';
import * as habit from './commands/habit';
import * as todo from './commands/todo';
import * as task from './commands/task';
import * as boardCmd from './commands/board';
import * as nodeCmd from './commands/node';
import * as edgeCmd from './commands/edge';
import * as infoCmd from './commands/info';
import * as calCmd from './commands/cal';
import * as clockCmd from './commands/clock';
import { textAdd, textSet, textResize } from './commands/text';
import { drawList, drawClear, drawDelete } from './commands/draw';
import { canvasList, canvasAdd, canvasSwitch, canvasRename, canvasDelete } from './commands/canvas';
import { mediaAdd, mediaList } from './commands/media';
import { pomoStart, pomoStop, pomoStatus, pomoBreak, pomoExtend, pomoConfig, pomoPause, pomoResume, pomoDiscard, pomoTag, pomoRetag, pomoDeleteSegmentCmd, pomoSegments } from './commands/pomo';
import {
  imageAdd,
  imageReplace,
  imageResize,
  imageClear,
} from './commands/image';
import {
  frameAdd,
  frameLabel,
  frameResize,
  frameTint,
  frameList,
  frameContents,
  frameFit,
} from './commands/frame';
import type { FrameCtx } from './commands/frame';
import {
  analyticsShow,
  analyticsTotals,
  analyticsStreaks,
  analyticsWindow,
  analyticsSummary,
} from './commands/analytics';
import type { AnalyticsCtx } from './commands/analytics';
import { logTail, logStats, requiresRenderer as logRequiresRenderer } from './commands/log';
import { themeShow, themeFrames } from './commands/theme';
import { isFrameStyleId } from '../shared/frameStyles';
import type { ThemeCtx } from './commands/theme';
import {
  generateHelp,
  generateGroupHelp,
  generateSubHelp,
} from '../shared/cli/commandRegistry';

/** Function type for renderer-coupled CLI dispatch (Phase 2). */
export type CliDispatchFn = (
  command: string,
  args: Record<string, unknown>,
) => Promise<{ ok: boolean; message: string; exitCode?: number }>;

export interface SysResult {
  ok: boolean;
  message?: string;
  data?: unknown;
}

export interface SysFacadeDeps {
  boardPath: string;
  hasOpenRenderer: () => boolean;
  onBoardChanged?: () => void;
  /** Phase 2: renderer-coupled dispatch for viewport/undo/redo/theme commands. */
  cliDispatch?: CliDispatchFn;
}

function defaultBoardPath(): string {
  if (process.env['KRNL0_BOARD_PATH']) return process.env['KRNL0_BOARD_PATH'];
  const dir = process.env['KRNL0_BOARD_DIR']
    ?? `${process.env['USERPROFILE'] ?? process.env['HOME'] ?? '.'}/Documents/krnl0`;
  return `${dir}/board.json`;
}

function readVersion(): string {
  try {
    // SysFacade is used both from main process (compiled) and from tests.
    // The package.json is one level above src/.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pkg = require('../../package.json') as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export class SysFacade {
  private readonly deps: SysFacadeDeps;
  private readonly version: string;

  constructor(deps?: Partial<SysFacadeDeps>) {
    this.deps = {
      boardPath: deps?.boardPath ?? defaultBoardPath(),
      hasOpenRenderer: deps?.hasOpenRenderer ?? (() => false),
      ...(deps?.onBoardChanged ? { onBoardChanged: deps.onBoardChanged } : {}),
      ...(deps?.cliDispatch ? { cliDispatch: deps.cliDispatch } : {}),
    };
    this.version = readVersion();
  }

  async run(argv: string[]): Promise<SysResult> {
    if (argv.length === 0) {
      return { ok: true, message: generateHelp(this.version) };
    }

    const command = SysParser.parse(argv);
    if (!command) {
      return {
        ok: false,
        message: `Unknown command: '${argv.join(' ')}'. Run 'krnl help' for usage.`,
      };
    }

    if (command.kind === 'invalid') {
      return { ok: false, message: command.message };
    }

    if (command.kind === 'help') {
      if (command.group && command.sub) {
        const text = generateSubHelp(command.group, command.sub);
        return text
          ? { ok: true, message: text }
          : { ok: false, message: `Unknown subcommand: ${command.group} ${command.sub}` };
      }
      if (command.group) {
        const text = generateGroupHelp(command.group);
        return text
          ? { ok: true, message: text }
          : { ok: false, message: `Unknown command group: ${command.group}` };
      }
      return { ok: true, message: generateHelp(this.version) };
    }

    if (command.kind === 'version') {
      return { ok: true, message: `krnl0 v${this.version}` };
    }

    // ── Board reads ──────────────────────────────────────────────────────────
    if (command.kind === 'board') {
      const bCtx: boardCmd.BoardCtx = { boardPath: this.deps.boardPath };
      switch (command.sub) {
        case 'show':    return boardCmd.boardShow(bCtx, command.json);
        case 'summary': return boardCmd.boardSummary(bCtx, command.json);
        case 'stats':   return boardCmd.boardStats(bCtx, command.json);
        case 'save':    return boardCmd.boardSave(command.path);
        case 'load':    return boardCmd.boardLoad(command.path);
      }
    }

    // ── Info / settings / viewport reads ────────────────────────────────────
    if (command.kind === 'info') {
      const iCtx: infoCmd.InfoCtx = { boardPath: this.deps.boardPath, version: this.version };
      return infoCmd.infoShow(iCtx, command.json);
    }
    if (command.kind === 'settings' && command.sub === 'show') {
      const iCtx: infoCmd.InfoCtx = { boardPath: this.deps.boardPath, version: this.version };
      return infoCmd.settingsShow(iCtx, command.json);
    }
    if (command.kind === 'viewport' && command.sub === 'show') {
      const iCtx: infoCmd.InfoCtx = { boardPath: this.deps.boardPath, version: this.version };
      return infoCmd.viewportShow(iCtx, command.json);
    }

    // ── Generic node CRUD ────────────────────────────────────────────────────
    if (command.kind === 'node') {
      const nCtx: nodeCmd.NodeCtx = {
        boardPath: this.deps.boardPath,
        ...(this.deps.onBoardChanged ? { onBoardChanged: this.deps.onBoardChanged } : {}),
      };
      switch (command.sub) {
        case 'list': {
          const filters: nodeCmd.NodeListFilters = {};
          if (command.nodeKind !== undefined) filters.kind = command.nodeKind;
          if (command.motherOnly) filters.motherOnly = true;
          if (command.childOnly) filters.childOnly = true;
          return nodeCmd.nodeList(nCtx, filters, command.json);
        }
        case 'read':         return nodeCmd.nodeRead(nCtx, command.id, command.json);
        case 'remove':       return nodeCmd.nodeRemove(nCtx, command.id, command.force);
        case 'set-position': return nodeCmd.nodeSetPosition(nCtx, command.id, command.x, command.y);
        // 'move' and 'add' handled below via the existing renderer-coupled path.
      }
    }

    // ── Edge CRUD ────────────────────────────────────────────────────────────
    if (command.kind === 'edge') {
      const eCtx: edgeCmd.EdgeCtx = {
        boardPath: this.deps.boardPath,
        ...(this.deps.onBoardChanged ? { onBoardChanged: this.deps.onBoardChanged } : {}),
      };
      switch (command.sub) {
        case 'list':    return edgeCmd.edgeList(eCtx, command.json);
        case 'add':     return edgeCmd.edgeAdd(eCtx, command.from, command.to);
        case 'remove':  return edgeCmd.edgeRemove(eCtx, command.id);
        case 'enable':  return edgeCmd.edgeEnable(eCtx, command.id, true);
        case 'disable': return edgeCmd.edgeEnable(eCtx, command.id, false);
      }
    }

    if (command.kind === 'whoami') {
      const socket = process.env['KRNL0_RPC_SOCKET'] ?? '<unset>';
      const pid = process.env['KRNL0_MAIN_PID'] ?? String(process.pid);
      const token = process.env['KRNL0_RPC_TOKEN'];
      return {
        ok: true,
        message: [
          `socket : ${socket}`,
          `token  : ${token ? '(set)' : '(unset)'}`,
          `pid    : ${pid}`,
        ].join('\n'),
      };
    }

    if (command.kind === 'term') {
      // term.* commands require an open renderer (they operate on TerminalNode state).
      // Phase 1: headless stub — inform user.
      if (!this.deps.hasOpenRenderer()) {
        return {
          ok: false,
          message: `term.${command.sub} requires an open renderer window (exit 2 = no renderer).`,
          data: { exitCode: 2 },
        };
      }
      // Renderer-side dispatch is wired in commandDispatch.ts via cli:dispatch IPC (Phase 2).
      if (!this.deps.cliDispatch) {
        return {
          ok: false,
          message: `term.${command.sub} requires cli:dispatch (no renderer coupled)`,
          data: { exitCode: 2 },
        };
      }
      return this.deps.cliDispatch(`term.${command.sub}`, command as unknown as Record<string, unknown>);
    }

    // ── Phase 2 commands — renderer-coupled via cli:dispatch ──────────────────

    if (command.kind === 'node' && command.sub === 'move') {
      if (!command.id) return { ok: false, message: 'node move requires <id>' };
      if (!command.to) return { ok: false, message: 'node move requires --to x,y' };
      if (!this.deps.cliDispatch) {
        return { ok: false, message: 'node move requires an open renderer window', data: { exitCode: 2 } };
      }
      return this.deps.cliDispatch('node.move', { id: command.id, x: command.to.x, y: command.to.y });
    }

    if (command.kind === 'viewport') {
      if (!this.deps.cliDispatch) {
        return { ok: false, message: `viewport.${command.sub} requires an open renderer window`, data: { exitCode: 2 } };
      }
      if (command.sub === 'pan') {
        if (command.dx === undefined || command.dy === undefined) {
          return { ok: false, message: 'viewport pan requires --dx and --dy' };
        }
        return this.deps.cliDispatch('viewport.pan', { dx: command.dx, dy: command.dy });
      }
      if (command.sub === 'zoom') {
        if (command.factor === undefined) {
          return { ok: false, message: 'viewport zoom requires --factor' };
        }
        return this.deps.cliDispatch('viewport.zoom', { factor: command.factor });
      }
    }

    if (command.kind === 'undo') {
      if (!this.deps.cliDispatch) {
        return { ok: false, message: 'undo requires an open renderer window', data: { exitCode: 2 } };
      }
      return this.deps.cliDispatch('undo', {});
    }

    if (command.kind === 'redo') {
      if (!this.deps.cliDispatch) {
        return { ok: false, message: 'redo requires an open renderer window', data: { exitCode: 2 } };
      }
      return this.deps.cliDispatch('redo', {});
    }

    if (command.kind === 'marquee') {
      if (!this.deps.cliDispatch) {
        return { ok: false, message: 'marquee requires an open renderer window', data: { exitCode: 2 } };
      }
      if (!command.rect) return { ok: false, message: 'marquee requires --rect x1,y1,x2,y2' };
      // Destructive: only delete when the caller explicitly asked for it.
      if (!command.delete) {
        return { ok: false, message: 'marquee deletes everything in the rect — pass --delete to confirm' };
      }
      return this.deps.cliDispatch('marquee.delete', command.rect as unknown as Record<string, unknown>);
    }

    if (command.kind === 'theme') {
      if (command.sub === 'show') {
        const tCtx: ThemeCtx = { boardPath: this.deps.boardPath };
        // The frame style is a per-window preference (ADR 0009 §5); ask the
        // renderer when one is open, otherwise report it as unknown.
        if (this.deps.cliDispatch) {
          const r = await this.deps.cliDispatch('theme.frame.get', {});
          if (r.ok) tCtx.frame = r.message;
        }
        return themeShow(tCtx, command.json);
      }
      if (command.sub === 'frames') {
        return themeFrames(command.json);
      }
      if (command.sub === 'frame') {
        if (!isFrameStyleId(command.value)) {
          return { ok: false, message: command.value ? `Unknown frame style: ${command.value}` : 'theme frame requires <id> (see: sys theme frames)' };
        }
        if (!this.deps.cliDispatch) {
          return { ok: false, message: 'theme frame requires an open renderer window', data: { exitCode: 2 } };
        }
        return this.deps.cliDispatch('theme.frame', { value: command.value });
      }
      if (command.sub === 'set') {
        if (!command.value || !['light', 'dark'].includes(command.value)) {
          return { ok: false, message: 'theme set requires <light|dark>' };
        }
        if (!this.deps.cliDispatch) {
          return { ok: false, message: 'theme set requires an open renderer window', data: { exitCode: 2 } };
        }
        return this.deps.cliDispatch('theme.set', { value: command.value });
      }
    }

    // ── Decision 29 — frame CRUD ────────────────────────────────────────────
    if (command.kind === 'frame') {
      const fCtx: FrameCtx = {
        boardPath: this.deps.boardPath,
        ...(this.deps.onBoardChanged ? { onBoardChanged: this.deps.onBoardChanged } : {}),
      };
      switch (command.sub) {
        case 'add': {
          const fAddOpts: Parameters<typeof frameAdd>[1] = {};
          if (command.label !== undefined) fAddOpts.label = command.label;
          if (command.at !== undefined) fAddOpts.at = command.at;
          if (command.w !== undefined) fAddOpts.w = command.w;
          if (command.h !== undefined) fAddOpts.h = command.h;
          if (command.tint !== undefined) fAddOpts.tint = command.tint;
          if (command.near !== undefined) fAddOpts.near = command.near;
          return frameAdd(fCtx, fAddOpts);
        }
        case 'label':    return frameLabel(fCtx, command.ref, command.label);
        case 'resize':   return frameResize(fCtx, command.ref, command.w, command.h);
        case 'tint':     return frameTint(fCtx, command.ref, command.tint);
        case 'list':     return frameList(fCtx, command.json);
        case 'contents': return frameContents(fCtx, command.ref, command.json);
        case 'fit':      return frameFit(fCtx, command.ref, command.padding);
      }
    }

    // ── Decision 29 — analytics reads ──────────────────────────────────────
    if (command.kind === 'analytics') {
      const aCtx: AnalyticsCtx = { boardPath: this.deps.boardPath };
      switch (command.sub) {
        case 'show': {
          const showOpts: Parameters<typeof analyticsShow>[1] = {};
          if (command.view !== undefined) showOpts.view = command.view;
          if (command.range !== undefined) showOpts.range = command.range;
          if (command.metric !== undefined) showOpts.metric = command.metric;
          if (command.json) showOpts.json = command.json;
          return analyticsShow(aCtx, showOpts);
        }
        case 'totals': {
          const totalsOpts: Parameters<typeof analyticsTotals>[1] = {};
          if (command.range !== undefined) totalsOpts.range = command.range;
          if (command.json) totalsOpts.json = command.json;
          return analyticsTotals(aCtx, totalsOpts);
        }
        case 'streaks': return analyticsStreaks(aCtx, { json: command.json });
        case 'summary': {
          const sumOpts: Parameters<typeof analyticsSummary>[1] = { json: command.json };
          if (command.range !== undefined) sumOpts.range = command.range;
          return analyticsSummary(aCtx, sumOpts);
        }
        case 'open':
        case 'close':
        case 'toggle':
          return analyticsWindow(
            { ...aCtx, ...(this.deps.onBoardChanged ? { onBoardChanged: this.deps.onBoardChanged } : {}) },
            command.sub,
          );
      }
    }

    // ── Decision 29 — log reads (renderer-required) ─────────────────────────
    if (command.kind === 'log') {
      if (!this.deps.cliDispatch) {
        return logRequiresRenderer(`log.${command.sub}`);
      }
      switch (command.sub) {
        case 'tail': {
          const tailOpts: Parameters<typeof logTail>[1] = {};
          if (command.limit !== undefined) tailOpts.limit = command.limit;
          if (command.json) tailOpts.json = command.json;
          return logTail(this.deps.cliDispatch, tailOpts);
        }
        case 'stats': return logStats(this.deps.cliDispatch, { json: command.json });
      }
    }

    if (command.kind === 'sfx') {
      if (!this.deps.cliDispatch) {
        return { ok: false, message: 'sfx requires an open renderer window', data: { exitCode: 2 } };
      }
      if (command.sub === 'play') {
        if (!command.clipId) return { ok: false, message: 'sfx play requires <clipId>' };
        return this.deps.cliDispatch('sfx.play', { clipId: command.clipId });
      }
      if (command.sub === 'stop') return this.deps.cliDispatch('sfx.stop', {});
      if (command.sub === 'list') return this.deps.cliDispatch('sfx.list', {});
    }

    if (command.kind === 'pomo') {
      switch (command.sub) {
        case 'start':  return pomoStart(command.label, command.minutes);
        case 'stop':   return pomoStop();
        case 'break':  return pomoBreak();
        case 'extend': return pomoExtend();
        case 'pause':  return pomoPause();
        case 'resume': return pomoResume();
        case 'discard': return pomoDiscard();
        case 'tag':
        case 'retag': {
          const tagCtx = {
            boardPath: this.deps.boardPath,
            ...(this.deps.onBoardChanged ? { onBoardChanged: this.deps.onBoardChanged } : {}),
          };
          return command.sub === 'tag'
            ? pomoTag(tagCtx, command.ref)
            : pomoRetag(tagCtx, command.segmentId, command.ref, { text: command.text, tag: command.tag });
        }
        case 'delete-segment': {
          const segCtx = {
            boardPath: this.deps.boardPath,
            ...(this.deps.onBoardChanged ? { onBoardChanged: this.deps.onBoardChanged } : {}),
          };
          return pomoDeleteSegmentCmd(segCtx, command.segmentId);
        }
        case 'segments': {
          const segOpts: Parameters<typeof pomoSegments>[1] = { json: command.json };
          if (command.date !== undefined) segOpts.date = command.date;
          return pomoSegments({ boardPath: this.deps.boardPath }, segOpts);
        }
        case 'status': return pomoStatus();
        case 'config': {
          const cfgOpts: Parameters<typeof pomoConfig>[0] = {};
          if (command.session !== undefined) cfgOpts.session = command.session;
          if (command.short !== undefined) cfgOpts.short = command.short;
          if (command.long !== undefined) cfgOpts.long = command.long;
          if (command.every !== undefined) cfgOpts.every = command.every;
          if (command.face !== undefined) cfgOpts.face = command.face;
          if (command.countStopped !== undefined) cfgOpts.countStopped = command.countStopped;
          if (command.mode !== undefined) cfgOpts.mode = command.mode;
          const res = pomoConfig(cfgOpts);
          // The file-path variant writes board.json directly; tell the
          // renderer to reload or its next save would revert the change.
          if (res.ok && Object.keys(cfgOpts).length > 0) this.deps.onBoardChanged?.();
          return res;
        }
      }
    }

    if (command.kind === 'habit') {
      const ctx: habit.HabitCtx = {
        boardPath: this.deps.boardPath,
        ...(this.deps.onBoardChanged ? { onBoardChanged: this.deps.onBoardChanged } : {}),
        ...(this.deps.cliDispatch ? { cliDispatch: this.deps.cliDispatch } : {}),
      };
      switch (command.sub) {
        case 'add':    return habit.cliAdd(ctx, command.name);
        case 'done':   return habit.cliDone(ctx, command.name, command.date);
        case 'undo':   return habit.cliUndo(ctx, command.name, command.date);
        case 'streak': return habit.cliStreak(ctx, command.name);
        case 'color':  return habit.cliColor(ctx, command.name, command.color);
        case 'remove': return habit.cliRemove(ctx, command.name);
        case 'view':   return habit.cliView(ctx, command.view);
        case 'list':   return habit.cliList(ctx, command.json);
        // Decision 29 — new habit subcommands
        case 'rename':     return habit.cliRename(ctx, command.ref, command.newName);
        case 'icon':       return habit.cliIcon(ctx, command.ref, command.icon, command.clear);
        case 'note':       return habit.cliNote(ctx, command.ref, command.text, command.clear);
        case 'schedule':   return habit.cliSchedule(ctx, command.ref, command.scheduleKind, command.days, command.at, command.durationMin, command.invalidDays);
        case 'unschedule': return habit.cliUnschedule(ctx, command.ref);
        case 'archive':    return habit.cliArchive(ctx, command.ref);
        case 'show':       return habit.cliShow(ctx, command.ref, command.json);
        case 'pin':        return habit.cliPin(ctx, command.ref);
        case 'unpin':      return habit.cliUnpin(ctx, command.ref);
      }
    }

    if (command.kind === 'todo') {
      const ctx: todo.TodoCtx = {
        boardPath: this.deps.boardPath,
        ...(this.deps.onBoardChanged ? { onBoardChanged: this.deps.onBoardChanged } : {}),
      };
      switch (command.sub) {
        case 'add':   return todo.todoAdd(ctx, command.text, command.tag);
        case 'check': return todo.todoCheck(ctx, command.id);
        case 'list':  return todo.todoList(ctx, command.json, command.scope);
        case 'tag':   return todo.todoTag(ctx, command.ref, command.tag);
        case 'tags': {
          const opts: Parameters<typeof todo.todoTags>[1] = { json: command.json };
          if (command.action !== undefined) opts.action = command.action;
          if (command.label !== undefined) opts.label = command.label;
          if (command.keywords !== undefined) opts.keywords = command.keywords;
          if (command.color !== undefined) opts.color = command.color;
          return todo.todoTags(ctx, opts);
        }
        case 'archive':       return todo.todoArchive(ctx);
        case 'clear-archive': return todo.todoClearArchive(ctx);
      }
    }

    if (command.kind === 'task') {
      const ctx: task.TaskCtx = {
        boardPath: this.deps.boardPath,
        ...(this.deps.onBoardChanged ? { onBoardChanged: this.deps.onBoardChanged } : {}),
      };
      switch (command.sub) {
        case 'list':    return task.taskList(ctx, command.todoId, command.json);
        case 'add':     return task.taskAdd(ctx, command.todoId, command.text, command.durationMin);
        case 'edit':    return task.taskEdit(ctx, command.id, command.text);
        case 'toggle':  return task.taskToggle(ctx, command.id);
        case 'delete':  return task.taskDelete(ctx, command.id);
        case 'pomo':    return task.taskStartPomo(ctx, command.id);
        case 'subtask':    return task.taskSubtask(ctx, command.parentId, command.text);
        case 'duration':   return task.taskDuration(ctx, command.id, command.minutes);
        case 'sibling':    return task.taskSibling(ctx, command.id);
        case 'parallel':   return command.with !== undefined
          ? task.taskParallelWith(ctx, command.id, command.with)
          : task.taskParallel(ctx, command.id);
        case 'reset-pomo': return task.taskResetPomo(ctx, command.id);
        case 'chain':      return task.taskChain(ctx, command.refs);
        case 'schedule':   return task.taskSchedule(ctx, command.id, command.at, command.durationMin);
        case 'unschedule': return task.taskUnschedule(ctx, command.id);
        case 'addNext':    return task.taskAddNext(ctx, command.sourceRef, command.text, command.durationMin);
        // Decision 29 — kind + note
        case 'kind': return task.taskKind(ctx, command.ref, command.taskKind);
        case 'note': return task.taskNote(ctx, command.ref, command.text, command.clear);
      }
    }

    if (command.kind === 'cal') {
      const ctx: calCmd.CalCtx = { boardPath: this.deps.boardPath };
      if (command.sub === 'show') {
        return calCmd.calShow(ctx, command.from, command.to, command.json);
      }
      if (command.sub === 'view') {
        return calCmd.calView(
          { ...ctx, ...(this.deps.onBoardChanged ? { onBoardChanged: this.deps.onBoardChanged } : {}) },
          command.view,
          command.date,
        );
      }
    }

    if (command.kind === 'media') {
      const res = command.sub === 'add' ? mediaAdd(command.url, command.at) : mediaList(command.json);
      if (command.sub === 'add' && res.ok) this.deps.onBoardChanged?.();
      return res;
    }

    if (command.kind === 'draw') {
      const dCtx = {
        boardPath: this.deps.boardPath,
        ...(this.deps.onBoardChanged ? { onBoardChanged: this.deps.onBoardChanged } : {}),
      };
      switch (command.sub) {
        case 'list':   return drawList(dCtx, command.json);
        case 'clear':  return drawClear(dCtx);
        case 'delete': return drawDelete(dCtx, command.id);
      }
    }

    if (command.kind === 'canvas') {
      const cCtx = {
        boardPath: this.deps.boardPath,
        ...(this.deps.onBoardChanged ? { onBoardChanged: this.deps.onBoardChanged } : {}),
      };
      switch (command.sub) {
        case 'list':   return canvasList(cCtx, command.json);
        case 'add':    return canvasAdd(cCtx, command.name);
        case 'switch': return canvasSwitch(cCtx, command.ref);
        case 'rename': return canvasRename(cCtx, command.ref, command.name);
        case 'delete': return canvasDelete(cCtx, command.ref);
      }
    }

    if (command.kind === 'clock') {
      const ctx: clockCmd.ClockCtx = {
        boardPath: this.deps.boardPath,
        ...(this.deps.onBoardChanged ? { onBoardChanged: this.deps.onBoardChanged } : {}),
      };
      switch (command.sub) {
        case 'day':  return clockCmd.clockDay(ctx, command.arg);
        case 'show': return clockCmd.clockShow(ctx, command.json);
        case 'dial': return clockCmd.clockDial(ctx, command.arg);
      }
    }

    // text + image commands route through main/boardIo.ts directly via the
    // KRNL0_BOARD_DIR env (set by handlers.ts at module load). Convergence
    // with the habit/todo/task ctx-passing pattern is a future refactor.
    if (command.kind === 'text') {
      switch (command.sub) {
        case 'add':    return textAdd(command.text, command.at, command.near, command.look);
        case 'set':    return textSet(command.id, command.text);
        case 'resize': return textResize(command.id, command.w, command.h);
      }
    }

    if (command.kind === 'image') {
      switch (command.sub) {
        case 'add':     return imageAdd(command.path, command.at, command.near);
        case 'replace': return imageReplace(command.id, command.path);
        case 'resize':  return imageResize(command.id, command.w, command.h);
        case 'clear':   return imageClear(command.id);
      }
    }

    // Parsed but not wired to an implementation yet (e.g. node add, say,
    // hear). Report failure so scripts and Codex don't assume it ran.
    return {
      ok: false,
      message: `'${argv.slice(0, 2).join(' ')}' is not implemented yet.`,
      data: command,
    };
  }
}

