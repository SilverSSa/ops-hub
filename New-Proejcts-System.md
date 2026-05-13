# Project Board — Full Build Plan
> Handoff document for AI-assisted implementation. Read this fully before generating any code or task breakdown.

---

## Product Goal

Replace the current multi-page project workspace with a **single-page, canvas-first project operating system** that outperforms Jira, Linear, and Notion by treating the board as the primary surface — not a sub-feature. Every interaction, tool, and AI capability lives in one unified screen.

---

## Core Design Principles

- One project = one platform screen
- The board/canvas is the home, not a page you navigate to
- The architecture diagram is a **feature inside the main board**, not a separate project page
- Middle-mouse hold pans the board (no accidental selection during pan)
- All major actions available as compact icon buttons — no heavy form menus
- Context panel on the right updates based on selected item, but is NOT the only editing path
- Direct on-canvas actions always exist alongside the panel
- Modern, premium, minimal feel — engineering-first, not decorative
- Autosave silently in background with visible save status
- No clutter, strong hierarchy, comfortable spacing

---

## Platform Layout (Single Screen)

```
┌──────────────────────────────────────────────────────────────┐
│  [Tool Rail - left, compact icon+label]                      │
│  ┌──────────────────────────────────────────────┐  ┌───────┐ │
│  │                                              │  │ Right │ │
│  │         Main Canvas / Board                  │  │ Panel │ │
│  │         (infinite-feel, draggable blocks)    │  │       │ │
│  │         Middle mouse pans                    │  │ (ctx) │ │
│  │                                              │  │       │ │
│  └──────────────────────────────────────────────┘  └───────┘ │
└──────────────────────────────────────────────────────────────┘
```

### Tool Rail (left, compact)
Buttons only — icon + short label. Items:
- `+ Note`
- `+ Task`
- `+ Phase`
- `+ Block`
- `+ Diagram Node`
- `AI Review`
- `Validate`
- `Review Scripts`
- `Export`
- `Settings`

### Right Context Panel
Changes based on selected item:
- Node editor (name, type, responsibility, fields, methods, notes)
- Link editor
- Task editor
- Note editor
- AI details / results panel
- Settings panel

Panel must NOT be the only path to edit. On-canvas inline editing must always exist.

---

## Phase 1 — Foundation: Single-Page Canvas Platform

**Goal:** Destroy the multi-page structure. One shell. One screen.

### Tasks

#### 1.1 — Unified Layout Shell
- Remove all existing multi-page routes for the project workspace
- Replace with a single full-screen platform shell component
- No top navigation between pages — everything is rendered in one view
- The shell has three zones: Tool Rail (left), Main Canvas (center), Context Panel (right)
- Context panel should be collapsible
- **Acceptance criteria:** Opening a project loads exactly one screen. No page navigation exists inside the project.

#### 1.2 — Middle-Mouse Canvas Pan
- Implement middle-mouse button hold to pan the main board surface
- While panning: no drag events fire on board items, no accidental selection
- Pan must feel smooth — use pointer capture or equivalent
- No momentum required for v1, but movement must not feel laggy
- **Acceptance criteria:** Holding middle mouse and moving the mouse pans the canvas. Releasing stops pan. No items are accidentally selected or moved during pan.

#### 1.3 — Compact Tool Rail
- Left-side vertical rail with small icon + label buttons
- Buttons: `+ Note`, `+ Task`, `+ Phase`, `+ Block`, `+ Diagram Node`, `AI Review`, `Validate`, `Review Scripts`, `Export`, `Settings`
- No dropdowns or expanded menus from the rail — clicking an action either triggers immediately or opens the context panel
- Destructive actions are visually separated
- **Acceptance criteria:** All major actions are reachable from the rail in 1 click. Rail never expands into a heavy menu.

