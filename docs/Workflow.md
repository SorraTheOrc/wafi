# PRD-Driven Workflow (Human + Agent Team)

## Introduction

This document describes a PRD-driven workflow for building new products and features using a mix of human collaborators (PM, design, engineering, QA) and agent collaborators (coding agents, doc agents, review agents). The workflow emphasizes:

- A single source of truth in the repo (PRDs, issues, release notes)
- Clear handoffs and auditability (who decided what, and why) (see wf-ba2.8)
- Keeping `main` always releasable via feature flags and quality gates

By default, this workflow is tool-agnostic about the implementation stack (language, framework, test runner). It assumes this repository is the system of record.

## Prerequisites

You need the following available to follow this workflow end-to-end:

- Repo access with permission to create/edit files under `docs/`.
- A shared issue tracking mechanism.
  - In this repo, use `bd` (beads) for issue tracking. (see wf-dt1, wf-ca1)
- An agreed PRD template.
  - In this repo, use the OpenCode command `/prd` to create an PRD via Agent based interview (stored under `.opencode/command/prd.md`). (see wf-ba2.3)
- A minimal quality bar for “releasable `main`” (tests/coverage gates, feature-flag policy, and review policy).

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

Rule of Five policy: each major step below should be iterated 5 times before considering it complete (see wf-ba2.1).

### 1) Start with an intake brief (see wf-ba2.1.1)

The goal is to capture just enough context to decide whether you are creating something new or changing something that exists.

- Human responsibilities:
  - State the problem, users, and success criteria (one paragraph each).
  - State constraints (timeline, risk, compatibility expectations).
- Agent responsibilities:
  - Search the repo for related PRDs/specs and surface likely duplicates.
  - Search the issue tracker for related items.
  - Produce a short list of clarifying questions.
  - Create an issue to track the creation of the brief. Record all information in the issue description and link any appropriate PRDs, specs and existing issues.

Summary: you should now know whether the work needs a new PRD or an update to an existing PRD.

Example: Automating intake → PRD

- Using the CLI, the intake command creates the beads issue and (optionally) writes a PRD and cross-links both artifacts.

```bash
# Create an intake issue, write PRD, and link them in one step
wafi intake --title "Feature X: Intake brief" \
  --desc "Problem summary and success criteria..." \
  --prd docs/dev/feature_x_PRD.md

# This sequence does:
# 1) bd create "Feature X: Intake brief" -t feature -p 2 --description "..." --json
# 2) write PRD at docs/dev/feature_x_PRD.md containing "Source issue: <new-id>"
# 3) bd update <new-id> --body-file - < docs/dev/feature_x_PRD.md  (adds "Linked PRD: docs/dev/feature_x_PRD.md")
```

Notes:
- The tool prefers calling `bd` for issue creation and update; when `bd` is unavailable it falls back to a deterministic edit of `.beads/issues.jsonl` and prints exact manual steps for the user.
- The cross-link is idempotent: re-running the same command will not add duplicate `Linked PRD` lines.

### 2) Create or edit the PRD via interview (see wf-ba2.2, wf-ba2.3)

Use an interview flow so that the PRD captures decisions and open questions rather than guessing.

- Human responsibilities:
  - Answer the interview questions.
  - Approve the PRD scope and non-goals.
- Agent responsibilities:
  - Run the interview.
  - Write or update the PRD in `docs/dev/`.
  - If starting from a `bd` issue ID, use the issue content (description, acceptance) as the initial context for the interview.
  - Preserve structure when editing: update only what changed, and append newly discovered open questions.

Invocation pattern (OpenCode TUI):

```bash
# Optional: seed the PRD interview from an existing beads issue.
# Use either a project issue id (e.g., wafi-73k) or a short id (e.g., bd-123) if your setup uses that format.
export ISSUE_ID="wafi-73k"

# In the OpenCode TUI, run:
# /prd $PRD_PATH $ISSUE_ID
```

Summary: at the end of this step, there is a concrete PRD file at `$PRD_PATH`.

