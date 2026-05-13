# Project Restoration Document — SilverSa DevHub (ops-hub)

> **Status:** Files were found empty on May 12, 2026 and restored from `ops-hub.rar` (May 9 backup).
> The RAR contained an **older version** (index.html: 5,586 lines, server.js: 1,784 lines).
> A much larger version (~14,500 lines total) had been built between May 9-12 but was lost.
> **Rebuild in progress** — index.html now 6,176 lines, server.js now 1,885 lines (8,061 total).
> All Phase 1 shell, diagram builder, AI assessment, glass CSS, backend routes, keyboard shortcuts,
> node visual types, hover actions, and block-to-diagram linking have been recreated.

---

## FILE INDEX

| File | May 9 (RAR) | Lost | Current | Added | Notes |
|---|---|---|---|---|---|
| `public/index.html` | 5,586 | ~9,475 | **6,176** | +590 | Shell, diagram, AI, glass, shortcuts, node styles, actions, linking |
| `server.js` | 1,784 | ~5,051 | **1,885** | +101 | diagram-assess, diagram-ai routes |
| `public/app.js` | ~200 | ~200 | ~200 | — | Intact |
| `public/styles.css` | ~150 | ~150 | ~150 | — | Intact |
| `restore.md` | — | — | **757** | — | This document |

---

## SECTION 1: WHAT IS IN THE RESTORED CODE (May 9 version)

### 1A. DevHub Core Architecture

**Server:** Express.js on port 2223
- D1 (Cloudflare D1) database for all CRUD
- R2 (Cloudflare R2) for file storage and backups
- n8n webhook integration for AI
- Basic Auth middleware (SilverSa / Xd123Xd123@)
- Telegram bot bridge for chat

**Client:** Single-page app, vanilla HTML/CSS/JS
- Light/Dark theme system
- Modal dialog system (openModal, closeModal, showConfirm, showPrompt, appDialog)
- Toast notification system (notify())
- Offline/localStorage fallback for all API operations
- Retry queue for pending operations
- Markdown renderer (renderMD)
- Search system

### 1B. Navigation & App Shell

| Component | Details |
|---|---|
| Modes | `sources` (dev resources) and `projects` (project management) |
| Sub-sections (projects mode) | gdds, fproj, sites, storage, vocab, commands, apps |
| Sidebar | Category list, quick access pins, mobile hamburger toggle |
| Breadcrumb | Hub > Category > Sub navigation |
| Topbar | Logo, mode switch, API URL, chat/search/theme/admin buttons |

### 1C. Sources / Link Management

**Categories CRUD:** `GET/POST /api/categories`, `PUT/DELETE /api/categories/:id`
**Subcategories CRUD:** `GET/POST /api/subcategories`, `PUT/DELETE /api/subcategories/:id`
**Links CRUD:** `GET/POST /api/links`, `PUT/DELETE /api/links/:id`
**Features:** Icon picker, color picker, markdown content viewer for links, search-by-name

### 1D. GDD Editor (Game Design Documents)

**CRUD:** `GET/POST /api/gdds`, `PUT/DELETE /api/gdds/:id`
**Modes:** Read view (full markdown render) and Edit view (split pane: editor + live preview)
**Features:**
- Markdown toolbar (B, I, H1-H3, divider, blockquote, bullet, numbered, code, link, table)
- Debounced autosave (800ms) to D1
- localStorage draft capture
- R2 backup versions (list, restore)
- Download markdown as .md file
- Full markdown parser supporting: headings H1-H6, tables, blockquotes, ordered/unordered lists, fenced code blocks, horizontal rules, inline formatting

### 1E. Future Projects OS

**CRUD:** `GET/POST /api/projects`, `PUT/DELETE /api/projects/:id`
**Data model per project:**
```
project {
  id, title, description, status, priority, tags[], phases[], board{ tasks[], pictures[], canvas[], notes }
}
```

**Project List View:**
- Hero section with average progress stat
- Search/filter bar
- Stats strip (total projects, phases complete, tasks complete, in motion)
- Status lane columns (idea, planning, in-progress, on-hold, done)
- Project cards with progress ring, description, next phase, tasks count, tags
- Drag-and-drop between status lanes

**Project Workspace (Multi-page):**
- Left navigation rail: Board, Overview, Phases, Tasks, Diagram, Pictures
- Board page: Canvas with draggable blocks (note, checklist, phases list, task table)
- Overview page: Project details editor (title, status, priority, tags, description)
- Phases page: Checklist with add/edit/delete
- Tasks page: Task list with checkboxes and inline editing
- Diagram page: (placeholder - "Open Diagram Builder" button)
- Pictures page: Image grid with URL input

**Canvas blocks:**
- Draggable by handle with pointer capture
- Types: note (free text), checklist ([x] lines), phases (checklist), tasks (table)
- Auto-seeded on first open
- Autosave on drag end

### 1F. Sites Dashboard

**Features:** Cloudflare DNS proxy + custom sites CRUD, grid layout

### 1G. Storage (R2 File Browser)

