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
* Intake → triage → plan → ship is the default workflow.
* Manual release cadence supported from day one, with mechanisms for regular code freezes.
* The current `main` branch is always releasable (see section 6.2).
* Feature flags gate anything not fully tested and ready for release.
* Context is shared between the PM and OpenCode.

### 1.4 Non-goals

* Building a TUI in this PRD (covered separately in docs/dev/TUI\_PRD.md).
* Replacing Beads with another tracker, or maintaining a duplicate issue database.
* Fully automated releases in v1 (manual first; automation later).

## 2) Users & Primary Use Cases

Rule of Five policy: use the 5-pass prompt set when authoring/reviewing artifacts (see wf-ba2.1).

### 2.1 Target user

* Single PM operating inside a git repo.

### 2.2 Primary use cases

* Intake: capture product requests quickly as Beads issues.
* Triage: clarify, categorize, and prioritize issues; connect dependencies.
* Plan: generate/maintain an executable issue graph (epic → subtasks) that respects blockers.
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
  * priority suggestion (0–4)
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

To match “manual first, automate later”, use a two-layer approach:

* Soft freeze (policy, v1):

  * On release day, create a release branch `release/vX.Y.Z` from `main`.
  * During the freeze window, only allow critical fixes to merge to `main` (documented policy), and cherry-pick approved fixes into the release branch.
  * Release is cut by tagging the release branch head with a semver tag (e.g., `vX.Y.Z`).

* Hard freeze (optional enforcement, v1.1+):
  * Add a repo marker file that indicates freeze state (example: `.release/freeze.json` or `.release/freeze.yml`).
  * Add a CI check that fails PRs targeting `main` while freeze is active unless an explicit override is present (e.g., a PR label like `override-freeze` or a config allowlist).
  * Keep the override path auditable (label + required approvals).

This recommendation keeps the initial process lightweight while providing a clear path to enforceable automation later.

Decision (confirmed): start with “soft freeze” policy only; defer “hard freeze” CI enforcement.

### 5.2 Always runnable; feature flags

* The codebase must remain runnable at all times.
* Features not fully tested/ready must be gated behind feature flags.
* Default state: features behind flags are OFF unless explicitly enabled.
* The release workflow must include a feature-flag audit:
  * confirm which flags are enabled for the release
  * confirm no incomplete feature is ON by default

#### Feature flag storage recommendation

* Use a repo-first, declarative flags file at `config/flags.json` (or `config/flags.yml`) with a simple shape, for example:

```json
{
  "FEATURE_X": { "default": false, "description": "New checkout flow" },
  "EXPERIMENTAL_UI": { "default": false, "description": "Flag for early UI" }
}
```

* The CLI's `flag-audit` and `check-release` commands read this file to determine which flags are enabled by default and which are runtime-only toggles. If the project prefers language-embedded flags (e.g., `src/flags.ts`), the implementation must still provide an exported, machine-readable `config/flags.json` for auditing.

## 6) Quality Gates / Definition of Done (confirmed) (see wf-ba2.9)

An issue is 'Done' when all of the following are true:

* All tests pass.
* Test coverage meets the following:
  * 90% in core code
  * 80% across the entire codebase
* All features not behind a feature flag have been user tested and signed off.
* The PR is merged.

### 6.1 Recommended defaults (implementation-agnostic)

#### 6.1.1 Coverage tooling contract

Because the tech stack is not yet selected, define a tool-agnostic contract that any chosen stack must satisfy:

* The test runner must support:
  * deterministic CLI execution (non-interactive)
  * machine-readable output for CI
* Coverage must be produced in at least one standard interchange format (recommended: `lcov` and/or `cobertura`).
* CI must enforce the two-tier thresholds:
* 90% for "core code"
* 80% for the whole codebase

Default selection guidance (pick based on implementation language):

* Python: `pytest` + `coverage.py`
* Node/TypeScript: `vitest` + `c8` (or `jest` + `c8`)
* Go: `go test -coverprofile`
* Rust: `cargo llvm-cov`

#### 6.1.2 “Core code” definition (recommended default)

To make “90% core coverage” measurable without ambiguity, define “core code” structurally:

* Recommended repo layout for this product:
  * `src/core/` — business rules and domain logic (CORE)
  * `src/cli/` — CLI command parsing, orchestration (CORE)
  * `src/adapters/` — integrations (OpenCode/Copilot/Beads wrappers)
  * `src/experimental/` — feature-flagged or in-progress work (NON-CORE by default)
* “Core code” is: `src/core/**` + `src/cli/**`.
* “Entire codebase” is everything under `src/**`.

Note: if the eventual implementation chooses a different layout, it must still provide an explicit, directory-based mapping of “core” vs “non-core”.