### 3) Review and sign-off the PRD

PRDs are only useful when they drive execution. This step makes the PRD “real” by forcing scope agreement.

- Human responsibilities:
  - Confirm success metrics, user flows, and acceptance criteria.
  - Decide which open questions must be resolved before implementation vs. can be deferred.
- Agent responsibilities:
  - Validate the PRD is testable (clear acceptance criteria).
  - Identify missing operational requirements (observability, migration, rollback).

Summary: the PRD is now approved and ready to be decomposed into executable work.

### 4) Decompose the PRD into issues and milestones (see wf-ba2, wf-ba2.2, wf-ba2.3, wf-ba2.4, wf-ba2.5, wf-ba2.6, wf-ba2.7, wf-ba2.8, wf-ba2.9)

Turn the PRD into a sequence of deliverable increments. Prefer smaller vertical slices.

In this repo, we treat each milestone as a user-testable unit of value: it should put something new in front of users, even if it is incomplete.

- Human responsibilities:
  - Prioritize milestones (earliest user feedback wins).
  - Confirm what the user can do in each milestone.
- Agent responsibilities:
  - Propose a milestone plan and map issues to milestones.
  - Create a master epic and decompose into child epics/issues.
  - Ensure dependencies are explicit and cycle-free.
  - Ensure every issue has a definition of done (or acceptance criteria).

Beads conventions used in decomposition:

- Master epic: create one top-level epic (e.g., "PM Agent MVP") to represent the end-to-end deliverable.
- Child epics: create child epics as `--parent <master-epic-id>` to group workstreams (CLI, template, git, etc.).
- Milestones: label epics/issues with `milestone:M0`, `milestone:M1`, ... where each milestone is independently user-testable.
- Dependencies:
  - Use `bd dep add <issue-id> <depends-on-id> -t blocks` to express ordering.
  - Note: `--parent` is also represented as a `parent-child` dependency internally. If you also add `blocks` edges between parent and child in both directions, you can create cycles. Prefer using `--parent` for hierarchy and `blocks` for cross-epic ordering.

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

### 4.1) Select the next most important issue (PM agent) (see wf-dt1, wf-ca1)

The PM agent should treat `bd` as the source of truth for _state_ (open/in-progress/closed, priority, labels, assignee) and use `bv` for _impact-aware ranking_ (dependency graph analysis).

Recommended policy:

- Eligibility gate (must be true):
  - The issue is actionable now: `bd ready --json` includes it.
  - The issue is not already claimed by someone else.
- Ranking (use `bv` to decide among eligible items):
  - Prefer the top recommendation from `bv --robot-next`.
  - If you want a short ranked list with reasoning, use `bv --robot-triage` or `bv --robot-priority --robot-max-results 5`.

Why `bv` is better than `bd` for “what next”:

- `bd` can tell you what is unblocked; it cannot tell you what is most _structurally valuable_.
- `bv` scores issues using graph metrics like:
  - **PageRank** ("blocking power" / centrality): picks keystone dependencies.
  - **Betweenness** (bottleneck score): picks issues that sit on critical routes.
  - **Critical path depth**: picks issues that shorten a long chain of work.
  - **Unblocks (direct + transitive)**: picks issues that unlock the most work.
  - **Articulation points**: picks issues that disconnect the graph (high leverage).

Concrete selection loop (agent-friendly):

```bash
# 1) Confirm what is actionable right now
bd ready --json

# 2) Ask bv for the single best next pick
bv --robot-next

# 3) If you need context or alternatives
bv --robot-triage

# 4) (Optional) If you are maintaining priority hygiene
bv --robot-priority --robot-max-results 5

# 5) Claim the chosen issue (copy the claim_command from bv output)
# bd update <id> --status=in_progress
```

Handling common edge cases:

- If `bv --robot-next` returns an **epic**:
  - Prefer to work a ready **leaf task/bug** under that epic (epics are often just containers).
  - If there are no ready leaf issues, the epic work item is usually “decompose more” or “resolve blockers”; use `bv --robot-triage` → `blockers_to_clear` to pick the best unblocker.
