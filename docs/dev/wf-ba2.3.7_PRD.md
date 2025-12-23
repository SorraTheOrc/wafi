# Product Requirements Document: Integrate `waif prd` with OpenCode PRD Agent

Source issue: wf-ba2.3.7

## Introduction

- One-liner
  - Make `waif prd` able to invoke (or at least reliably guide the user to invoke) the OpenCode PRD Agent workflow (`/prd`) with the right inputs and two-way traceability.

- Problem statement
  - The repository has an OpenCode PRD Agent command (`/prd`) but the WAIF CLI `waif prd` is not consistently wired to it.
  - Cross-linking between issues and PRDs is inconsistent (issue description line vs comment vs `external_ref`).
  - Users want a single predictable flow from issue/prompt r PRD file.

- Goals
  - Define the canonical integration behavior for `waif prd`.
  - Define canonical cross-linking semantics (idempotent) between Beads issues and PRDs.
  - Ensure the integration respects ignore boundaries and is audit-friendly.

- Non-goals
  - Building a full TUI for PRD authoring (covered elsewhere).
  - Implementing a new OpenCode protocol; use existing OpenCode CLI/commands.

## Users

- Primary users
  - PM/human producer who wants to author PRDs quickly with agent help.

- Secondary users
  - Workflow agents that rely on stable link surfaces (PRD paths, source issue markers).

## UX / CLI flows

### Inputs

- `waif prd --issue <id> --out <path>`
  - Seeds PRD generation from a Beads issue.

- `waif prd --prompt <text> --out <path>`
  - Seeds PRD generation from prompt text.

### Interactive agent integration

- Preferred behavior (when OpenCode is available)
  - `waif prd` emits the exact `/prd <path> <issue-id>` command needed and optionally injects it into the OpenCode session if running in an agent-managed tmux workflow.

- Fallback behavior
  - If OpenCode cannot be launched/injected, `waif prd` prints a clear next step and exits 0:
    - Example: `Next: run /prd docs/dev/foo_PRD.md wf-123`

## Requirements

### Functional requirements

1. Canonical cross-linking semantics (idempotent)
   - When `--issue <id>` is provided and a PRD path is known, `waif prd` must ensure:
     - PRD file contains `Source issue: <id>` near the top.
     - Issue has `external_ref` set to `PRD: <path>`.
     - Issue has a single comment `Linked PRD: <path>`.
   - Re-running must not create duplicate comments/lines.

2. OpenCode PRD Agent invocation strategy
   - `waif prd` must provide an “instruction emission” path that always works:
     - print the `/prd` command.
   - Optionally, in a tmux workflow, `waif prd` may inject the `/prd` command into the correct OpenCode pane.

3. Output path rules
   - PRD outputs live under `docs/dev/` by default.
   - If the user passes `--out`, obey it, but still enforce `.gitignore` (do not write into ignored paths).

4. Safety / ignore boundaries
   - Never read from or write to ignored paths when assembling context or generating PRD output.

### Non-functional requirements

- Auditability
  - All mutations are visible in git and the Beads JSONL.

- Determinism
  - For a given `--issue` seed and a fixed PRD file, repeated runs do minimal, structure-preserving edits.

## Test plan

- Unit tests
  - Idempotent linking behavior (no duplicate comments/description lines).
  - `.gitignore` enforcement for PRD output path.

- E2E tests
  - `waif prd --issue ... --out ...` prints the correct `/prd` invocation.

## Open questions

1. Should the canonical link location be issue comment or description line?
2. How does waif determine the correct tmux pane for OpenCode injection?
3. Should `waif prd` attempt to launch OpenCode automatically, or be instruction-only by default?