### 6.2 Requirement: `main` is always releasable (see wf-ba2.6.2, wf-ba2.8, wf-ba2.9)

Definition: at all times, the current `main` branch MUST meet all of the following:

* 100% tests pass.
* Core code has 90%+ test coverage.
* All code has 80%+ test coverage.
* No feature that has not undergone user testing is enabled by default.
* Documentation is up to date and includes example user-scenarios for user testing of all features.

## 7) Security, Privacy, and Data Boundaries

### 7.1 Model constraints (confirmed)

* MUST use OpenAI-compatible agents.
* MUST use GitHub Copilot.

### 7.2 Data boundaries (confirmed)

* MUST NOT send any data excluded by `.gitignore`.

### 7.3 Enforcement requirements (TBD) (see wf-ba2.5, wf-ba2.5.1)

* Define how the CLI determines what OpenCode is allowed to read/send.
* Define how to fail safely (block action + explain why) when uncertain.

## 8) Context Sharing: PM ↔ OpenCode (confirmed requirement) (see wf-ba2.5, wf-ba2.5.2)

### 8.1 Requirement

The CLI must provide a mechanism to share actionable context between the PM and OpenCode.

### 8.2 Initial design constraints (TBD)

* Must respect ignore boundaries in section 7.
* Must be reviewable and reproducible.

### 8.3 Proposed mechanisms (pick one; TBD)

* A generated “context pack” Markdown file under `docs/dev/` (manually fed into OpenCode).
* A deterministic command that prints a safe, redacted context snapshot to stdout.
* A shared session log file that OpenCode can ingest.

Default recommendation (v1): generate a Markdown "context pack" file.

* CLI provides a command (name TBD) that writes `docs/dev/CONTEXT_PACK.md` containing:
  * current objective
  * top priorities / ready work (derived from `bd ready --json`)
  * key decisions and assumptions
  * release status and freeze status (policy-only)
  * links to relevant docs and issue IDs
* PM shares this file with OpenCode as the canonical "shared context".
* The CLI must ensure the file itself contains no ignored content (see section 7).

#### 8.3.1 Example template for `docs/dev/CONTEXT_PACK.md`

The CLI should generate a file that follows a stable, greppable structure.

```markdown
# Context Pack

## Objective

- <one sentence objective>

## Current Focus

- Workflow stage: intake | triage | plan | ship
- Primary epic (if any): <beads-id or none>

## Ready Work (Top 10)

- <beads-id>: <title> (p<0-4>)
- <beads-id>: <title> (p<0-4>)

## Blockers / Risks

- <beads-id or freeform>: <what is blocked and why>

## Recent Decisions

- <date>: <decision>

## Assumptions

- <assumption>

## Release Status

- Target release: <git tag vX.Y.Z or TBD>
- Freeze status: soft-freeze active | not active
- Release notes file: docs/releases/<git-tag>.md (if exists)

## Feature Flags

- Default OFF flags:
  - <FLAG_NAME>: <description>

## Links

- Roadmap: docs/dev/ROADMAP.md
- Changelog: docs/CHANGELOG.md
- PRD (CLI): docs/dev/CLI_PRD.md
- PRD (TUI): docs/dev/TUI_PRD.md
```

Notes:

* The “Ready Work” section should be generated from Beads state and limited to a configurable N.
* Avoid embedding any content from ignored files; keep this as a structured summary.

## 9) Scale & Performance (confirmed) (see wf-ca1)

### 9.1 Target scale

* Up to ~1000 open issues.

### 9.2 Performance expectations (TBD)

* Acceptable latency for listing/plan generation.
* Memory constraints (local machine assumptions).

## 10) Risks & Mitigations (see wf-ba2.5, wf-ba2.7, wf-ba2.8)

* Risk: Duplicate issues → Mitigation: search/list before create; dedupe prompts.
* Risk: Drift between docs and issues → Mitigation: link artifacts to issue IDs; reconciliation command.
* Risk: Over-automation reduces trust → Mitigation: “propose → confirm → execute” workflow; previews are best-effort and cannot guarantee strict `--dry-run` behavior once agent hand-offs occur.
* Risk: Ignore boundary breach → Mitigation: default-deny behavior + explicit allowlist.

## 11) Open Questions (CLI Only)

1. Release id convention: semver-based git tag (confirmed).
2. Code freeze enforcement: policy-only initially (confirmed); revisit CI enforcement later.
3. Coverage definition: defaults proposed in section 6.1; confirm or adjust during implementation.
4. Context sharing mechanism: default proposed in section 8.3 (“context pack” Markdown file); confirm or adjust during implementation.
