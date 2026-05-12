# ImageNode — Component Requirements

*Phase 5 · React Flow migration · Derived from PRD v0.6.0, Decision 4, Decision 13, Decision 20 (asset persistence), and LifeOS Whiteboard reference*

---

## Functional Requirements

| # | Requirement |
|---|---|
| F1 | Dropping one or more files of MIME `image/png`, `image/jpeg`, `image/webp`, `image/gif`, or `image/svg+xml` onto the canvas creates one ImageNode per file at the drop position (subsequent drops offset by +24,+24 each) |
| F2 | The dropped file's bytes are written to `<BOARD_DIR>/assets/<ULID>.<ext>` via the `asset:write` IPC handler. The returned `assetId` is the only image reference stored in `state` — base64 in board.json is forbidden |
| F3 | When `state.assetId` is non-null, the body renders `<img src="krnl-asset://<assetId>">`. When null, the body renders the legacy SVG/ASCII placeholder |
| F4 | `state` includes `assetId: string \| null`, `naturalWidth: number \| null`, `naturalHeight: number \| null`, `mimeType: string \| null`, `alt?: string`, `width?: number`, `height?: number` |
| F5 | A `<NodeResizer>` is rendered with `isVisible={selected}`, `minWidth=120`, `minHeight=80`, `maxWidth=1200`, `maxHeight=1200`. When `Shift` is held during resize, aspect ratio is preserved using `naturalWidth/naturalHeight`. On `onResizeEnd`, dispatch `image.setSize` |
| F6 | When the node is selected and the user clicks a replace control, a hidden `<input type="file" accept="image/*">` opens. Selecting a new file writes a new asset and dispatches `image.setAsset` with the new fields (old assetId is left on disk — no GC in v1) |
| F7 | A caption row below the image shows `state.alt`; clicking it mounts an `<input>`; on blur or `Enter`, dispatches `image.setAlt` |
| F8 | Files larger than 25 MB are rejected; files of disallowed MIME types are rejected. Rejection logs `console.warn` and does NOT create a node |
| F9 | `sys image add <abs-path> [--at x,y]` reads the file, validates it, copies it into `assets/`, and creates an ImageNode. `sys image replace <id> <abs-path>` swaps the asset. `sys image resize <id> --w N --h N` resizes. `sys image clear <id>` nulls the assetId |
| F10 | React Flow `<Handle>` (target Left, source Right) are rendered with `isConnectable={true}` so the node can connect to/from other non-mother nodes |
| F11 | If `state.assetId` references a file that has been deleted from disk, the `<img>` `onError` swaps in the placeholder visual instead of crashing |

---

## Non-Functional Requirements

| # | Requirement |
|---|---|
| NF1 | Dropping a 20 MB JPG completes (asset write + node creation + persist) in under 500 ms on a developer laptop |
| NF2 | SVG inputs are scanned for `<script`, `onload=`, `onerror=` (case-insensitive) and rejected if any are present (XSS hardening) |
| NF3 | The `asset:write` IPC handler validates magic bytes per ext (PNG `89 50 4E 47`, JPEG `FF D8 FF`, GIF `47 49 46 38`, WEBP `52 49 46 46 ... 57 45 42 50`, SVG starts with `<?xml` or `<svg`). Mismatched bytes are rejected |
| NF4 | The `krnl-asset://` protocol is registered as `standard: true, secure: true` BEFORE `app.whenReady()` so Chromium treats responses as same-origin |
| NF5 | All `state` shape is JSON-serializable. The legacy `src` field is tolerated as `string \| null` for old boards but is never written |

---

## Use Cases

**UC-G1 — Drop an image**
Actor drags `photo.png` from their file explorer onto the canvas. An ImageNode appears with the image rendered.

**UC-G2 — Resize an image**
Actor selects the node and drags the resize handle. With Shift held, aspect ratio is preserved.

**UC-G3 — Replace an image**
Actor selects the node, clicks the replace overlay, picks a new file. The image swaps; the old assetId becomes orphaned on disk.

**UC-G4 — Edit alt text**
Actor clicks the caption. An input appears. Actor types, blurs. Caption updates and persists.

