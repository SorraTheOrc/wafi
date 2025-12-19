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
2. `waif next` prints human-readable output. When `bd` is available, the command prepends the short rationale and then includes the full `bd show <id>` output for human consumption. When `bd` is not available, the command falls back to a concise single-line summary: `<id>: <title> — <short rationale>`.
3. `waif next --json` prints a JSON object with full issue details plus computed score and ranking metadata.
4. Ranking uses existing bv prioritization scores as the primary signal; tie-break deterministically by computed numeric score and, if equal, by `id` (lexicographic).
5. CLI flags: `--json`, `--verbose` (debug logs).
6. Read-only operation: the command must not modify issue state.

* Non-functional requirements
  * Deterministic: given the same inputs, ranking output should be stable.
  * Testable: include unit tests for ranking and JSON output format.
  * Minimal dependencies: rely on `bd`/`bv` query outputs where possible.
  * Performance concerns for very large issue sets were considered and deemed unnecessary for MVP; the current implementation scores the candidate set returned by `bd ready --json` in-memory.

* Integrations
  * Beads CLI (`bd`) and bv ranking tool as data sources (or local computation of available metrics). Use `bd ready --json` / `bd list --json` to enumerate candidates.
  * CLI implementation must follow the repo's CLI conventions and be runnable as `waif next` subcommand.

* Security & privacy

  * The command only reads issue metadata; do not emit secrets or sensitive attachments.
  * Redaction was reviewed and deemed unnecessary for this project: issue metadata is considered safe to re-emit in JSON output for machine consumption.


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
      "metadata": {
        "issuesSource": "bd|jsonl|env",
        "bvSource": "bv|env|none",
        "priority": 1,
        "created_at": "2025-01-01T00:00:00Z",
        "tie_break": "id",
        "contributing_signals": {
          "bv_score": 12.34,
          "priority_score": 4000000,
          "recency_score": -1700000000,
          "dependency_depth": 2
        }
      }
    }
  }
  ```
