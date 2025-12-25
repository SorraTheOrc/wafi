# PRD-Driven Workflow (Human + Agent Team)

## Introduction

This document describes a PRD-driven workflow for building new products and features using a mix of human collaborators (PM, design, engineering, QA) and agent collaborators (coding agents, doc agents, review agents). The workflow emphasizes:

* A single source of truth in the repo (PRDs, issues, release notes)
* Clear handoffs and auditability (who decided what, and why)
* Keeping `main` always releasable via feature flags and quality gates

By default, this workflow is tool-agnostic about the implementation stack (language, framework, test runner). It assumes this repository is the system of record.

## Prerequisites

You need the following available to follow this workflow end-to-end:

* Repo access with permission to create/edit files under `docs/`.
* A shared issue tracking mechanism.
  * In this repo, use `bd` (beads) for issue tracking.
* An agreed PRD template.
  * In this repo, use the OpenCode command `/prd` to create an PRD via Agent based interview (stored under `.opencode/command/prd.md`).
* A minimal quality bar for “releasable `main`” (tests/coverage gates, feature-flag policy, and review policy).

## Setting up the environment

This section defines all environment variables used in this document. Defaults are designed to work in typical local dev shells.

```bash
# Unique suffix for names created during this session.
# Format: YYMMDDHHMM
export HASH="$(date +%y%m%d%H%M)"

# Human-readable product or feature name.
export FEATURE_NAME="example_feature_${HASH}"

# Where the PRD should live.
# Convention: docs/dev/
export PRD_PATH="docs/dev/${FEATURE_NAME}_PRD.md"

# Where release notes should live.
# Convention: docs/releases/
export RELEASE_NOTES_PATH="docs/releases/${FEATURE_NAME}_${HASH}.md"

# Optional semver tag to cut a release.
# Convention: git tags are the release IDs.
export RELEASE_TAG="0.1.0-${HASH}"

# Optional: a short agent role label for logs/notes.
export AGENT_ROLE="build"
```

Summary: after this section, the rest of the steps can be executed by copy/pasting the commands and editing only environment variables.

## Steps

### 1) Start with an intake brief

The goal is to capture just enough context to decide whether you are creating something new or changing something that exists.

* Human responsibilities:
  * State the problem, users, and success criteria (one paragraph each).
  * State constraints (timeline, risk, compatibility expectations).
* Agent responsibilities:
  * Search the repo for related PRDs/specs and surface likely duplicates.
  * Search the issue tracker for related items.
  * Produce a short list of clarifying questions.
  * Create an issue to track the creation of the brief. Record all information in the issue description and link any apporpriate PRDs, specs and existing issues.

Summary: you should now know whether the work needs a new PRD or an update to an existing PRD.

### 2) Create or edit the PRD via interview

Use an interview flow so that the PRD captures decisions and open questions rather than guessing.

* Human responsibilities:
  * Answer the interview questions.
  * Approve the PRD scope and non-goals.
* Agent responsibilities:
  * Run the interview.
  * Write or update the PRD in `docs/dev/`.
  * If starting from a `bd` issue ID, use the issue content (description, acceptance) as the initial context for the interview.
  * Preserve structure when editing: update only what changed, and append newly discovered open questions.

Invocation pattern (OpenCode TUI):

```bash
# Optional: seed the PRD interview from an existing beads issue.
# Use either a project issue id (e.g., beads-testing-73k) or a short id (e.g., bd-123) if your setup uses that format.
export ISSUE_ID="beads-testing-73k"

# In the OpenCode TUI, run:
# /prd $PRD_PATH $ISSUE_ID
```

Summary: at the end of this step, there is a concrete PRD file at `$PRD_PATH`.

### 3) Review and sign-off the PRD

PRDs are only useful when they drive execution. This step makes the PRD “real” by forcing scope agreement.

* Human responsibilities:
  * Confirm success metrics, user flows, and acceptance criteria.
  * Decide which open questions must be resolved before implementation vs. can be deferred.
* Agent responsibilities:
  * Validate the PRD is testable (clear acceptance criteria).
  * Identify missing operational requirements (observability, migration, rollback).

Summary: the PRD is now approved and ready to be decomposed into executable work.

### 4) Decompose the PRD into issues and milestones

Turn the PRD into a sequence of deliverable increments. Prefer smaller vertical slices.

In this repo, we treat each milestone as a user-testable unit of value: it should put something new in front of users, even if it is incomplete.

* Human responsibilities:
  * Prioritize milestones (earliest user feedback wins).
  * Confirm what the user can do in each milestone.
* Agent responsibilities:
  * Propose a milestone plan and map issues to milestones.
  * Create a master epic and decompose into child epics/issues.
  * Ensure dependencies are explicit and cycle-free.
  * Ensure every issue has a definition of done (or acceptance criteria).

Beads conventions used in decomposition:

