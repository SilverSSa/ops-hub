# AI Trainer Main Page Roadmap

## Goal
Build a main-page learning command center controlled by the DevHub chat and the n8n AI Trainer webhook. The page should show daily-use items, starred items, weekly AI challenges, exams, a personal knowledge map, and a CV-readiness snapshot.

## n8n Contract
Webhook: `https://n8n.alsfeany.dev/webhook/ai-trainer`

Expected request shapes:

```json
{ "type": "weekly_challenges", "overview": {}, "sessionId": "default" }
```

```json
{ "type": "start_exam", "category": "english-career", "overview": {}, "sessionId": "default" }
```

```json
{ "type": "grade_exam", "exam": {}, "answers": "...", "overview": {}, "sessionId": "default" }
```

Expected response shapes can be flexible, but ideal outputs are:

```json
{ "challenges": [{ "title": "...", "description": "...", "category": "...", "goal": "...", "level": "foundation", "dueDays": 7 }] }
```

```json
{ "title": "...", "category": "english-career", "questions": [{ "id": "q1", "prompt": "..." }] }
```

```json
{ "score": 74, "level": "intermediate", "summary": "...", "knowledge_updates": [] }
```

The app keeps deterministic fallbacks so the website still works if n8n is down.

## Phase 1 - Main Page Restructure
Tasks:
- Shrink the current DevHub hero and move it into a compact corner card.
- Keep categories as the first useful daily area.
- Add starred/quick-access items under categories.
- Add AI Trainer preview cards for weekly challenges, exam access, knowledge progress, and CV readiness.

Evaluation:
- Projects and Chat buttons still work.
- Home remains mobile responsive.
- Existing source categories and pinned items keep their existing behavior.

## Phase 2 - Trainer Data Layer
Tasks:
- Add D1 tables for trainer challenges, exam results, and knowledge nodes.
- Add `/api/trainer/overview` for the home page.
- Add `/api/trainer/challenges/generate` using the n8n trainer hook.
- Add `/api/trainer/exams/start` and `/api/trainer/exams/submit` using the same hook.

Evaluation:
- Challenges persist after reload.
- Old exam results are visible from Settings.
- n8n failure falls back to local generated content.

## Phase 3 - Knowledge Map And CV Snapshot
Tasks:
- Add a personal knowledge map separate from the existing source/project mind map.
- Seed knowledge areas: English career communication, Spanish, Turkish, Japanese, networking basics, computer science/software development, and documentation.
- Add CV readiness summary based on knowledge levels and exam scores.

Evaluation:
- The map shows categories and levels clearly.
- CV snapshot identifies strengths and next gaps.
- The system can be extended by n8n updates later.

## Phase 4 - Chat-Driven Control
Tasks:
- Let chat/n8n navigate to trainer, settings, CV, exams, and challenge generation.
- Let AI create challenges and exams based on current knowledge state.
- Let challenge/exam results update the stored knowledge profile.

Evaluation:
- Chat can trigger the same flows as the main page buttons.
- Exam and challenge UI remain usable without chat.

## Current Implementation Slice
This pass implements phases 1 and 2 as an MVP, plus the first version of phase 3:
- Compact home.
- Starred items under categories.
- Trainer overview cards.
- D1-backed challenges, exams, and knowledge nodes.
- n8n trainer hook with fallback content.
- Settings page for old exams and new exam access.
- CV page and personal knowledge map entry points.