- If `bd ready` is empty:
  - Use `bv --robot-triage` to identify the best blocker to clear, then create/adjust dependencies to make progress.
- If priorities disagree (e.g., high-impact issue is low explicit priority):
  - Treat `bv --robot-priority` as a recommendation for _updating priority_, not automatically overriding product intent.

Summary: choose from `bd ready`, rank with `bv`, then claim via `bd update`.

### 4.2) Create or improve the issue design (design agent)

Before implementation, turn the selected issue into an actionable design via an interview. The resulting design is stored directly on the issue (as `design` notes) so it remains the single source of truth alongside the issue description and acceptance criteria.

In this repo, agents should not hand-roll the design workflow. Instead, use:

`/design` (defined in `.opencode/command/design.md`)

### 5) Implement in small, releasable increments (see wf-ba2.6, wf-ba2.5, wf-ba2.2)

Implementation should keep `main` always releasable.

#### 5.0) Working tree safety (do not assume)

Before starting any implementation work, always check for uncommitted changes.

- If `git status` is not clean (including untracked files), **stop and ask** how to handle them.
- Never assume local changes are irrelevant.
- Valid dispositions (user must choose):
  - Carry changes forward into the working branch.
  - Commit changes first (on current branch or a separate prep branch).
  - Stash changes.
  - Revert/discard changes (explicit confirmation required).
  - Abort so the user can inspect.

Only proceed once the disposition is explicit.

- Human responsibilities:
  - Review design choices that affect UX, safety, and maintainability.
  - Decide on feature-flag strategy (default OFF until complete).
- Agent responsibilities:
  - Implement scoped changes per issue.
  - Update tests and docs for the change.
  - Keep changes minimal and aligned with repo conventions.
  - Use the OpenCode command `/implement <bd-id>` for the canonical branch/PR workflow and Beads hygiene.

Quality and releaseability rules (recommended):

- Feature flags:
  - New behavior ships behind a default-OFF flag until complete.
- CI:
  - Tests must pass on `main`.
  - Coverage thresholds (project-defined) must be met.
- Documentation:
  - User-testing scenario(s) are documented for each shipped feature.

In this repo, agents should not hand-roll the implementation workflow. Instead, use:

`/implement` (defined in `.opencode/command/implement.md`) (see wf-ba2.6.1, wf-ba2.6.2, wf-ba2.6.3, wf-ba2.6.4)

Summary: work progresses issue-by-issue while preserving a stable `main`.

### 6) Review, merge, and close the loop (see wf-ba2.6, wf-ba2.8, wf-ba2.9)

Each increment should end with a reviewable change and a merged PR.

- Human responsibilities:
  - Review the PR for correctness and product intent.
  - Confirm user-testing evidence (manual or scripted).
- Agent responsibilities:
  - Pre-review: run checks, ensure docs updated, summarize change risks.
  - Post-merge: close the issue(s) with clear reasons (do not close before merge).

After the PR is merged, close the corresponding Beads issue and sync Beads state (see `/implement` for the canonical steps).

Summary: each issue ends with a merge to `main` and then a recorded closure.

### 7) Cut a release and write release notes

Releases should be tag-based, and release notes should be written in-repo.

- Human responsibilities:
  - Decide the release scope and whether to perform a soft freeze.
- Agent responsibilities:
  - Draft release notes from merged issues.
  - Ensure all flags are in the intended state.

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

- PRD created/edited via interview, then signed off
- PRD decomposed into issues for parallel human/agent execution
- Implementation proceeds in small increments with feature-flag gating
- `main` remains releasable; releases are tagged and documented

## Next Steps

- Decide a standard PRD filename convention (per product vs. per feature) and enforce it.
- Define the project’s “core code” coverage contract and add it to your PRD defaults.
- Add a lightweight “Release Checklist” doc that matches your team’s freeze policy and sign-off needs.