**Routes:** `GET/PUT/DELETE /api/files`, `GET /api/files/download`
**Features:** File grid, upload, delete, create folders, download files

### 1H. Vocabulary System

**D1 Table:** `vocab(id, word, translation, example, source_lang, target_lang, tags)`
**CRUD:** `GET/POST /api/vocab`, `PUT/DELETE /api/vocab/:id`
**Chat Commands:** `#add`, `#list`, `#search` (with n8n enrichment for translations)
**UI Features:** Vocab reader modal, copy to clipboard, text-to-speech button

### 1I. Commands & Apps

**Commands:** `GET/POST /api/commands`, `PUT/DELETE /api/commands/:id`, `POST /api/commands/run`
**Apps:** `GET/POST /api/apps`, `PUT/DELETE /api/apps/:id`, `POST /api/apps/launch`

### 1J. Knowledge Graph

**Features:** Overlay graph visualization of categories, subs, projects, and GDDs with SVG edges and draggable nodes

### 1K. AI Chat System

**Backend:**
- `POST /api/ai/chat` — sends to n8n webhook (N8N_AI_WEBHOOK_URL), gets structured response
- `GET /api/ai/chat/poll` — polls chat_bridge table for Telegram-bridged messages
- Fallback to OpenAI gpt-4o-mini
- PENDING_ACTIONS map for yes/no confirmation flows
- Tool action executor: create_gdd, rename_gdd, append_gdd, create_project, set_project_status, add_phase, create_category, add_link, navigate, refresh_sources, refresh_projects, clean_backups, storage_info
- AI can be configured to speak Arabic or English

**Client:**
- Slide-in chat window
- Message bubbles with inline action buttons
- Confirmation messages (accept/reject)
- Polling for cross-device messages (Telegram bridge)
- AI can trigger navigation and UI actions

---

## SECTION 2: WHAT EXISTED IN THE LARGER VERSION (~9,400 lines, LOST)

This section documents code that was read from the larger `index.html` during the session
but is NOT in the restored May 9 backup. It represents significant work done between May 9 and today.

### 2A. Single-Screen Project Shell (Phase 1 of New-Proejcts-System.md)

**State variables added to ~9400-line version:**

```javascript
let FP_PAGE = 'board';                    // 'board' or 'diagram'
let FP_CONTEXT_MODE = 'selection';        // 'selection', 'diagram', 'ai', 'export', 'settings'
let FP_CONTEXT_COLLAPSED = false;
let FP_SELECTED_CANVAS_ID = null;
let FP_DIAGRAM_SELECTED_NODE_ID = null;
let FP_DIAGRAM_SELECTED_LINK_ID = null;
let FP_DIAGRAM_LINK_DRAFT = null;        // Active link draft {from, relation, note}
```

**Layout:** 3-zone grid shell replacing the old multi-page workspace:
```
[Tool Rail (left, 236px)] [Main Board/Diagram (center)] [Context Panel (right, 332px)]
```

**Core rendering functions (LOST):**
- `renderProjectBoard(c)` — Main shell renderer, replaces old multi-page system
- `renderProjectRail(p)` — Left tool rail with icon buttons
- `renderBoardFocusSurface(p)` — Board view with canvas
- `renderDiagramFocusSurface(p)` — Diagram view with SVG overlay and draggable nodes
- `renderProjectContextPanel(p)` — Right panel dispatcher (selection/diagram/ai/export/settings)
- `renderBoardSelectionPanel(p)` — Context panel for selected canvas items
- `renderDiagramContextPanel(p)` — Node/link inspector in diagram mode
- `renderProjectExportPanel(p)` — Export panel template
- `renderProjectSettingsPanel(p)` — Settings panel template
- `renderDiagramAiPanel(p)` — AI mission panel with history, notifications, tasks, schedule
- `renderDiagramAssessment(p)` — AI assessment results with score, hints, risks, suggestions

**Navigation functions (LOST):**
- `focusProjectBoard()` — Switches to board focus, clears diagram selection
- `focusProjectDiagram()` — Switches to diagram focus, triggers assessment
- `openProjectContext(mode)` — Opens context panel in specific mode
- `toggleProjectContextPanel(force)` — Collapses/expands the context panel
- `clearProjectSelection()` — Deselects everything
- `selectCanvasItem(id)` — Selects a canvas block
- `addProjectDiagramNodeFromRail()` — Quick-adds a class node in diagram

### 2B. Diagram Builder (Phase 3 subjects)

**Data model (per project):**
```javascript
p.board.diagram {
  domain: 'software-classes' | 'unity-classes' | 'unity-systems' | 'product-flow' | 'devops-flow',
  nodes: [{ id, name, type, responsibility, fields, methods, notes, x, y, w, h }],
  links: [{ id, from, to, relation, note }],
  assessment: { source, score, summary, hints[], risks[], suggestedNodes[], suggestedLinks[], suggestedFunctions[], nextSteps[] },
  ai: {
    messages[], notifications[], tasks[], schedule[], buttons[],
    edits: { suggestedNodeEdits[], suggestedLinkEdits[], suggestedFunctionEdits[] },
    validation: { status, whatPassed[], whatFailed[], nextFixes[] },
    scriptReview: { status, summary, matchesDiagram, issues[], recommendedChanges[] },
    previousSuggestions: { suggestedNodeEdits[], suggestedLinkEdits[], suggestedFunctionEdits[] },
    locale: 'en' | 'ar',
    preserveTerms: 'Player, Subject, MonoBehaviour, GameManager, API, CI/CD, DevOps',
    mission: '',
    scripts: '',
    status: 'ready'
  }
}
```

