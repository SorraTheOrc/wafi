# Product Requirements Document

## Introduction

* One-liner
  * CLI tool `waif` exposing subcommand `next` that returns the single best issue to work on now, with a human summary and an optional `--json` machine output.

* Problem statement
  * PMs and AI orchestrators spend time deciding what to work on next. This command reduces decision friction by selecting the top, unblocked, high-value issue using repository issue metadata and existing bv prioritization scores.

* Goals
  * Deliver a reliable CLI tool that lists the single best open, unblocked issue and explains why it was chosen.
  * Provide `--json` output matching `bd`'s JSON issue format, with computed scoring metadata included under a top-level `waif` metadata object for automation.
  * Use only issue metadata and bv prioritization scores (no human availability or external calendars).

* Non-goals
  * Assigning or scheduling issues to specific people.
  * Integrating human availability or calendar data.

> Source issue: wf-74

## Users

* Primary users
  * Product Manager (PM) — wants a fast, defensible recommendation for the next item to work on.

* Secondary users (optional)
  * AI orchestrator / automation tooling — consumes `waif next --json` for programmatic decision-making.

* Key user journeys
  * PM runs: `waif next` → sees a one-line summary and a 1–2 sentence rationale with link to the issue.
  * PM runs: `waif next --json` → receives bd-format JSON augmented with a top-level `waif` object containing computed score and ranking metadata.
  * Automation: scheduled agent runs `waif next --json` to seed downstream orchestration workflows.

## Requirements

* Functional requirements (MVP)

1. `waif next` lists eligible candidates (open and unblocked) and returns the top-ranked issue.
2. `waif next` prints a human-readable single-line summary: `<id>: <title> — <short rationale>`.
3. `waif next --json` prints a JSON object with full issue details plus computed score and ranking metadata.
4. Ranking must use existing bv prioritization scores as the primary signal; tie-break deterministically (e.g., by priority then created\_at).
5. CLI flags: `--json`, `--verbose` (debug logs).
6. Read-only operation: the command must not modify issue state.

* Non-functional requirements
  * Fast: complete within a few seconds for typical repo sizes.
  * Deterministic: given the same inputs, ranking output should be stable.
  * Testable: include unit tests for ranking and JSON output format.
  * Minimal dependencies: rely on `bd`/`bv` query outputs where possible.

* Integrations
  * Beads CLI (`bd`) and bv ranking tool as data sources (or local computation of available metrics). Use `bd ready --json` / `bd list --json` to enumerate candidates.
  * CLI implementation must follow the repo's CLI conventions and be runnable as `waif next` subcommand.

* Security & privacy
  * The command only reads issue metadata; do not emit secrets or sensitive attachments.
  * JSON output should be safe for machine use; redact fields that contain secrets if any appear in issue metadata.

## Release & Operations

* Rollout plan
  1. Implementation in a feature branch with tests.
  2. Merge to main and tag a minor release.
  3. Monitor usage and errors for the first two weeks.

* Quality gates / definition of done
  * Unit tests covering ranking logic and JSON output pass.
  * CLI integration test that runs against a test beads dataset.
  * PR reviewed and merged; `waif` documented in README/CLI docs.
  * Example usage added to `docs/Workflow.md` showing how it fits into Rule-of-Five.

* Risks & mitigations
  * Risk: Ranking surprises PMs (opaque rationale). Mitigation: include explicit rationale and ranking metadata (scores, contributing signals).
  * Risk: BV scores unavailable or stale. Mitigation: fallback to a reproducible local scoring heuristic and surface which signal was used.
  * Risk: Performance on large issue sets. Mitigation: paginate or limit candidates (e.g., top N by priority) before heavy scoring.

## Open Questions

* None remain; the intake decisions:
  * No numeric threshold for "high value" (always pick top-ranked). (resolved)
  * No banned labels to exclude. (resolved)
  * No time-based preferences (resolved)

## Appendices / Notes

* Implementation notes

  * Prefer querying `bd ready --json` to get unblocked candidates, then enrich with bv scores.
  * `waif next --json` should emit the exact `bd show`/`bd` JSON issue object for the selected issue, with an additional top-level `waif` object.

  Example output shape:

  ```json
  {
    "id": "wf-123",
    "title": "...",
    "description": "...",
    "...": "(other bd fields)",
    "waif": {
      "score": 12.34,
      "rationale": "high priority + low dependency depth",
      "rank": 1,
      "metadata": { }
    }
  }
  ```
