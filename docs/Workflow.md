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
waif intake --title "Feature X: Intake brief" \
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
export ISSUE_ID="waif-73k"

# In the OpenCode TUI, run:
# /prd $PRD_PATH $ISSUE_ID
```

Invocation pattern (CLI stub generator):

Use this when you want a deterministic, non-interactive PRD stub file created on disk (for example: to hand-edit it, attach it to an issue, or feed it into a later generation step).

```bash
# Prompt via CLI argument
waif prd --out "$PRD_PATH" --prompt "<your prompt text>"

# Prompt from stdin (explicit)
printf "%s" "<your prompt text>" | waif prd --out "$PRD_PATH" --prompt -

# Prompt from file
waif prd --out "$PRD_PATH" --prompt-file docs/dev/prompt.txt
```

Notes:

- `--prompt` and `--prompt-file` are mutually exclusive; providing both exits with code 2.
- The prompt is embedded into the PRD as a comment block so the context is preserved in-repo.

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

Notes added: workflow doc updated to include parallel session behavior.

## Summary of parallel session support

To support multiple teams running concurrently on the same host, the scripts/start-workflow-tmux.sh script now derives a default tmux session name from the repository directory basename. The session name pattern is:

```
WAIF_session_<Team>
```

Where <Team> is the sanitized basename of the cloned repository directory. Example:

- Clone into ~/projects/my-team/waif and run `scripts/start-workflow-tmux.sh` -> session name: `WAIF_session_waif` (if basename is 'waif')
- Clone into ~/projects/my-team and run `scripts/start-workflow-tmux.sh` -> session name: `WAIF_session_my-team`

Notes:
- You can still override the session name with `--session <name>`.
- The script sanitizes directory names to replace non-alphanumeric characters with underscores for tmux safety.

## Steps

(remaining content unchanged — earlier sections preserved)