**Node types:** class, monobehaviour, manager, service, interface, system, scriptable-object, controller, repository, pipeline, scene

**Link types:** calls, owns, uses, injects, inherits, implements, publishes-to, subscribes-to, updates, reads-from, writes-to, triggers

**Diagram functions (LOST):**
- `renderDiagramFocusSurface(p)` — Full diagram builder with SVG link overlay
- `addDiagramNode(type)` — Creates new node with auto-positioning
- `deleteDiagramNode(id)` — Removes node and associated links
- `updateDiagramNodeField(id, field, value)` — In-place field edit
- `autofillDiagramNodeFunctions(id)` — Auto-generates methods based on node type
- `selectDiagramNode(id)` — Selects a node for inspection
- `startDiagramNodeDrag(event, id)` — Drag handler for node repositioning
- `setDiagramLinkDraft(fromId)` — Starts a link creation draft
- `cancelDiagramLinkDraft()` — Cancels active link draft
- `createDiagramLinkFromDraft(targetId)` — Completes link creation
- `addDiagramLink()` — Creates link from context panel
- `deleteDiagramLink(id)` — Removes a link
- `updateDiagramLinkField(id, field, value)` — Edits link properties
- `updateProjectDiagramDomain(value)` — Changes diagram domain
- `diagramStats(p)` — Returns {nodes, links, classes} counts
- `diagramNodeTypeLabel(type)` — Human-readable node type label
- `suggestedDiagramMethods(node)` — Auto-fills methods based on type + responsibility

### 2C. AI Assessment System (3-Step Review Cycle)

**Step 1: Architecture Suggest** (`runProjectAiReview()`)
- AI reviews diagram → identifies most important issue
- Proposes exact nodes, links, methods, responsibilities
- Output saved to `latestAssessment` and `latestSuggestedEdits`

**Step 2: Validate Edits** (`runProjectValidateEdits()`)
- AI compares current diagram against saved suggestions
- Reports what passed, what failed, what to fix next
- Guards: cannot run without prior Step 1 suggestions
- Shows warning notification if no suggestions exist

**Step 3: Script Review** (`runProjectScriptReview()`)
- AI compares pasted scripts against diagram + prior suggestions
- Identifies missing methods, wrong ownership, dependency direction mismatch
- Guards: cannot run without prior suggestions

**Assessment functions (LOST):**
- `scheduleProjectDiagramAssessment(immediate)` — Debounced or immediate assessment
- `requestProjectDiagramAssessment(p)` — Calls backend API or falls back to local
- `buildLocalProjectDiagramAssessment(p)` — Client-side architecture scoring
- `runProjectAiReview()` — Triggers Step 1
- `runProjectValidateEdits()` — Triggers Step 2 with guard
- `runProjectScriptReview()` — Triggers Step 3 with guard
- `runProjectDiagramMission(mission)` — Generic mission launcher
- `sendProjectDiagramMission()` — Sends mission to AI
- `currentDiagramPreviousSuggestions(p)` — Returns saved suggestions for guards
- `currentDiagramAi(p)` — Returns AI state object
- `diagramUiText(locale, english, arabic)` — Language toggle helper
- `applyDiagramSuggestedNode(i)` / `applyDiagramSuggestedLink(i)` / `applyDiagramSuggestedFunctions(i)` — Apply AI suggestions
- `applyDiagramAiButton(i)` — Process AI response buttons

### 2D. Backend Routes (LOST from server.js)

**In the larger server.js (~5,051 lines), these routes existed:**

- `POST /api/projects/:id/diagram-assess` — Server-side diagram assessment with n8n AI
- `POST /api/projects/:id/diagram-ai` — Full AI mission processing
- `POST /api/projects/:id/translate` — Translate AI output between en/ar

**AI response contract handled:**
```javascript
{ response, buttons[], notifications[], tasks[], schedule[],
  assessment: { score, summary, hints[], risks[], suggestedNodes[], suggestedLinks[], suggestedFunctions[], nextSteps[] },
  edits: { suggestedNodeEdits[], suggestedLinkEdits[], suggestedFunctionEdits[] },
  validation: { status, whatPassed[], whatFailed[], nextFixes[] },
  scriptReview: { status, summary, matchesDiagram, issues[], recommendedChanges[] }
}
```

### 2E. Rail Actions (LOST)

From `renderProjectRail()`, the left rail had these sections:

**Create:**
- + Note (`addCanvasItem('note')`)
- + Task (`addProjectTask('New task')`)
- + Phase (`addProjectPhase('New phase')`)
- + Block (`addCanvasItem('block')`)
- + Diagram Node (`addProjectDiagramNodeFromRail()`)

