// Command registry — single source of truth for help text generation.
// TNF8: No hand-maintained HELP_TEXT constant survives — all help is generated from here.

export interface CliSubcommand {
  name: string;
  usage: string;
  summary: string;
}

export interface CliCommandSpec {
  group: string;
  summary: string;
  subcommands: CliSubcommand[];
}

export const CLI_REGISTRY: CliCommandSpec[] = [
  {
    group: 'task',
    summary: 'Manage TaskNodes linked to the mother TodoNode',
    subcommands: [
      { name: 'add', usage: 'task add "<text>" [--todo <todoId>] [--duration <min>]', summary: 'Create a task + linked TodoItem' },
      { name: 'edit', usage: 'task edit <id> "<text>"', summary: 'Update task text' },
      { name: 'toggle', usage: 'task toggle <id>', summary: 'Toggle done/undone (mirrors to TodoItem)' },
      { name: 'delete', usage: 'task delete <id>', summary: 'Delete task and all descendants; cancels active pomo' },
      { name: 'pomo', usage: 'task pomo <id>', summary: 'Start a pomo session for this task' },
      { name: 'subtask', usage: 'task subtask <parentId> "<text>"', summary: 'Add a child task' },
      { name: 'duration', usage: 'task duration <id> <minutes>', summary: 'Set task duration in minutes' },
      { name: 'sibling', usage: 'task sibling <id>', summary: 'Fork a sibling task in parallel (same as task parallel)' },
      { name: 'parallel', usage: 'task parallel <id>', summary: 'Fork a parallel task (canonical alias for task sibling)' },
      { name: 'reset-pomo', usage: 'task reset-pomo <id>', summary: 'Reset pomo session count for task' },
      { name: 'chain', usage: 'task chain <ref1> <ref2> [<ref3>...]', summary: 'Wire task.next → task.activate between consecutive tasks' },
      { name: 'schedule', usage: 'task schedule <ref> --at <YYYY-MM-DDTHH:MM> [--duration <min>]', summary: 'Schedule a task at a wall-clock time (cascade anchor)' },
      { name: 'unschedule', usage: 'task unschedule <ref>', summary: 'Clear the scheduled time from a task' },
      { name: 'addNext', usage: 'task addNext <sourceRef> "<text>" [--duration <min>]', summary: 'Add a sequential successor task after source' },
      { name: 'list', usage: 'task list [<todoId>] [--json]', summary: 'List tasks, optionally filtered by TodoNode. IDs/refs accept ≥4-char prefix or unique text.' },
      { name: 'kind', usage: 'task kind <ref> <focus|event>', summary: 'Set task kind discriminator (Decision 28). Refuses on active pomo task in headless mode.' },
      { name: 'note', usage: 'task note <ref> "<text>" | --clear', summary: 'Set or clear a free-form note on a task' },
    ],
  },
  {
    group: 'todo',
    summary: 'Manage TodoItems on the mother TodoNode',
    subcommands: [
      { name: 'add', usage: 'todo add "<text>" [--tag <label>]', summary: 'Add a TodoItem + linked TaskNode (both created, bidirectional link)' },
      { name: 'check', usage: 'todo check <ref>', summary: 'Toggle a TodoItem done/undone — <ref> accepts id-prefix or text match' },
      { name: 'list', usage: 'todo list [--json]', summary: 'List all TodoItems (--json prints bare JSON)' },
    ],
  },
  {
    group: 'habit',
    summary: 'Manage habits on the mother HabitNode',
    subcommands: [
      { name: 'add', usage: 'habit add "<name>"', summary: 'Add a new habit' },
      { name: 'done', usage: 'habit done <id|name> [--date YYYY-MM-DD]', summary: 'Mark a habit done for a date' },
      { name: 'streak', usage: 'habit streak <id|name>', summary: 'Show current streak' },
      { name: 'color', usage: 'habit color <id|name> <acid|rust|cyan|plum|spine|ink>', summary: 'Set habit color' },
      { name: 'remove', usage: 'habit remove <id|name>', summary: 'Remove a habit' },
      { name: 'view', usage: 'habit view <week|month|year>', summary: 'Set habit view mode' },
      { name: 'list', usage: 'habit list [--json]', summary: 'List all habits' },
      { name: 'rename', usage: 'habit rename <id|name> "<new>"', summary: 'Rename a habit' },
      { name: 'icon', usage: 'habit icon <id|name> <icon> | --clear', summary: 'Set or clear per-habit icon glyph/emoji' },
      { name: 'note', usage: 'habit note <id|name> "<text>" | --clear', summary: 'Set or clear a free-form note on a habit' },
      { name: 'schedule', usage: 'habit schedule <id|name> --daily --at HH:MM [--duration N]', summary: 'Set daily schedule (--daily / --weekly --days 1,2,5 / --weekdays). --at expects HH:MM format.' },
      { name: 'unschedule', usage: 'habit unschedule <id|name>', summary: 'Clear habit schedule' },
      { name: 'archive', usage: 'habit archive <id|name>', summary: 'Archive a habit (hidden from grid)' },
      { name: 'show', usage: 'habit show <id|name> [--json]', summary: 'Show full habit detail including schedule and log count' },
      { name: 'pin', usage: 'habit pin <id|name>', summary: 'Spawn a habit.lane card on the canvas (requires open renderer, exit 2 if detached)' },
      { name: 'unpin', usage: 'habit unpin <id|name>', summary: 'Remove the habit.lane card (requires open renderer, exit 2 if detached)' },
    ],
  },
  {
    group: 'pomo',
    summary: 'Control the Pomodoro timer',
    subcommands: [
      { name: 'start', usage: 'pomo start [--label "..."] [--minutes 25]', summary: 'Start a pomo session' },
      { name: 'stop', usage: 'pomo stop', summary: 'Stop/cancel the current session' },
      { name: 'status', usage: 'pomo status', summary: 'Show current pomo status' },
      { name: 'config', usage: 'pomo config [--session N] [--short N] [--long N] [--every N] [--face ascii|lcd|blocks|vapor]', summary: 'Update board-scoped PomoConfig on the mother PomoNode' },
    ],
  },
  {
    group: 'text',
    summary: 'Manage TextNodes on the canvas',
    subcommands: [
      { name: 'add', usage: 'text add [--text "..."] [--at x,y] [--near <ref>]', summary: 'Add a text node. --near positions at srcX + srcW + 24, srcY' },
      { name: 'set', usage: 'text set <id> --text "..."', summary: 'Update text node content' },
      { name: 'resize', usage: 'text resize <id> --w N --h N', summary: 'Resize a text node' },
    ],
  },
  {
    group: 'image',
    summary: 'Manage ImageNodes on the canvas',
    subcommands: [
      { name: 'add', usage: 'image add <abs-path> [--at x,y] [--near <ref>]', summary: 'Add an image node. --near positions at srcX + srcW + 24, srcY' },
      { name: 'replace', usage: 'image replace <id> <abs-path>', summary: 'Replace image asset' },
      { name: 'resize', usage: 'image resize <id> --w N --h N', summary: 'Resize an image node' },
      { name: 'clear', usage: 'image clear <id>', summary: 'Remove image asset from node' },
    ],
  },
  {
    group: 'frame',
    summary: 'Manage FrameNodes (grouping containers) on the canvas',
    subcommands: [
      { name: 'add', usage: 'frame add [--label "..."] [--at x,y] [--w N] [--h N] [--tint cyan|spine|rust|plum|neutral] [--near <ref>]', summary: 'Add a frame. --near auto-sizes to fit source + padding and seeds childIds' },
      { name: 'label', usage: 'frame label <ref> "<text>"', summary: 'Update frame label' },
      { name: 'resize', usage: 'frame resize <ref> --w N --h N', summary: 'Resize a frame' },
      { name: 'tint', usage: 'frame tint <ref> <cyan|spine|rust|plum|neutral>', summary: 'Change frame tint color' },
      { name: 'list', usage: 'frame list [--json]', summary: 'List all frames' },
      { name: 'contents', usage: 'frame contents <ref> [--json]', summary: 'List persisted childIds of a frame (reads state, no geometry recompute)' },
      { name: 'fit', usage: 'frame fit <ref> [--padding N]', summary: 'Resize & reposition the frame to wrap its childIds with N px padding (default 40). Run after spawning tasks into a frame.' },
    ],
  },
  {
    group: 'analytics',
    summary: 'Analytics reads from board state (headless-capable)',
    subcommands: [
      { name: 'show', usage: 'analytics show [--view overview|calendar|patterns|sources] [--range 7|30|90|365] [--metric taskCount|habitCount|focusMin|sessions] [--json]', summary: 'Show analytics summary for a range' },
      { name: 'totals', usage: 'analytics totals [--range N] [--json]', summary: 'Show task/habit/focus totals over N days (default 30)' },
      { name: 'streaks', usage: 'analytics streaks [--json]', summary: 'Show habit streak data' },
    ],
  },
  {
    group: 'log',
    summary: 'EventLog reads (requires open renderer — exit 2 if detached)',
    subcommands: [
      { name: 'tail', usage: 'log tail [--limit N] [--json]', summary: 'Tail the in-memory event ring buffer (200 entries max, cleared on reload). Requires open renderer.' },
      { name: 'stats', usage: 'log stats [--json]', summary: 'Show event log summary stats. Reads in-memory ring buffer (200 entries max, cleared on reload). Requires open renderer.' },
    ],
  },
  {
    group: 'edge',
    summary: 'Manage edges (event → command wires)',
    subcommands: [
      { name: 'add', usage: 'edge add --from <nodeRef:event> --to <nodeRef:command>', summary: 'Create a wired edge (refs accept prefix)' },
      { name: 'remove', usage: 'edge remove <ref>', summary: 'Remove an edge (ref accepts id-prefix)' },
      { name: 'enable', usage: 'edge enable <ref>', summary: 'Enable a disabled edge' },
      { name: 'disable', usage: 'edge disable <ref>', summary: 'Disable an edge without removing it' },
      { name: 'list', usage: 'edge list [--json]', summary: 'List all edges' },
    ],
  },
  {
    group: 'node',
    summary: 'Low-level node management — all refs accept id-prefix or unique text',
    subcommands: [
      { name: 'read', usage: 'node read <ref> [--json]', summary: 'Print full state + config + incident edges for one node' },
      { name: 'remove', usage: 'node remove <ref> [--force]', summary: 'Remove a node (cascades for tasks; --force needed for mothers)' },
      { name: 'set-position', usage: 'node set-position <ref> --x N --y N', summary: 'Set node position directly' },
      { name: 'move', usage: 'node move <ref> --to x,y', summary: 'Animate node move (requires renderer)' },
      { name: 'list', usage: 'node list [--kind <k>] [--mother|--child] [--json]', summary: 'List all nodes' },
    ],
  },
  {
    group: 'board',
    summary: 'Board read + persistence',
    subcommands: [
      { name: 'show', usage: 'board show [--json]', summary: 'Print board: --json emits bare JSON; default is a human summary' },
      { name: 'summary', usage: 'board summary [--json]', summary: 'One-line counts of nodes + edges' },
      { name: 'stats', usage: 'board stats [--json]', summary: 'Per-kind node counts + per-event edge counts' },
      { name: 'save', usage: 'board save [path]', summary: '(autosave is always on — kept for parity)' },
      { name: 'load', usage: 'board load <path>', summary: 'Load board from path' },
    ],
  },
  {
    group: 'cal',
    summary: 'Calendar view of cascade-scheduled tasks (ADR 0003/0005)',
    subcommands: [
      { name: 'show', usage: 'cal show [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--json]', summary: 'List all scheduled task placements, sorted by time' },
    ],
  },
  {
    group: 'clock',
    summary: 'Clock day-selector and wall-clock task view (ADR 0004)',
    subcommands: [
      { name: 'day', usage: 'clock day <YYYY-MM-DD|today|+1|-1>', summary: 'Set the clock selected date (absolute, today, or ±1 day)' },
      { name: 'show', usage: 'clock show [--json]', summary: 'Show scheduled tasks for the clock\'s selected date and view window' },
    ],
  },
  {
    group: 'info',
    summary: 'AI-oriented "where am I" snapshot',
    subcommands: [
      { name: 'info', usage: 'info [--json]', summary: 'Counts + mother-node ids + theme + viewport — one call to bootstrap context' },
    ],
  },
  {
    group: 'settings',
    summary: 'Read app settings',
    subcommands: [
      { name: 'show', usage: 'settings show [--json]', summary: 'theme + viewport + boardPath + version' },
    ],
  },
  {
    group: 'term',
    summary: 'Control the active TerminalNode session',
    subcommands: [
      { name: 'setTitle', usage: 'term setTitle "<title>"', summary: 'Update terminal window title' },
      { name: 'setFontSize', usage: 'term setFontSize <N>', summary: 'Set terminal font size' },
      { name: 'clear', usage: 'term clear', summary: 'Clear the terminal screen' },
    ],
  },
  {
    group: 'viewport',
    summary: 'Canvas viewport control (requires open renderer)',
    subcommands: [
      { name: 'pan', usage: 'viewport pan --dx N --dy N', summary: 'Pan canvas by delta' },
      { name: 'zoom', usage: 'viewport zoom --factor N', summary: 'Zoom canvas by factor' },
      { name: 'show', usage: 'viewport show [--json]', summary: 'Print current viewport (read-only, no renderer required)' },
    ],
  },
  {
    group: 'history',
    summary: 'Undo/redo (requires open renderer)',
    subcommands: [
      { name: 'undo', usage: 'undo', summary: 'Undo last action' },
      { name: 'redo', usage: 'redo', summary: 'Redo last undone action' },
    ],
  },
  {
    group: 'theme',
    summary: 'UI theme',
    subcommands: [
      { name: 'set', usage: 'theme set <light|dark>', summary: 'Switch renderer theme (requires open renderer)' },
      { name: 'show', usage: 'theme show [--json]', summary: 'Read current theme from settings (headless-capable)' },
    ],
  },
  {
    group: 'voice',
    summary: 'Voice I/O',
    subcommands: [
      { name: 'say', usage: 'say "<text>"', summary: 'Speak text via TTS' },
      { name: 'hear', usage: 'hear', summary: 'One-shot STT transcription' },
    ],
  },
  {
    group: 'help',
    summary: 'Show this help',
    subcommands: [
      { name: 'help', usage: 'help [<group>] [<sub>]', summary: 'Show help for a group or subcommand' },
    ],
  },
];