* Master epic: create one top-level epic (e.g., "PM Agent MVP") to represent the end-to-end deliverable.
* Child epics: create child epics as `--parent <master-epic-id>` to group workstreams (CLI, template, git, etc.).
* Milestones: label epics/issues with `milestone:M0`, `milestone:M1`, ... where each milestone is independently user-testable.
* Dependencies:
  * Use `bd dep add <issue-id> <depends-on-id> -t blocks` to express ordering.
  * Note: `--parent` is also represented as a `parent-child` dependency internally. If you also add `blocks` edges between parent and child in both directions, you can create cycles. Prefer using `--parent` for hierarchy and `blocks` for cross-epic ordering.

```bash
# Example beads workflow (IDs will differ).

# 1) Create the master epic
MASTER_EPIC_ID=$(bd create "${FEATURE_NAME}: MVP" -t epic -p 1 --json | jq -r '.id')

# 2) Create child epics (hierarchy)
CLI_EPIC_ID=$(bd create "${FEATURE_NAME}: CLI" -t epic -p 1 --parent "$MASTER_EPIC_ID" --labels "milestone:M0" --json | jq -r '.id')
TEMPLATE_EPIC_ID=$(bd create "${FEATURE_NAME}: Template" -t epic -p 1 --parent "$MASTER_EPIC_ID" --labels "milestone:M0" --json | jq -r '.id')

# 3) Create milestone issues under each epic
CLI_TASK_ID=$(bd create "CLI skeleton + create command" -t task -p 1 --parent "$CLI_EPIC_ID" --labels "milestone:M0" --json | jq -r '.id')
PRD_TASK_ID=$(bd create "Generate minimal PRD markdown" -t task -p 1 --parent "$TEMPLATE_EPIC_ID" --labels "milestone:M0" --json | jq -r '.id')

# 4) Wire dependencies (PRD generation requires CLI)
bd dep add "$PRD_TASK_ID" "$CLI_TASK_ID" -t blocks --json

# 5) Find unblocked work
bd ready --json
```

Summary: the PRD is now expressed as milestone-labeled issues with explicit dependencies, ready for parallel human/agent execution.

### 5) Implement in small, releasable increments

Implementation should keep `main` always releasable.

* Human responsibilities:
  * Review design choices that affect UX, safety, and maintainability.
  * Decide on feature-flag strategy (default OFF until complete).
* Agent responsibilities:
  * Implement scoped changes per issue.
  * Update tests and docs for the change.
  * Keep changes minimal and aligned with repo conventions.
  * Use the OpenCode command `/implement <bd-id>` for the canonical branch/PR workflow and Beads hygiene.

Quality and releaseability rules (recommended):

* Feature flags:
  * New behavior ships behind a default-OFF flag until complete.
* CI:
  * Tests must pass on `main`.
  * Coverage thresholds (project-defined) must be met.
* Documentation:
  * User-testing scenario(s) are documented for each shipped feature.

In this repo, agents should not hand-roll the implementation workflow. Instead, use:

```bash
# In the OpenCode TUI:
# /implement <bd-id>
# Example:
# /implement beads-testing-73k
```

`/implement` is responsible for:
- creating a working branch (no direct-to-main work)
- pushing the branch to `origin`
- opening/linking a PR
- updating the Beads issue with PR references
- keeping the Beads issue open until the PR is merged

Summary: work progresses issue-by-issue while preserving a stable `main`.

### 6) Review, merge, and close the loop

Each increment should end with a reviewable change and a merged PR.

* Human responsibilities:
  * Review the PR for correctness and product intent.
  * Confirm user-testing evidence (manual or scripted).
* Agent responsibilities:
  * Pre-review: run checks, ensure docs updated, summarize change risks.
  * Post-merge: close the issue(s) with clear reasons (do not close before merge).

After the PR is merged, close the corresponding Beads issue and sync Beads state (see `/implement` for the canonical steps).

Summary: each issue ends with a merge to `main` and then a recorded closure.

### 7) Cut a release and write release notes

Releases should be tag-based, and release notes should be written in-repo.

* Human responsibilities:
  * Decide the release scope and whether to perform a soft freeze.
* Agent responsibilities:
  * Draft release notes from merged issues.
  * Ensure all flags are in the intended state.

```bash
# Draft release notes file.
printf "# Release Notes\n\nRelease: %s\n\n## Highlights\n- \n\n## Changes\n- \n\n## Flags\n- \n\n## Known issues\n- \n" "$RELEASE_TAG" > "$RELEASE_NOTES_PATH"

# Tag-based release ID.
# (If you prefer annotated tags, adjust accordingly.)
git tag "$RELEASE_TAG"
```

Summary: the release is identified by a semver-like git tag and documented in `$RELEASE_NOTES_PATH`.

## Summary

This workflow makes PRDs the central coordination artifact and uses repo-native processes to keep work auditable and incremental.

* PRD created/edited via interview, then signed off
* PRD decomposed into issues for parallel human/agent execution
* Implementation proceeds in small increments with feature-flag gating
* `main` remains releasable; releases are tagged and documented

## Next Steps

* Decide a standard PRD filename convention (per product vs. per feature) and enforce it.
* Define the project’s “core code” coverage contract and add it to your PRD defaults.
* Add a lightweight “Release Checklist” doc that matches your team’s freeze policy and sign-off needs.