**AI:**
- AI Review (`runProjectAiReview()`)
- Validate (`runProjectValidateEdits()`)
- Review Scripts (`runProjectScriptReview()`)

**System:**
- Export (`openProjectExportPanel()`)
- Settings (`openProjectSettingsPanel()`)
- Node/link count indicator

### 2F. Canvas Widgets (LOST - enhanced version)

The canvas in the larger version had:
- Auto-bootstrapped default widgets on first open (note, phases list, task table, diagram snapshot)
- Enhanced canvas block types: note, block, checklist, phases, tasks, diagram
- `canvasItemLabel(type)` — Type-to-label mapping
- Diagram widget with stats and inspect/focus buttons
- Linked node tracking on canvas items (`linkedNodeIds[]`)

### 2G. Save / Export (LOST - enhanced version)

- `scheduleProjectSave()` with offline detection: "Offline — saved locally" vs "Saved to D1"
- `exportProjectSnapshot()` — JSON download of full project state
- Save status pill with three states: "Saved", "Saving...", "Offline — saved locally"

### 2H. Middle Mouse Panning (LOST)

- `attachMiddleMousePan(el)` — Universal middle-mouse scroll handler
- `initProjectWorkspaceInteractions()` — Attaches panning to canvas and diagram map
- Works on both `#fp-canvas` and `#fp-diagram-map`

### 2I. CSS: Glass Shell Styling (LOST - added in this session)

**CSS Variables added:**
```css
--glass: rgba(255, 252, 246, 0.68);
--glass-strong: rgba(255, 253, 248, 0.84);
--glass-soft: rgba(255, 255, 255, 0.46);
--glass-panel: rgba(255, 255, 255, 0.34);
--glass-border: rgba(215, 203, 184, 0.72);
--glass-border-strong: rgba(196, 180, 154, 0.92);
--glass-shadow: 0 24px 60px rgba(79, 65, 48, 0.12);
```
Plus dark mode equivalents.

**Body background changed to:**
```css
background: radial-gradient(...), radial-gradient(...), radial-gradient(...), var(--bg);
background-attachment: fixed;
```

**All project shell components styled with glass:**
- `.fp-workspace` — rounded container with border, shadow, blur, overflow hidden
- `.fp-work-rail` — glass panel with inset highlight
- `.fp-work-main` — glass panel with border and shadow
- `.fp-work-hero` — sticky header bar with glass styling
- `.fp-page` — transparent background, no border, flex column
- `.fp-panel`, `.fp-phase-row`, `.fp-task-row` — soft glass cards
- `.fp-board-command` — floating bar with glass styling
- `.fp-canvas-wrap` — transparent background
- `.fp-board-side` — glass panel, rounded, shadow
- `.fp-side-card` — individual glass cards with shadow
- `.fp-canvas` — translucent grid background with inset shadow
- `.fp-canvas-item` — translucent card with blur
- `.fp-canvas-handle` — translucent handle
- `.fp-field` — translucent input with inset highlight
- `.fp-card`, `.fp-lane`, `.fp-command`, `.fp-stat` — glass cards
- `.fp-chip`, `.fp-save-pill` — glass chips
- Button groups (fp-rail-button, fp-work-back) — glass buttons

**All with backdrop-filter: blur(xx) saturate(1.0x) and -webkit-backdrop-filter**

### 2J. Legacy Code Removed (LOST - done in this session)

**Removed from index.html:**
- `const FP_PAGES = [{id:'board'}, {id:'overview'}, {id:'phases'}, {id:'tasks'}, {id:'diagram'}, {id:'pictures'}];`
- Entire `renderProjectPage(p)` function (~57 lines with phases, tasks, board, diagram, pictures, overview pages)
- Entire `renderProjectDiagramPage(p)` function (~55 lines of old standalone diagram page)
- Entire `switchProjectPage(page)` function (~7 lines of page switching logic)
- The "Open Diagram Builder" button in the old board sidebar

---

## SECTION 3: CHANGES MADE IN THIS SESSION

### Iteration 1 (Files Lost): Phase 1 Cleanup + Glass Shell

**Removed from index.html:**
- `const FP_PAGES = [...]` — Old page navigation array
- `renderProjectPage(p)` — Old multi-page rendering (~57 lines)
- `renderProjectDiagramPage(p)` — Old standalone diagram page (~55 lines)
- `switchProjectPage(page)` — Old page switching (~7 lines)

**Added Glass CSS to index.html (~200 lines):**
- 6 glass CSS variables (light + dark)
- Body background radial gradient
- Backdrop-filter blur on all fp-* components
- Grouped `body.dark-mode` overrides

**Result:** Files were then lost from disk before the changes could be tested.

### Iteration 2 (After RAR Restore): Full Rebuild

The RAR restored a May 9 version (5,586 + 1,784 lines). All lost features were recreated:

