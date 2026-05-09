krnl0 — Architecture Brief for Claude Code
Context
I'm building krnl0: a desktop app that's an infinite-canvas personal OS. Pomodoro, habits, todos, journal, project board — all as connectable nodes on one whiteboard. Local-first. Plugin-driven eventually.
The defining feature: Claude Code runs inside a terminal node on the canvas and can drive the app itself. The user opens a terminal node, types claude, Claude Code takes over, and from there the user can speak or type instructions that read and modify the board. The terminal is a first-class peer to the GUI, not a power-user escape hatch.
I'm a junior developer. I've never built a desktop app, never embedded a terminal, never written an MCP server. I need help thinking through the architecture before I write code.
What I need you to help me decide
1. Desktop runtime: Tauri vs Electron
   I want a native .exe and .dmg. The UI will be React. The two real options are:

Tauri — Rust backend, smaller bundles (~10MB), faster, but newer ecosystem and Rust learning curve for anything backend-heavy
Electron — Node backend, huge ecosystem, mature terminal libraries (node-pty works out of the box), but bundles are 100MB+ and it's heavier on resources

I'm leaning Tauri for the bundle size and the "feels native" factor, but Electron has fewer sharp edges for the terminal node specifically. Help me weigh this against my actual constraints: solo dev, 10-week timeline for a meaningful slice, real terminal embedding is required.
2. The terminal node — this is the hard part
   The terminal node has to be a real shell (zsh/bash on Mac, PowerShell/cmd on Windows), not a fake REPL. The user must be able to launch claude inside it and have Claude Code work normally — full TUI, keybindings, voice input, everything.
   Concretely this means:

PTY backend. A pseudo-terminal process spawned by my app. On Mac/Linux this is standard POSIX PTY. On Windows it's ConPTY (different API). I need a library that abstracts both.
Terminal renderer in the frontend. xterm.js is the standard. It renders ANSI escape codes, handles resize, blinking cursor, the works.
The bridge. Frontend xterm.js ↔ backend PTY. In Electron this is node-pty + IPC. In Tauri this is either a Rust PTY crate (portable-pty) plus Tauri commands, or a sidecar Node process running node-pty. Help me pick.

What I want from you in this section: tell me which library combination is least likely to bite me on cross-platform issues, and roughly how much work this terminal node alone is going to be. I suspect it's 1–2 weeks of focused work just to get a stable terminal that can host claude. Confirm or correct that.
3. How Claude Code actually drives the app — MCP
   The architectural insight I want to get right: Claude Code does not need privileged access to my app. It talks to my app the same way any other client would — through a defined protocol. That protocol should be MCP (Model Context Protocol).
   The plan:

My app runs an MCP server (local, stdio or HTTP transport).
The server exposes tools: board.list, board.open, node.add, node.remove, pomo.start, pomo.reset, todo.add, todo.complete, habit.done, edge.create, edge.remove, state.get, etc. Each tool has a JSON schema for its arguments.
When the user runs claude in the terminal node, Claude Code auto-discovers the MCP server (configured via .mcp.json or claude_desktop_config.json in the user's home or project dir).
User says or types: "start a pomodoro and wire it to my morning-habits node so finishing the timer marks meditation done." Claude Code parses, calls pomo.start and edge.create tools, my app updates state, the canvas re-renders.

Questions I need answered:

Is MCP the right choice here vs rolling my own JSON-RPC, vs exposing a CLI binary that Claude Code runs as bash commands? I think MCP is right because it's the protocol Claude Code is built for, but tell me if I'm missing something.
Where does the MCP server live? Same process as the Tauri/Electron backend? Separate sidecar? How do they share state?
How do I make sure the MCP server only operates on the currently open board and doesn't get confused if the user has multiple windows?

4. Node + edge architecture (already decided, just for context)
   Every widget on the canvas conforms to one Node interface: kind, JSON state, pure render function, typed event surface, typed command surface, config schema. Edges are directed event→command mappings stored as data in the board file. No direct imports between node modules; all cross-node communication goes through edges. This is non-negotiable.
   The MCP tools are the same command surface that edges use. Edges fire commands locally; Claude Code fires commands through MCP. Same surface, two callers. Get this right and the architecture stays clean.
5. What I'm NOT building yet
   To keep the 10-week scope honest:

No plugin sandbox (built-in nodes only, but designed as if they were plugins)
No multi-window
No sync, no cloud, local file storage only (one JSON per board)
No theming engine beyond light/dark token swap
Three node types for v1: Pomodoro, Todo, Habit. Plus the Terminal node. That's it.

What I want out of this conversation with you
A short architecture doc covering:

Tauri vs Electron — your recommendation with reasoning, given my constraints.
Terminal node tech stack — exact libraries, exact wiring, honest estimate of effort.
MCP server design — where it lives, how it shares state with the app, how tools are organized.
The order I should build things in. I suspect: terminal node first (riskiest), then MCP scaffolding, then canvas + one node, then prove the loop end-to-end with one tool call from claude updating the canvas. Then expand. Confirm or redesign that order.

Don't write code yet. I want to argue about the architecture first.