# PRD (MVP): Agentic PM TUI (tmux Companion) (see wf-ca1, wf-dt1)

## 1) Summary

### 1.1 One-liner

A `tmux`-based (or similar) terminal UI that runs alongside OpenCode and the CLI, providing fast, dependency-aware visibility into Beads issues and common actions for a single PM.

### 1.2 Relationship to CLI PRD

This PRD complements the CLI scope in docs/dev/CLI_PRD.md. The CLI owns the “source of truth” actions (`bd` commands and file writes); the TUI is a focused operator interface for viewing state and triggering a small set of safe workflows.

## 2) Goals (MVP)

Rule of Five policy: artifact authoring/review uses 5-pass prompts (see wf-ba2.1).

- Make Beads issue state visible at a glance during daily PM work.
- Optimize the intake → triage → plan → ship loop for a single PM.
- Provide a stable, keyboard-first UI in a terminal, designed to run inside `tmux` next to OpenCode.
- Keep everything repo-first and auditable (actions map to explicit commands and diffs).

## 3) Non-goals (MVP)

- Replacing OpenCode conversation UI.
- Editing code or files directly inside the TUI.
- Advanced project management features (resource planning, calendars, etc.).

## 4) MVP Scope

### 4.1 Layout

- Primary target is a `tmux` workflow with:
  - one pane reserved for OpenCode
  - one pane running the TUI
- The TUI should also run outside `tmux` (single process), but the layout assumptions should not break.

### 4.2 Core views (see wf-ca1)

- Ready Work: shows output derived from `bd ready --json`.
- Stale Work: shows output derived from `bd stale --days N --json`.
- Issue Detail: shows a single issue (title, type, priority, status, deps, parent, notes).
- Plan View: shows a proposed execution plan (including blockers) and what would be updated.

### 4.3 Core actions (see wf-ca1)

- Refresh: re-run underlying commands and re-render.
- Open/inspect issue: navigate from lists to detail.
- Trigger CLI workflows (delegated):
  - Create issue from intake text
  - Apply triage edits (priority/status/deps)
  - Generate/update plan
  - Generate markdown artifacts (release notes/roadmap/changelog)

### 4.4 Safety model (see wf-ba2.2.3, wf-ba2.5.1, wf-ba2.6.3)

- Default: “preview-first”. The TUI shows the CLI/`bd` commands it would run and what would change.
- Preview output is best-effort: if a workflow hands off to agents, the system cannot make a strict `--dry-run` promise (agents may take actions outside the TUI’s preview model).
- Any write action requires explicit confirmation.
- All repo writes should be executed by the CLI layer (or via `bd`) so the TUI remains thin and auditable.

## 5) Requirements

### 5.1 Functional requirements

- Must render Beads issue state for up to ~1000 open issues without becoming unusably slow.
- Must be fully operable by keyboard.
- Must provide a predictable navigation model (lists → detail → back).
- Must support a consistent refresh model and avoid stale state surprises.

### 5.2 Non-functional requirements

- Reliability: errors from underlying commands must be surfaced clearly.
- Observability: provide a simple log file for debugging (TBD location).

## 6) Integration Design (MVP) (see wf-ca1, wf-dt1)

### 6.1 Data sources (see wf-dt1)

- `bd` CLI JSON output is canonical for issues.
- Optional: `bv --robot-*` used to enrich planning views where available.

### 6.2 Action execution (see wf-ca1, wf-ba2.8)

- The TUI triggers CLI commands (or `bd` commands) rather than implementing business logic itself.
- The TUI should capture and display:
  - command executed
  - success/failure
  - concise summary of changes

### 6.3 Context sharing with OpenCode (see wf-ba2.5)

- The TUI must support sharing context with OpenCode (details TBD), while still respecting ignore boundaries.

## 7) MVP Deliverables

- A runnable TUI executable.
- Documented `tmux` recipe for running OpenCode + TUI side-by-side.
- Documented keybindings.

## 8) Open Questions (Recorded; do not resolve yet)

1. What is the minimum set of screens required for v1 beyond Ready/Stale/Detail/Plan?
2. What keybinding scheme should be used (vim-like, arrows, custom)?
3. Should the TUI support editing issue fields inline or delegate all edits to CLI prompts?
4. How should the TUI share context with OpenCode (clipboard helper, shared file, stdout snippet)?
5. Should the TUI support multiple repos or only the current working directory?
6. What is the acceptable refresh latency target at 1000 open issues?
7. Where should logs/config live (under `docs/dev/` vs a dotdir)?
