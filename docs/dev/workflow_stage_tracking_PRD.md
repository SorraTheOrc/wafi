<!-- Seed Context (from wf-3ur.2) -->
**Source issue: wf-3ur.2**

- **Title:** Add workflow stage tracking to WAIF CLI

---

# Product Requirements Document: Workflow Stage Tracking

## Introduction

(Short one-liner)

## Problem

It can be hard for humans to track what stage a feature is at (idea, PRD, plan, implementation, etc.). This problem will worsen as agents operate in parallel. We need a way to persist the current stage of work and expose it succinctly to PMs.

## Users

Primary: Product Managers. Secondary: agent orchestrators, release managers, QA.

## Success Criteria

PMs can run a  command and be told, concisely and clearly, which stage of the workflow they are at and which stage of the command implementing that workflow is underway.

## Constraints

Must be additive to Beads (.beads/issues.jsonl), not change existing issue IDs, and be low-risk for initial iteration.

## Existing State

No dedicated PRD or implementation currently exists in  or  for stage tracking. Related issues:
- wf-3ur (WAIF version 0.2)
- wf-3ur.1 (Add --number/-n option)
- wf-ba2.1.9 (Rule of Five)

## Desired change

Add a persistent  signal to issues (and optionally a small structured worklog). Provide a  command for concise output for PMs and an API for agents to update stage entries idempotently.

## Open Questions

1) Which canonical stages to support initially?
2) Single current stage vs historical worklog?
3) Who can programmatically update stages?

## Next steps

- Gather canonical stage list and permissions.
- Prototype with issue  field + linked chore for history.
- Implement  CLI and tests.