#### 1.4 — Right Context Panel
- Slide-in panel on the right side
- Updates automatically when the user selects a node, task, note, link, or block
- Shows relevant editor fields for the selected item
- Has a close/collapse button
- Does not block canvas interaction when open (overlay or side-by-side, not modal)
- **Acceptance criteria:** Selecting any item on the canvas updates the panel. Panel can be closed. Panel does not prevent canvas interaction.

#### 1.5 — Autosave + Save Status
- Save project state to backend silently in the background
- Show a small, non-intrusive save status indicator (e.g. "Saved", "Saving...", "Offline — saved locally")
- Local storage fallback if backend is unreachable
- Save triggers: after any edit, after a short idle period (debounced)
- **Acceptance criteria:** Changes are never lost. User always knows the save state. Works offline with local fallback.

---

## Phase 2 — Board: Infinite Draggable Canvas Widgets

**Goal:** Make the board the real center — a draggable, infinite-feel canvas of purpose-built widgets.

### Tasks

#### 2.1 — Draggable Block System
- Every widget on the board is a draggable card/block
- Blocks can be moved freely anywhere on the canvas surface
- Block positions are stored per-project and restored on next open
- Blocks do not snap to grid in v1 (free placement)
- **Acceptance criteria:** All blocks are independently draggable. Positions persist across sessions.

#### 2.2 — Block Type Library
Implement all of the following block types as distinct draggable widgets:

| Block Type | Description |
|---|---|
| Note | Free text note |
| Checklist | Ordered checklist with completion tracking |
| Execution Queue | Ordered queue of work items with status |
| Phase Tracker | Shows phases with status (planned/in progress/done) |
| Architecture Summary | Text + optional link to diagram |
| AI Review Summary | Displays latest AI review output |
| Validation Summary | Displays latest validation result |
| Script Review Summary | Displays latest script review result |
| Risks / Assumptions | Two-column: risks and assumptions |
| Metrics | Key/value pairs for success metrics |
| Release Notes | Structured release note entries |

**Acceptance criteria:** All block types can be added from the tool rail, edited inline, and removed.

#### 2.3 — Inline Block Editing
- Clicking a block's content area enters edit mode in-place
- No modal dialogs for routine edits
- Pressing Escape or clicking outside exits edit mode and saves
- Rich text not required for v1 — plain text with line breaks is sufficient
- **Acceptance criteria:** All block content is editable by clicking directly on the block. No modals.

#### 2.4 — Block Quick Actions
- Hovering a block reveals a compact action bar (icon buttons only):
  - Edit
  - Duplicate
  - Link to diagram node
  - Delete
- Destructive (Delete) is visually separated or requires confirm
- **Acceptance criteria:** All block actions reachable on hover in 1 click. No heavy menus.

#### 2.5 — Block-to-Diagram Node Linking
- Any block can be linked to one or more diagram nodes
- A small link indicator appears on the block when linked
- Clicking the link indicator highlights the linked node(s) in the diagram view
- **Acceptance criteria:** Blocks can be linked to nodes. Clicking the link indicator shows the connection visually.

#### 2.6 — Layout Persistence + Reset
- Board layout (all block positions) is autosaved per project
- A "Reset Layout" option in Settings snaps all blocks back to a clean default grid arrangement
- **Acceptance criteria:** Layout survives page refresh. Reset option works and returns to sensible default.

---

## Phase 3 — Diagram Builder: Architecture-First Node Editor

**Goal:** The diagram is a first-class part of the platform — a real architecture canvas, not a side feature.

### Node Types (all must be supported)

| Type | Visual Style |
|---|---|
| Class | Solid border |
| MonoBehaviour | Accent color |
| Manager | Bold border |
| Service | Rounded |
| Interface | Dashed border |
| System | Large container |
| ScriptableObject | Diamond accent |
| Controller | Medium |
| Repository | Cylinder-like |
| Pipeline | Arrow-shaped |
| Scene | Wide container |

### Link / Relationship Types (all must be supported)

