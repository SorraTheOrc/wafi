# PRD (Outline): Agentic PM CLI (Beads + OpenCode + Copilot) (see wf-ba2)

## 1) Summary

### 1.1 One-liner

A repo-first, agentic product management CLI for a single PM that uses Beads as the canonical issue graph and OpenCode (with GitHub Copilot) as the conversational AI interface.

### 1.2 Problem statement

Product work fragments across docs, chat, and code. The goal is a single, auditable workflow where:

* product intent becomes an executable Beads issue graph,
* planning stays dependency-aware,
* release artifacts (release notes, roadmap, changelog) are generated consistently in Markdown,
* and every change is reviewable via git.

### 1.3 Goals

* Beads remains the source of truth for work tracking (JSONL in-repo).
* Intake  triage  plan  ship is the default workflow.
* Manual release cadence supported from day one, with mechanisms for regular code freezes.
* The current `main` branch is always releasable (see section 6.2).
* Feature flags gate anything not fully tested and ready for release.
* Context is shared between the PM and OpenCode.

### 1.4 Non-goals

* Building a TUI in this PRD (covered separately in docs/dev/TUI_PRD.md).
* Replacing Beads with another tracker, or maintaining a duplicate issue database.
* Fully automated releases in v1 (manual first; automation later).

## 2) Users & Primary Use Cases

Rule of Five policy: use the 5-pass prompt set when authoring/reviewing artifacts (see wf-ba2.1).

### 2.1 Target user

* Single PM operating inside a git repo.

### 2.2 Primary use cases

* Intake: capture product requests quickly as Beads issues.
* Triage: clarify, categorize, and prioritize issues; connect dependencies.
* Plan: generate/maintain an executable issue graph (epic  subtasks) that respects blockers.
* Ship: drive issues to completion and generate release artifacts.

## 3) Artifact & Repository Conventions

### 3.1 Artifact locations (confirmed)

* Developer/design artifacts (PRDs, decisions, plans): `docs/dev/` (Markdown).
* Release notes and release-related artifacts: `docs/releases/` (Markdown).
* Changelog: `docs/` (Markdown).

### 3.2 Canonical files (initial proposal; can be adjusted)

* `docs/CHANGELOG.md`
* `docs/dev/ROADMAP.md`
* `docs/dev/CLI_PRD.md`
* `docs/dev/TUI_PRD.md`
* `docs/releases/<git-tag>.md` (release id is the git tag; semver-based)

## 4) Product Requirements

### 4.1 Beads-native issue lifecycle (must-have) (see wf-dt1, wf-ca1)

* Create/update/close issues exclusively via `bd`.
* Use templates for `bug`, `feature`, `epic`; skip templates only where Beads guidance allows.
* Always emit/consume JSON output for deterministic behavior.
* Require (or strongly prompt) `bd sync` at the end of each session.

### 4.2 Intake requirements (see wf-dt1, wf-ca1)

* Convert an intake statement into a Beads issue with:
  * type suggestion (`bug`/`feature`/`task`/`chore`)
  * priority suggestion (04)
  * initial acceptance criteria (minimal, testable)
* Must prevent duplicates (at minimum: search/list before create).

### 4.3 Triage requirements (see wf-dt1, wf-ca1)

* Support updating:
  * priority, status
  * dependencies (including `discovered-from:<id>`)
  * parent/subtask relationships
* Provide a "triage checklist" output (questions to ask, missing info).
  * Default behavior: print the checklist to stdout for quick consumption by the PM or the TUI.
  * Optional: write a temporary, reviewable file `docs/dev/TRIAGE_CHECKLIST.md` when the user requests a persisted checklist; this file is a single-purpose scratchpad and is not intended to become a long-lived artifact unless the user promotes it.

### 4.4 Planning requirements (see wf-dt1, wf-ca1)

* Generate/maintain:
  * an epic with subtasks
  * explicit dependencies
  * an execution order that prefers unblocked work
* Must surface:
  * ready work (`bd ready --json`)
  * stale work (`bd stale --days N --json`)
* Should optionally use `bv --robot-*` for dependency insights when present.

### 4.5 Shipping & reporting requirements (Markdown) (see wf-dt1, wf-ca1)