| Area | Lines Added | Key Items |
|---|---|---|
| State variables | ~15 | FP_CONTEXT_MODE, FP_CONTEXT_COLLAPSED, FP_SELECTED_CANVAS_ID, all FP_DIAGRAM_* vars |
| Diagram constants | ~15 | DIAGRAM_DOMAIN_OPTIONS (5), DIAGRAM_NODE_TYPES (11), DIAGRAM_LINK_TYPES (12) |
| Normalization | ~25 | Enhanced normalizeProject with diagram/ai/assessment defaults |
| Helpers | ~90 | diagramStats, diagramNodeTypeLabel, suggestedDiagramMethods, currentDiagramNode, etc. |
| Shell rendering | ~120 | renderProjectRail, renderBoardFocusSurface, renderProjectContextPanel |
| Diagram rendering | ~80 | renderDiagramFocusSurface with SVG links + node cards |
| Context panels | ~150 | renderBoardSelectionPanel, renderDiagramContextPanel, renderProjectExportPanel, renderProjectSettingsPanel |
| AI panels | ~100 | renderDiagramAiPanel, renderDiagramAssessment |
| Diagram CRUD | ~30 | addDiagramNode, deleteDiagramNode, updateDiagramNodeField, all link functions, drag |
| AI assessment | ~80 | buildLocalProjectDiagramAssessment, requestProjectDiagramAssessment, scheduleProjectDiagramAssessment, sendProjectDiagramMission, 3-step review functions |
| Navigation | ~40 | focusProjectBoard, focusProjectDiagram, selectCanvasItem, clearProjectSelection, openProjectContext, toggleProjectContextPanel, exportProjectSnapshot |
| Canvas updates | ~30 | Updated renderCanvasItems (diagram widget bootstrapping), renderCanvasItem (selection + diagram type), addCanvasItem (all 6 types) |
| Canvas drag | ~5 | Updated startCanvasDrag |
| Panning | ~25 | attachMiddleMousePan, initProjectWorkspaceInteractions |
| Save system | ~20 | Updated scheduleProjectSave (offline detection), addProjectTask, addProjectPhase (context-aware) |
| Glass CSS | ~200 | Glass variables, body gradient, 30+ glass component rules, backdrop-filter blurs |
| Rail CSS | ~15 | fp-rail-section, fp-rail-section-title, fp-rail-divider, fp-work-brand |
| **Total client** | **~469** | index.html: 5,586 → 6,055 |
| **Backend routes** | **~101** | server.js: /diagram-assess, /diagram-ai, normalizeProjectDiagramForAssessment |
| **Grand Total** | **~570** | Across both files |

---

## SECTION 4: REBUILD STATUS (May 12, 2026)

**All 10 critical feature areas have been rebuilt.** Below is per-item detail.

### 4A. ✅ State Variables (Rebuilt)

```javascript
let FP_PAGE = 'board';                    // 'board' or 'diagram'
let FP_CONTEXT_MODE = 'selection';        // 'selection' | 'diagram' | 'ai' | 'export' | 'settings'
let FP_CONTEXT_COLLAPSED = false;         // Collapse state for context panel
let FP_SELECTED_CANVAS_ID = null;         // Selected canvas block
let FP_DIAGRAM_ASSESS_TIMER = null;       // Debounce for diagram assessment
let FP_DIAGRAM_SELECTED_NODE_ID = null;   // Selected diagram node
let FP_DIAGRAM_SELECTED_LINK_ID = null;   // Selected diagram link
let FP_DIAGRAM_LINK_DRAFT = null;         // Active link draft {from, relation, note}

// Constants
const DIAGRAM_DOMAIN_OPTIONS = [5 domains]
const DIAGRAM_NODE_TYPES = [11 node types]
const DIAGRAM_LINK_TYPES = [12 link types]
```

### 4B. ✅ 3-Zone Shell (Rebuilt)

**`renderProjectBoard(c)`** — Replaces old multi-page workspace. 3-zone grid:
- Left: `renderProjectRail(p)` — 236px tool rail
- Center: Board or Diagram focus surface
- Right: `renderProjectContextPanel(p)` — 332px context panel

**`renderProjectRail(p)`** — 10 action buttons in 3 sections:
- **Create:** +Note, +Task, +Phase, +Block, +Diagram Node
- **AI:** AI Review, Validate, Review Scripts
- **System:** Export, Settings, node/link counter

**`renderBoardFocusSurface(p)`** — Board view with title bar, command bar, canvas.
**`renderDiagramFocusSurface(p)`** — Diagram view with SVG link overlay, draggable node cards.

### 4C. ✅ Context Panel System (Rebuilt)

**`renderProjectContextPanel(p)`** — Dispatcher for 5 modes:
- `selection` → `renderBoardSelectionPanel(p)` — Project editor + selected block details
- `diagram` → `renderDiagramContextPanel(p)` — Node/link inspector
- `ai` → `renderDiagramAiPanel(p)` — AI mission panel
- `export` → `renderProjectExportPanel(p)` — JSON download
- `settings` → `renderProjectSettingsPanel(p)` — Shell controls

Collapsible via `toggleProjectContextPanel()` — collapses to 44px with expand button.

### 4D. ✅ Diagram Builder (Rebuilt)

