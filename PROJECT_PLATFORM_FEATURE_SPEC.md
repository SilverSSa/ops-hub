# Project Platform Feature Spec

## Goal
Turn each Future Project into a full-screen execution platform for software engineering, Unity architecture planning, product management, and DevOps job preparation.

## Core Experience
- One project opens as a full workspace, not a simple form.
- Main surface is a movable board/canvas.
- Middle mouse hold pans the board.
- Small tool buttons keep the workspace clean.
- Settings are grouped behind a compact settings button.
- Workspace should feel modern, focused, and professional.

## Main Areas
- Board canvas
- Architecture diagram builder
- AI mission panel
- Tasks and execution queue
- Phases / milestones
- Notes / product brief
- Reference wall / pictures
- Script review area
- Settings / project configuration

## Board Canvas
- Infinite-feel workspace with panning
- Middle mouse hold to pan
- Drag blocks/cards around
- Add small widgets:
  - note
  - checklist
  - phases
  - tasks
  - diagram summary
  - AI review summary
  - script review summary
- Snap/grid optional later
- Save layout automatically

## Diagram Builder
- Class/system nodes
- Direct click-to-link flow
- Relation types like calls, uses, owns, injects, inherits, implements
- Unity-specific node types:
  - MonoBehaviour
  - manager
  - service
  - system
  - scriptable object
- Product flow node types
- DevOps flow node types
- Edit node fields:
  - name
  - type
  - responsibility
  - fields
  - methods
  - notes
- AI suggestions can add:
  - nodes
  - links
  - methods/functions

## Diagram AI Workflow
- Step 1: Suggest edits
- Step 2: Validate current diagram against previous suggestions
- Step 3: Review updated scripts against saved suggestions and current diagram

### AI should provide
- What it is going to do first
- Assessment score
- Main risks
- Hints
- Suggested nodes
- Suggested links
- Suggested functions
- Suggested edits
- Validation results
- Script review results
- Next steps
- Small action buttons

## AI Mission Panel
- Mission text box
- Response language selector
- Preserve developer terms input
- Script paste area
- Conversation history
- Notifications
- Tasks
- Schedule
- Saved suggestions summary
- Validation summary
- Script review summary

## Arabic Support
- AI can answer in Arabic or English
- Technical terms must stay unchanged
- Terms like Player, Subject, MonoBehaviour, GameManager, API, CI/CD, DevOps should not be translated

## Script Review
- Paste current script/class JSON or raw C# code
- Compare scripts to diagram and saved suggestions
- Detect:
  - missing methods
  - wrong responsibilities
  - bad dependency direction
  - implementation mismatch with architecture
- Return exact class/method names, not vague feedback

## Product Management Support
- Mission brief section
- Problem statement
- User goals
- Scope
- Delivery phases
- Risks / assumptions
- Success metrics
- Release notes area

## DevOps Preparation Support
- DevOps architecture mode
- Pipeline nodes
- Infra/service links
- Review deployment flow
- Review rollback flow
- Review observability/logging coverage
- Review ownership boundaries

## Execution System
- Task queue with progress
- Milestones/phases
- AI-generated next steps
- Validation checklist before implementation
- Script review before merge

## Small Button Philosophy
- Compact toolbar buttons
- Contextual buttons near the active object
- Separate destructive actions from common actions
- Keep the board visually calm

## Settings Panel
- Project identity
- Tags
- Domain type (Unity / software / product / DevOps)
- AI language
- Preserved developer terms
- Autosave settings
- Export options

## Nice Future Upgrades
- Export diagram to image
- Export architecture review to markdown
- Code skeleton generation from nodes
- UML-style arrows
- Interface visualization
- Version snapshots of diagram edits
- Replay of AI suggestion history

## Success Criteria
- One project feels like a mini product OS
- Diagram editing is fast and visual
- AI feedback is concrete, not generic
- Validation and script review are part of the normal flow
- Works for Unity architecture, software architecture, product flows, and DevOps planning