`calls`, `owns`, `uses`, `injects`, `inherits`, `implements`, `publishes-to`, `subscribes-to`, `updates`, `reads-from`, `writes-to`, `triggers`

Each link type must have a visible label on the connection line.

### Tasks

#### 3.1 — Full Node Type System
- Implement all node types listed above as distinct visual styles
- Each node type has a clear visual differentiator (shape, color, border style)
- Node type is always visible at a glance without reading the label
- **Acceptance criteria:** All 11 node types render distinctly. Type is identifiable without reading text.

#### 3.2 — Full Link Type System
- Implement all 12 relationship/link types
- Each link has a visible text label showing its type
- Links are styled distinctly enough to tell apart (line weight, dash, arrow style)
- **Acceptance criteria:** All 12 link types work. Labels visible on links.

#### 3.3 — Node Inline Editor
- Clicking a node opens an inline editor (not a side panel only)
- Editable fields per node:
  - Name
  - Type (dropdown)
  - Responsibility (text)
  - Fields (list)
  - Methods / Functions (list)
  - Notes (text)
- Changes apply immediately on the diagram
- **Acceptance criteria:** All node fields editable by clicking the node directly on canvas.

#### 3.4 — Direct Link Creation on Canvas
- Click a node → a "Link" action appears
- User clicks the target node to create the connection
- A quick relation picker appears (dropdown/popover) to choose link type
- Optional: add a note to the link inline
- No side-panel-only path for creating links
- **Acceptance criteria:** Full link creation flow works entirely on canvas without opening the context panel.

#### 3.5 — Diagram Pan + Free Node Movement
- Middle-mouse pan on diagram surface (same behavior as board)
- Node drag: click and drag a node to reposition it
- No accidental pan triggers during node drag, and vice versa
- **Acceptance criteria:** Pan and node drag work without conflicting. Middle mouse = pan always.

#### 3.6 — Node and Link Visual Polish
- Consistent visual language across all node types and link types
- Nodes: colored by type, clear hierarchy between name / type label / subtitle
- Links: labeled, styled by relation type, arrows show direction
- No visual clutter — labels non-intrusive but readable
- **Acceptance criteria:** Diagram looks like a professional architecture tool, not a generic graph library output.

---

## Phase 4 — AI Copilot: 3-Step Review Cycle

**Goal:** An active architecture copilot built into the normal workflow — not a chat sidebar bolted on.

### AI 3-Step Workflow

```
Step 1: Suggest
  └── AI reviews diagram → identifies most important issue
      → proposes exact nodes, links, methods, responsibilities

Step 2: Validate
  └── AI compares current diagram against its saved suggestions
      → reports what passed, what failed, what to fix next

Step 3: Script Review
  └── AI compares pasted code/scripts against diagram + prior suggestions
      → identifies mismatches, missing methods, wrong ownership
```

### Data to Persist in Project State (required for 3-step to work)

- `latestAssessment` — full text of latest AI review
- `latestSuggestedEdits` — structured list of suggested changes
- `latestValidationResult` — pass/fail/next-fixes from step 2
- `latestScriptReviewResult` — mismatch report from step 3
- `aiConversationMessages` — full conversation history
- `aiLocale` — `en` or `ar`
- `preservedTerms` — list of developer terms to never translate
- `lastMission` — last mission text input
- `lastPastedScripts` — last script content submitted for review

### Tasks