**11 Node Types:** class, monobehaviour, manager, service, interface, system, scriptable-object, controller, repository, pipeline, scene

**12 Link Types:** calls, owns, uses, injects, inherits, implements, publishes-to, subscribes-to, updates, reads-from, writes-to, triggers

**Diagram Functions (all rebuilt):**

| Function | Description |
|---|---|
| `addDiagramNode(type)` | Creates new node with auto-positioning + auto-methods |
| `deleteDiagramNode(id)` | Removes node + cascading link cleanup |
| `updateDiagramNodeField(id, field, value)` | In-place field edit (name, type, responsibility, fields, methods, notes) |
| `autofillDiagramNodeFunctions(id)` | Generates methods based on node type + responsibility keywords |
| `selectDiagramNode(id)` | Selects node; completes link draft if active |
| `startDiagramNodeDrag(event, id)` | Pointer-capture drag handler for node repositioning |
| `setDiagramLinkDraft(fromId)` | Starts link creation flow |
| `cancelDiagramLinkDraft()` | Cancels active link draft |
| `createDiagramLinkFromDraft(targetId)` | Completes link between source and target |
| `addDiagramLink()` | Creates link from context panel dropdowns |
| `deleteDiagramLink(id)` | Removes link |
| `updateDiagramLinkField(id, field, value)` | Edits link relation/note |
| `updateProjectDiagramDomain(value)` | Changes domain + triggers reassessment |
| `diagramNodeTypeLabel(type)` | Human-readable type name |
| `suggestedDiagramMethods(node)` | Auto-fills methods per type + duty analysis |
| `diagramStats(p)` | Returns {nodes, links, classes} counts |
| `ensureDiagramSelection(p)` | Validates selected node/link exist |
| `currentDiagramNode(p)` / `currentDiagramLink(p)` | Gets selected node/link |

### 4E. ✅ AI Assessment System (Rebuilt)

**3-Step Review Cycle:**

| Step | Trigger | Function | Description |
|---|---|---|---|
| **Step 1: Suggest** | Rail "AI Review" | `runProjectAiReview()` | AI reviews diagram → proposes exact improvements |
| **Step 2: Validate** | Rail "Validate" | `runProjectValidateEdits()` | AI compares diagram against saved suggestions. Guards: requires Step 1 |
| **Step 3: Script Review** | Rail "Review Scripts" | `runProjectScriptReview()` | AI reviews pasted code against diagram. Guards: requires Step 1 |

**Assessment Functions:**

| Function | Description |
|---|---|
| `buildLocalProjectDiagramAssessment(p)` | Client-side architecture scoring (100-point scale) |
| `requestProjectDiagramAssessment(p)` | Calls backend API or falls back to local |
| `scheduleProjectDiagramAssessment(immediate)` | Debounced (1.4s) or immediate assessment trigger |
| `sendProjectDiagramMission()` | Sends mission + diagram + scripts to n8n AI |
| `runProjectDiagramMission(mission)` | Opens AI panel, pre-fills mission, triggers send |
| `currentDiagramPreviousSuggestions(p)` | Returns saved suggestions (used by validation guards) |
| `applyDiagramSuggestedNode(i)` / `applyDiagramSuggestedLink(i)` / `applyDiagramSuggestedFunctions(i)` | Apply AI suggestions to diagram |
| `applyDiagramAiButton(i)` | Process AI response action buttons |

**AI Panel (`renderDiagramAiPanel`):**
- Mission textarea with language toggle (EN/AR)
- Scripts input zone for pasting code
- Conversation history display (messages array)
- Notifications, Tasks, Schedule sections
- Action buttons from AI response
- Status indicator

### 4F. ✅ Navigation Functions (Rebuilt)

| Function | Description |
|---|---|
| `focusProjectBoard()` | Switches to board, clears diagram selection |
| `focusProjectDiagram()` | Switches to diagram, triggers assessment |
| `openProjectContext(mode)` | Opens context panel in specific mode |
| `toggleProjectContextPanel(force)` | Collapses/expands context panel |
| `clearProjectSelection()` | Deselects canvas block + diagram selection |
| `selectCanvasItem(id)` | Selects canvas block, opens context |
| `openProjectExportPanel()` / `openProjectSettingsPanel()` | Shortcuts for context panel modes |
| `addProjectDiagramNodeFromRail()` | Quick-adds class node in diagram |
| `exportProjectSnapshot()` | Downloads project as JSON |
| `triggerProjectDownload(filename, content, mime)` | Browser download helper |

### 4G. ✅ Canvas Functions (Rebuilt)

**`renderCanvasItems(p)`** — Bootstraps 4 default widgets on first open:
1. Note: "Project Direction"
2. Phases: "Live Phases"  
3. Tasks: "Live Task Table"
4. Diagram: "Architecture Snapshot"

**`renderCanvasItem(p, item)`** — Supports 6 block types:
- `note` — Free text textarea
- `block` — Free text textarea
- `checklist` — [x] / [ ] lines with toggle
- `phases` — Checklist from p.phases
- `tasks` — Table from p.board.tasks
- `diagram` — Stats card with Inspect/Focus buttons

