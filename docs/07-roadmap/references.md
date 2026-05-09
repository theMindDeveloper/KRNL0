# krnl0 — Research & References

*Extracted from PRD v0.6.0 §16*
*For the Aug 3 documentation submission*

---

## Influences and competitive analysis

### 1. Obsidian
Local-first, file-based personal knowledge management.

**Influence on krnl0:**
- Filesystem-as-source-of-truth (`board.json` mirrors Obsidian's markdown-file approach)
- Project-folder-with-instructions (`CLAUDE.md` in the source folder)
- Markdown sidecars for the Journal node (v1.5)
- "Yours to own" philosophy

**Where we diverge:** Obsidian is page-based. krnl0 is spatial. Obsidian's graph view is a read-only visualization. Our canvas is the primary interface.

---

### 2. Miro / FigJam
Infinite canvas collaboration tools.

**Influence on krnl0:**
- Canvas interaction model (pan, zoom, drag nodes, connect with edges)
- Visible connections as a first-class concept

**Where we diverge:** Miro has no backbone — nodes float freely with no semantic structure. We anchor mother nodes. The canvas has a center of gravity. Also: Miro is multiplayer-first; we are local-first.

---

### 3. Notion
Block-based all-in-one productivity tool.

**Influence on krnl0:** Counter-example.

Notion buries everything in nested pages. Information is hierarchical and hidden. krnl0 surfaces everything spatially — your Pomodoro, todos, and habits are always visible at a glance, not buried three clicks deep.

Notion has no native programmable surface. Our `sys` CLI is.

---

### 4. Iron Man / J.A.R.V.I.S.
Voice-first ambient assistant in the Marvel universe.

**Influence on krnl0:**
- The orb interaction model (always present, always listenable, speaks back)
- The idea that AI should operate the same tools the user operates, not have special powers

---

### 5. Loop Habit Tracker
Android app for minimalist habit tracking.

**Influence on krnl0:**
- Habit mother node visual density (compact 7-day grid, high information per pixel)
- Streak display design

---

## Academic references

### Primary NUI course readings

- **Wigdor, D. & Wixon, D.** (2011). *Brave NUI World: Designing Natural User Interfaces for Touch and Gesture*. Morgan Kaufmann.
  - Influence: embodied input principles, the distinction between natural and gestural interfaces

- **Dourish, P.** (2001). *Where the Action Is: The Foundations of Embodied Interaction*. MIT Press.
  - Influence: the argument that the body and environment are part of cognition, not separate from it. Voice input as embodied — the user is physically in the interaction, not mediated by a cursor.

### Inclusive design

- **Microsoft Inclusive Design Toolkit** — three modalities (permanent, temporary, situational disability). Our three-modality model (voice, visual, keyboard) maps directly to this framework.

- **WCAG 2.1** — Web Content Accessibility Guidelines. Basis for the color contrast (`--high-contrast`), keyboard navigation, and focus management requirements.

### Architecture

- **Gamma, E. et al.** (1994). *Design Patterns: Elements of Reusable Object-Oriented Software*. Addison-Wesley.
  - Strategy, Factory, Facade, Observer — all used directly.

- **Fowler, M.** (2018). *Refactoring: Improving the Design of Existing Code* (2nd ed.). Addison-Wesley.
  - Dependency injection, interface-based design, testability by seam.