#### 4.1 — AI Mission Panel
- Compact collapsible panel (accessible from tool rail)
- Fields:
  - Mission text (textarea)
  - Response language toggle: English / Arabic
  - Preserve developer terms (editable list: Player, MonoBehaviour, GameManager, etc.)
  - Scripts input zone (paste C# code or JSON)
  - Conversation history display
  - Notifications area
  - Saved suggestions display
  - Validation results display
  - Script review results display
- **Acceptance criteria:** All fields present. Panel opens/closes from tool rail. Does not block canvas.

#### 4.2 — Step 1: Architecture Suggest
- Triggered from tool rail "AI Review" button
- AI always begins by stating what it is going to do
- AI identifies the single most important architecture issue
- AI proposes exact improvements with specific names (nodes, links, methods)
- Output saved to `latestAssessment` and `latestSuggestedEdits`
- **Acceptance criteria:** AI output references exact node names and proposed changes. Result persisted in project.

#### 4.3 — Step 2: Validate Edits
- Triggered from tool rail "Validate" button
- AI compares current diagram state against `latestSuggestedEdits`
- Output: what passed, what failed, what to fix next — with exact node/link references
- Output saved to `latestValidationResult`
- **Acceptance criteria:** Validation references prior suggestions by name. Cannot run without a prior Step 1 result.

#### 4.4 — Step 3: Script Review
- Triggered from tool rail "Review Scripts" button
- AI reads: pasted scripts + current diagram + `latestSuggestedEdits`
- Identifies:
  - Missing methods (by name)
  - Wrong ownership (which class owns what)
  - Wrong dependency direction
  - Script responsibility drift
  - Mismatch between code and suggested architecture
- Output references exact class names, method names, fields, links
- Output saved to `latestScriptReviewResult`
- **Acceptance criteria:** Script review references exact identifiers from code and diagram. Cannot run without prior Step 1 or 2 result.

#### 4.5 — Conversation History + Saved Suggestions
- All AI messages displayed in chronological order in the panel
- Saved suggestions shown as a distinct section (not mixed with conversation)
- Validation and script review results each have their own section
- All data loaded from project state on panel open — no re-querying required
- **Acceptance criteria:** Closing and reopening the panel shows all prior AI work. Nothing is lost between sessions.

#### 4.6 — Arabic + English Language Support
- Response language toggle in the panel switches AI output language
- When Arabic is selected, all explanations and review text are in Arabic
- The following terms are NEVER translated regardless of language setting:
  - All class names and script names
  - `Player`, `MonoBehaviour`, `GameManager`, `Subject`
  - `API`, `CI/CD`, `DevOps`
  - All code identifiers and field names
- Preserved terms list is user-editable
- **Acceptance criteria:** Arabic mode produces Arabic text. All developer identifiers remain in English.

---

## Phase 5 — PM Layer + DevOps Layer + Final Polish

**Goal:** Support the full range of thinking — engineering, product, and operations — in one platform.

### Tasks

#### 5.1 — PM Widget Suite
Add the following purpose-built PM blocks to the block type library:

| Block | Purpose |
|---|---|
| Problem Statement | What problem are we solving |
| Project Goal | The outcome we want |
| Target Users | Who this is for |
| Scope | What's in / out |
| Success Metrics | How we measure success |
| Assumptions | What we're assuming is true |
| Risks | What could go wrong |
| Release Scope | What ships in this release |
| Roadmap | High-level timeline of stages |
| Launch Checklist | Go/no-go checklist before release |

**Acceptance criteria:** All PM blocks available in tool rail. Each has an appropriate layout and fields.

#### 5.2 — DevOps Modeling Support
Add new node types to the diagram builder for DevOps modeling:

| Node Type | Represents |
|---|---|
| Service | A running service or microservice |
| Infra | Infrastructure resource (server, DB, queue) |
| Pipeline | CI/CD pipeline stage |
| Observability | Monitoring, logging, alerting component |

Add DevOps-specific modeling concepts:
- Deployment stages (dev / staging / prod)
- Rollback stages
- Environment boundaries (dashed container rects)
- Ownership boundaries (team ownership labels)

**Acceptance criteria:** All 4 new node types work in the diagram builder. Environment boundaries and ownership labels render correctly.

#### 5.3 — DevOps AI Review Layer
When DevOps nodes are present in the diagram, AI review (Step 1) should additionally cover:
- CI/CD flow correctness
- Deployment dependencies (order, blocking)
- Rollback path (is one defined?)
- Logging / monitoring visibility (are observability nodes connected?)
- Coupling between application and infrastructure
- Missing operational layers (e.g. no observability, no rollback defined)

**Acceptance criteria:** AI review produces DevOps-specific findings when relevant node types are present.

#### 5.4 — Keyboard Shortcuts
Implement the following shortcuts:

| Shortcut | Action |
|---|---|
| `Space` (hold) | Pan mode toggle |
| `N` | Add new Note block |
| `T` | Add new Task block |
| `D` | Add new Diagram Node |
| `A` | Open AI Mission Panel |
| `Ctrl+S` / `Cmd+S` | Force save |
| `Ctrl+Z` / `Cmd+Z` | Undo |
| `Ctrl+Shift+Z` / `Cmd+Shift+Z` | Redo |
| `?` | Open shortcut reference overlay |
| `Escape` | Deselect / close panel |

**Acceptance criteria:** All shortcuts work. `?` key shows a compact reference overlay listing them all.

#### 5.5 — Export System
Support the following export options (accessible from tool rail "Export" button):

| Export | Format | Contents |
|---|---|---|
| Diagram | PNG or SVG | Current diagram, no UI chrome |
| Board | PDF | All visible board blocks laid out cleanly |
| Full project snapshot | JSON | All project data: nodes, links, blocks, AI history, tasks, phases |

**Acceptance criteria:** All three export types produce clean, usable files. No UI chrome in visual exports.

#### 5.6 — Visual Polish Pass
Final design pass covering:
- Typography hierarchy consistency (heading sizes, weight, line-height)
- Spacing consistency across all panels, blocks, and toolbars
- Contrast check — all text readable in both light and dark mode
- Transition smoothness — panel open/close, block drag, hover states
- Dark mode complete — no hardcoded colors anywhere
- Premium feel check — the platform must feel like a real professional tool

**Acceptance criteria:** Platform reviewed against all items above. No obvious design inconsistencies remain.

---

## Data Model Reference

All of the following must be saved per project and restored on open:

```
project
├── identity (id, name, created, updated)
├── board
│   ├── blocks[] (type, position, content, linkedNodeIds)
│   └── layout (block positions map)
├── diagram
│   ├── nodes[] (id, type, name, responsibility, fields, methods, notes, position)
│   └── links[] (id, sourceNodeId, targetNodeId, type, note)
├── ai
│   ├── latestAssessment
│   ├── latestSuggestedEdits
│   ├── latestValidationResult
│   ├── latestScriptReviewResult
│   ├── conversationMessages[]
│   ├── locale (en | ar)
│   ├── preservedTerms[]
│   ├── lastMission
│   └── lastPastedScripts
├── tasks[]
├── phases[]
├── notes[]
├── pictures[]
├── pm (problemStatement, goal, targetUsers, scope, metrics, assumptions, risks, releaseScope, roadmap, launchChecklist)
└── devops (serviceNodes[], infraNodes[], pipelineNodes[], environments[], ownerships[])
```

---

## Build Order (recommended)

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5
   ↓          ↓          ↓          ↓          ↓
Shell &    Board &    Diagram    AI 3-step   PM/DevOps
layout     blocks     builder    cycle       + polish
```

Do not start Phase 2 before Phase 1 is stable. Do not start Phase 4 before Phase 3 is stable — the AI review needs a working diagram to review.

---

## Success Criteria

The rebuild is complete when:

- [ ] Opening a project feels like entering a real project operating system
- [ ] The board is the main home — not a sub-page
- [ ] Middle-mouse panning works naturally on both the board and diagram surfaces
- [ ] Diagram editing is fast — direct on-canvas actions, no panel-only paths
- [ ] AI review feels active and contextual — each step builds on the previous
- [ ] Validation and script review are part of the normal workflow, not separate tools
- [ ] A user can think and work as: software engineer, Unity architect, product manager, DevOps learner — all in the same session
- [ ] The platform helps job-ready thinking, not just note-taking