* Generate artifacts on demand (manual cadence):
  * Release notes (for a given release id/time window)
  * Roadmap (epics + progress)
  * Changelog entries
* Output must be Markdown and written to the conventions in section 3.

### 4.6 CLI utility commands (recommended) (see wf-ba2.8, wf-ba2.5)

* `context` (alias: `ctx`): generate the shared context pack at `docs/dev/CONTEXT_PACK.md` following the template in 8.3.1. The command must respect ignore boundaries and redact or omit any ignored content.
* `check-release`: run a full release readiness check that executes tests, collects coverage reports, runs a feature-flag audit, and validates documentation presence. It must exit non-zero on failure and emit a machine-readable JSON summary when `--json` is provided.
* `flag-audit`: list feature flags and their enabled/disabled state (reads the canonical flags file); optionally produce a report of flags that are enabled by default.

These utilities are part of the CLI surface and should be callable from CI and from the TUI.

## 5) Release Process Requirements (see wf-ca1)

### 5.1 Manual cadence with code freeze mechanisms (see wf-ca1)

* The CLI must support a recurring “release day” workflow that includes:
  * a code freeze mechanism (defined and enforced in-repo)
  * a pre-release checklist (tests, coverage, flag audit, sign-off)
  * generation of release notes in `docs/releases/`

#### 5.1.1 Recommendation: “Soft freeze” policy + “Hard freeze” optional enforcement

*snip unchanged content above for brevity*


## 12) Intake: Responsive Console Table Output

### Problem

Beads table output currently wraps in narrow consoles (for example, tmux panes), which breaks single-line rows and makes tabular summaries hard to scan. As the project adopts a TMux-managed multi-agent environment with many narrow panes, this reduces operator visibility and increases cognitive load.

### Users

Primary: Producer — humans reading CLI tables in narrow panes.

Secondary: TUI operators, automation scripts, CI jobs, SRE/QA who rely on readable table summaries.

### Success criteria

- No wrapped cells in table outputs.
- When the terminal width is insufficient, the renderer drops rightmost, less-important columns until the table fits on a single line per record.
- The title column must always be present; when it does not fit, it is truncated with an ellipsis rather than dropped.
- Measurable targets: single-line rows at 80 columns; in narrower panes (e.g., 40 cols) table fits by dropping columns while preserving truncated title.

### Constraints

- Must not introduce wrapped cells.
- Title column must never be dropped; when space is insufficient it should be truncated with an ellipsis.
- Preserve ANSI color behavior; ensure color sequences do not contribute to visible width calculations when possible (or accept caveat).
- Minimize breaking changes for downstream automation that may parse output; if necessary, provide a machine-readable `--json` output or an explicit opt-out flag (e.g., `--no-responsive`).

### Existing state

- The codebase currently uses `src/lib/table.ts` to render tables, with fixed-column width computation and a static title cap. Commands such as `src/commands/next.ts` call into this renderer.

### Desired change

- Implement a responsive table renderer that:
  - Detects terminal width.
  - Drops rightmost non-mandatory columns by priority until the table fits.
  - Always retains the `id` and `title` columns; truncates `title` with ellipses when necessary.
  - Provides a `--no-responsive` or `--compact` flag if consumers need deterministic old behavior.

### Likely duplicates / related docs

- docs/dev/TUI_PRD.md
- docs/Workflow.md

### Related issues

- wf-soh: Integrate marked-terminal markdown rendering for all CLI output
- wf-35m.3: Extract shared table rendering and align blockers logic
- wf-35m.1: Refactor bd/bv CLI invocation into shared utility

### Clarifying questions

1. Do any downstream scripts parse current table output by fixed columns? (If yes, we should provide a `--no-responsive` flag and encourage `--json` usage for automation.)
2. Confirm acceptance widths (suggest: guarantee readability at 80 cols and graceful degradation at 40 cols).
3. Confirm column drop priority (implemented: drop `assignee`, `blocks`, `blockers`, `priority` in that order). Change if needed.
4. Should ANSI color sequences be stripped when computing widths, or do we accept the small mismatch between byte-length and visible-width?
5. Who will review and sign off the UX on narrow panes (1–2 reviewers recommended).

### Proposed next step

- UPDATE PRD at: docs/dev/CLI_PRD.md

Source issue: wf-8js