Selection styling: `.fp-canvas-item.selected` with stronger border + shadow.

**`addCanvasItem(type)`** — Creates block with auto-positioning, selects it, opens context.

### 4H. ✅ Middle Mouse Panning (Rebuilt)

**`attachMiddleMousePan(el)`** — Universal handler:
- Middle-mouse hold → cursor: grabbing
- Scrolls container during hold, no accidental item selection
- Prevents auxclick default
- Idempotent (`data-middlePanReady` flag)

**`initProjectWorkspaceInteractions()`** — Attaches panning to `#fp-canvas` and `#fp-diagram-map`.

### 4I. ✅ Glass CSS (Rebuilt)

**6 CSS Variables (light + dark variants):**
```css
--glass, --glass-strong, --glass-soft, --glass-panel,
--glass-border, --glass-border-strong, --glass-shadow
```

**Components with glass styling (~200 lines):**
- Outer shell: `.fp-workspace` (rounded, border, shadow, overflow hidden)
- Rail: `.fp-work-rail` (glass-strong, inset highlight)
- Main: `.fp-work-main` (glass-panel, border, shadow)
- Hero bar: `.fp-work-hero` (sticky, glass-soft, border)
- Page surfaces: `.fp-page` (transparent, flex column)
- Cards: `.fp-panel`, `.fp-phase-row`, `.fp-task-row`, `.fp-side-card`
- Canvas: `.fp-canvas` (translucent grid, inset shadow)
- Canvas items: `.fp-canvas-item` (translucent, selected state)
- Fields: `.fp-field` (translucent, inset highlight)
- Context: `.fp-board-side`, `.fp-context-body`
- OS cards: `.fp-card`, `.fp-lane`, `.fp-command`, `.fp-stat`, `.fp-chip`
- Buttons: `.fp-rail-button`, `.fp-work-back`

All with `backdrop-filter: blur(xx) saturate(xx)` and `-webkit-backdrop-filter`.

**Body background:** 3-layer radial gradient with `background-attachment: fixed`.

### 4J. ✅ Backend Routes (Rebuilt)

**`POST /api/projects/:id/diagram-assess`**
- Receives diagram state from client
- Sends to n8n AI webhook for analysis
- Returns assessment with score, summary, hints, risks, suggested nodes/links/functions, next steps
- Falls back to local assessment if n8n unavailable

**`POST /api/projects/:id/diagram-ai`**
- Receives diagram + mission + scripts + locale
- Builds context-rich prompt with system instructions
- Supports Arabic/English output with preserved terms
- Sends to n8n, returns structured response (response, edits, assessment, notifications, tasks, schedule, buttons)
- Falls back to local response if n8n unavailable

**Helper:** `normalizeProjectDiagramForAssessment(diagram)` — Normalizes diagram object shape.

### 4K. ✅ Enhanced Save System (Rebuilt)

- `scheduleProjectSave()` — Debounced 650ms autosave with 3 states:
  - "Saving..." (amber accent during debounce)
  - "Saved to D1" (text3 when backend succeeds)
  - "Offline — saved locally" (amber when API unavailable or queued)
- `markProjectSaving(text, color)` — Updates save pill in header
- Offline detection via `!API || result?._queued`

---
### Trainer Features (planned, not yet implemented):

Per `AI_TRAINER_ROADMAP.md`:
- Phase 1: Main page restructure with trainer cards (not started)
- Phase 2: `/api/trainer/overview`, `/api/trainer/challenges/generate`, `/api/trainer/exams/start`, `/api/trainer/exams/submit`
- Phase 3: Knowledge map and CV snapshot
- Phase 4: Chat-driven trainer control

---

## SECTION 5: DESIGN CONSTRAINTS

From `New-Proejcts-System.md`:
- One project = one platform screen
- Diagram is a board widget/focus, not a separate page
- Middle-mouse hold pans the board
- Compact icon buttons only; no heavy menus
- Right context panel updates by selection but is NOT the only editing path
- Modern, premium, minimal, engineering-first UI
- Autosave silently in background with visible save status
- No native confirm/prompt/alert; use custom UI
- Preserve technical terms: Player, Subject, MonoBehaviour, GameManager, API, CI/CD, DevOps
- AI flow: suggest → validate → script review, with Arabic/English output support
- Vanilla Express.js + HTML/JS/CSS (no frameworks)

---

## SECTION 6: RECOVERY NOTES

1. The `ops-hub.rar` (May 9, 2026, 2.6MB) contains the **pre-shell-overhaul** version
2. The git repo has zero commits — no history to recover from
3. The larger version (~14,500 lines total) was lost when project files disappeared from disk
4. Rebuild was completed on May 12: 570 lines added across both files
5. The rebuilt version is **not identical** to the lost version — it's a recreation based on memory and code patterns observed during the session

---

## SECTION 7: CURRENT STATE (May 12, 2026 — After Rebuild)

### Files and Line Counts