**UC-G5 — Connect an image**
Actor drags from the image's right handle to the target handle of any non-mother node. A `link` edge is created.

**UC-G6 — Add via CLI**
Actor runs `sys image add C:/photos/diagram.svg --at 0,0`. The file is copied into `assets/` and a node appears.

---

## User Stories

- As a user, I want to drop an image from my desktop directly onto the canvas so I can reference visuals without uploading anywhere.
- As a user, I want my images to persist across restarts so I don't lose my workspace.
- As a user, I want SVG support so my diagrams stay crisp at any zoom.
- As a user, I want my images stored as real files (not base64) so my board.json stays small and shareable.
- As a user, I want to resize images visually so I can lay out the canvas like a moodboard.
- As a user, I want CLI parity so Claude Code can add images programmatically.

---

## Gherkin Scenarios (ATDD)

```gherkin
Feature: ImageNode drag-drop, persistent, resizable, connectable

  Background:
    Given an empty board

  Scenario: F1 — Drop a PNG creates a node
    When the user drops a PNG file at screen position (300, 400)
    Then exactly one new node with kind "image" is added to the board
    And its position is the world-space projection of (300, 400)

  Scenario: F1b — Drop two files creates two offset nodes
    When the user drops two PNG files at the same screen position
    Then two new image nodes are added
    And the second node's position is the first node's position plus (24, 24)

  Scenario: F2 — Asset is written to disk, not base64
    Given the user drops a PNG of byte length N
    When ingestion completes
    Then the file at "<BOARD_DIR>/assets/<assetId>.png" exists with byte length N
    And the node's state.assetId matches /^[A-Z0-9]{20,32}$/
    And board.json does NOT contain any "data:image" substring

  Scenario: F3 — Render uses the krnl-asset protocol
    Given an ImageNode with state.assetId "01HX0000000000000000000000"
    When the component renders
    Then an <img> element exists with src "krnl-asset://01HX0000000000000000000000"

  Scenario: F3b — Null assetId renders placeholder
    Given an ImageNode with state.assetId null
    When the component renders
    Then no <img> element is rendered
    And the placeholder SVG / ASCII art is visible

  Scenario: F5 — Resize dispatches image.setSize
    Given an ImageNode is selected with naturalWidth 800 naturalHeight 600
    When the user resizes via NodeResizer to width 400 height 300
    Then onCommand is called with { type: "image.setSize", width: 400, height: 300 }

  Scenario: F6 — Replace dispatches image.setAsset with new fields
    Given an ImageNode has state.assetId "OLD" and is selected
    When the user picks a new PNG via the replace input
    Then asset:write is called with the new file's bytes
    And onCommand is called with { type: "image.setAsset", assetId: <new>, ... }
    And the old file at "assets/OLD.png" is NOT deleted

  Scenario: F7 — Alt edit dispatches image.setAlt
    Given an ImageNode is selected with alt "diagram"
    When the user clicks the caption, types "v2 diagram", and blurs
    Then onCommand is called with { type: "image.setAlt", alt: "v2 diagram" }

  Scenario: F8 — Oversize file rejected
    When the user drops a 30 MB PNG
    Then no new node is added
    And asset:write either is not called OR rejects

  Scenario: F8b — Unsupported MIME rejected
    When the user drops a BMP file
    Then no new node is added

  Scenario: F9 — sys image add copies the file
    Given a file exists at "C:/tmp/sample.png"
    When `sys image add C:/tmp/sample.png --at 50,60` runs
    Then "<BOARD_DIR>/assets/" contains one new PNG
    And board.json has a node with kind "image" at position {50, 60}

  Scenario: F10 — Handles are connectable
    When the component renders
    Then a React Flow Handle with type "target" position "left" isConnectable=true is present
    And a React Flow Handle with type "source" position "right" isConnectable=true is present

  Scenario: F11 — Missing asset renders gracefully
    Given an ImageNode references assetId "MISSING" with no file on disk
    When the component renders
    Then the <img> onError handler swaps the body to the placeholder visual
    And the React tree does not throw
```

---

*Last updated: 2026-05-12*