// ── Help text generation ──────────────────────────────────────────────────

function pad(s: string, len: number): string {
  return s + ' '.repeat(Math.max(0, len - s.length));
}

/** Generate the top-level `krnl help` overview. */
export function generateHelp(version: string): string {
  const lines: string[] = [
    `krnl0 v${version} — canvas CLI`,
    `Usage: krnl <command> [args]`,
    '',
  ];
  for (const spec of CLI_REGISTRY) {
    lines.push(`  ${pad(spec.group, 12)}  ${spec.summary}`);
  }
  lines.push('');
  lines.push(`Run 'krnl help <group>' for subcommand detail.`);
  return lines.join('\n');
}

/** Generate help for a single group. */
export function generateGroupHelp(group: string): string | null {
  const spec = CLI_REGISTRY.find((s) => s.group === group);
  if (!spec) return null;
  const lines: string[] = [`${spec.group} — ${spec.summary}`, ''];
  for (const sub of spec.subcommands) {
    lines.push(`  ${sub.usage}`);
    lines.push(`      ${sub.summary}`);
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}

/** Generate help for a single subcommand. */
export function generateSubHelp(group: string, sub: string): string | null {
  const spec = CLI_REGISTRY.find((s) => s.group === group);
  if (!spec) return null;
  const subSpec = spec.subcommands.find((s) => s.name === sub);
  if (!subSpec) return null;
  return [`Usage: krnl ${subSpec.usage}`, `       ${subSpec.summary}`].join('\n');
}