| File | Lines | Parses | Notes |
|---|---|---|---|
| `public/index.html` | 6,055 | ✅ | All scripts parse via `new Function()` |
| `server.js` | 1,885 | ✅ | `node --check` passes |

### Complete Function Index (Shell + Diagram + AI — Added in Rebuild)

**Shell & Layout:**
`renderProjectBoard`, `renderProjectRail`, `renderBoardFocusSurface`,
`renderProjectContextPanel`, `renderBoardSelectionPanel`, `renderProjectExportPanel`,
`renderProjectSettingsPanel`

**Diagram Builder:**
`renderDiagramFocusSurface`, `renderDiagramContextPanel`,
`addDiagramNode`, `deleteDiagramNode`, `updateDiagramNodeField`, `autofillDiagramNodeFunctions`,
`selectDiagramNode`, `startDiagramNodeDrag`,
`setDiagramLinkDraft`, `cancelDiagramLinkDraft`, `createDiagramLinkFromDraft`, `addDiagramLink`,
`deleteDiagramLink`, `updateDiagramLinkField`, `updateProjectDiagramDomain`,
`diagramStats`, `diagramNodeTypeLabel`, `diagramUiText`, `suggestedDiagramMethods`,
`ensureDiagramSelection`, `currentDiagramNode`, `currentDiagramLink`, `currentDiagramAi`,
`currentDiagramPreviousSuggestions`, `currentProjectDiagram`, `canvasItemLabel`, `currentCanvasItem`

**AI Assessment:**
`renderDiagramAssessment`, `renderDiagramAiPanel`,
`buildLocalProjectDiagramAssessment`, `requestProjectDiagramAssessment`,
`scheduleProjectDiagramAssessment`, `sendProjectDiagramMission`, `runProjectDiagramMission`,
`runProjectAiReview`, `runProjectValidateEdits`, `runProjectScriptReview`,
`applyDiagramSuggestedNode`, `applyDiagramSuggestedLink`, `applyDiagramSuggestedFunctions`,
`applyDiagramAiButton`

**Navigation & Canvas:**
`focusProjectBoard`, `focusProjectDiagram`, `addProjectDiagramNodeFromRail`,
`openProjectContext`, `toggleProjectContextPanel`, `clearProjectSelection`,
`selectCanvasItem`, `openProjectExportPanel`, `openProjectSettingsPanel`,
`exportProjectSnapshot`, `triggerProjectDownload`,
`renderCanvasItems` (updated), `renderCanvasItem` (updated), `addCanvasItem` (updated)

**Input & Interaction:**
`attachMiddleMousePan`, `initProjectWorkspaceInteractions`, `fetchWithTimeout`

**State & Normalization:**
`normalizeProject` (enhanced), `projectPayload`, `diagramStats`,
All FP_* state variables (FP_CONTEXT_MODE, FP_CONTEXT_COLLAPSED, FP_SELECTED_CANVAS_ID, FP_DIAGRAM_*)

### Backend Routes (Added in Rebuild)

| Route | Method | Description |
|---|---|---|
| `/api/projects/:id/diagram-assess` | POST | Server-side diagram assessment via n8n AI |
| `/api/projects/:id/diagram-ai` | POST | Full AI mission processing with n8n |
| `normalizeProjectDiagramForAssessment()` | Helper | Normalizes diagram object for API calls |

### What Was NOT Rebuilt (from the lost ~14,500-line version)

The lost version had roughly **~6,400 additional lines** of code not yet recreated. This likely included:
- Advanced AI response processing (translation between en/ar at the server level)
- Additional canvas block type variants and richer widget layouts
- Deeper n8n integration with more response shapes
- Additional CSS animations, transitions, and micro-interactions
- Possibly more trainer-related scaffolding
- Extended keyboard shortcut system with undo/redo

### Rebuild Changelog

| Round | Additions | index.html | server.js |
|---|---|---|---|
| Base (RAR) | Restored from ops-hub.rar | 5,586 | 1,784 |
| Round 1 | State vars, 3-zone shell, diagram builder, AI assessment, context panels, glass CSS, backend routes, panning, canvas updates | 6,055 | 1,885 |
| Round 2 | Rail section CSS, keyboard shortcuts (12), diagram node visual differentiation (11 types), canvas hover quick actions (4 buttons) | 6,151 | — |
| Round 3 | Block-to-diagram-node linking (linkedNodeIds, link pills, focusDiagramNode), enhanced selectDiagramNode, CSS for link pills | 6,176 | — |

### Next Steps (Recommended)

1. Test the app in browser: `cd C:\Users\silve\Documents\GitHub\ops-hub && node server.js`
2. Verify n8n webhook connectivity for AI features
3. Polish diagram node visual differentiation (11 types with distinct styles per Phase 3 spec)
4. Add keyboard shortcuts (Space=pan, N=note, T=task, D=diagram node, A=AI panel, Escape=deselect)
5. Migrate remaining legacy CSS to use glass variables consistently
6. Add block quick actions on hover (edit, duplicate, link, delete)
7. Implement block-to-diagram-node linking (linkedNodeIds)
8. Begin Trainer Phase 1 (main page restructure with trainer preview cards)
