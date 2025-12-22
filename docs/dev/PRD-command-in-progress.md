# Product Requirements Document

Source issue: wf-10f

## Introduction

* One-liner
  * Define the product requirements for the `waif in-progress` command output, with a focus on making active blockers visible inline.

* Problem statement
  * `waif in-progress` currently prints a table of in-progress Beads issues, but it does not clearly communicate which specific issues are blocking each in-progress item.
  * While the output can include a numeric blocker count, users still have to manually run `bd show` or inspect issues to understand what is blocking active work.
  * This adds friction during day-to-day execution and reduces at-a-glance clarity in narrow terminal panes (e.g., tmux).

* Goals
  * Make blocking dependencies visible directly in `waif in-progress` human output.
  * Reuse the existing table renderer so the output remains consistent with other commands.
  * Preserve machine-readable output (`--json`) for automation.

* Non-goals
  * Changing Beads dependency semantics or adding new dependency types.
  * Changing the `--json` schema for `waif in-progress`.
  * Building a new TUI view; this is CLI output behavior only.

## Users

* Primary users
  * Producer / PM monitoring work in progress and looking to quickly identify what to close to unblock work.

* Secondary users (optional)
  * Workflow agents and maintainers who want fast visibility into blockers without additional commands.

* Key user journeys
  * Run `waif in-progress` and immediately see, for each issue, *exactly* which non-closed issues are blocking it.
  * Run `waif in-progress --json` in scripts and receive the same payload as before.

## Requirements

* Functional requirements (MVP)
  1. `waif in-progress` prints the existing “In Progress” heading and main in-progress table, as it does today.
  2. After each issue row in the main table, `waif in-progress` prints an indented blocker section:
     * If there are one or more `blocks` dependencies whose target issue status is not terminal (`closed`, `done`, `tombstone`), print an indented sub-table listing those blocking issues.
     * If there are zero such blockers, print an indented line: `No blockers`.
  3. The blocker sub-table must:
     * Use the same table rendering function/format as the main table.
     * Be sorted by blocking issue ID (stable ordering).
     * Be indented by **2 spaces** on every line.
  4. Fallback behavior when dependency details are incomplete:
     * If the command cannot resolve a blocker's status/details (e.g., missing enrichment data), it should still list the blocker entry (treat as blocking) with whatever fields are available.
  5. `waif in-progress --json` remains unchanged.

* Non-functional requirements
  * Readability: output should be scannable in narrow terminal panes.
  * Determinism: within a run, blocker lists should be stable (sorted by ID).
  * Low risk: reuse existing dependency enrichment logic where practical.

* Integrations
  * Beads CLI (`bd`) when available for loading issue details and dependencies.
  * `.beads/issues.jsonl` as fallback data source.

* Security & privacy
  * The command should not output any additional sensitive data beyond what is already present in Beads issue metadata.

## Release & Operations

* Rollout plan
  * Implement behind existing human-output path (default behavior), leaving `--json` unchanged.
  * Add/update tests for `waif in-progress`.

* Quality gates / definition of done
  * Unit/integration tests passing (`npm test`).
  * Verified human output includes indented blocker sections with 2-space indentation.
  * Verified `--json` output unchanged.

* Risks & mitigations
  * Risk: More verbose output could reduce scan speed.
    * Mitigation: indentation + consistent table format; keep output strictly per-issue.
  * Risk: Incomplete dependency data might hide blockers.
    * Mitigation: treat unresolved blockers as blocking and still list them.

## Open Questions

* None (decisions locked for MVP):
  * Indentation: 2 spaces.
  * Unresolved dependency details: list them anyway.
  * Ordering: sort by ID.
