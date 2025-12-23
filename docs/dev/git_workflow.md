Overview

This document defines recommended Git, branch, and worktree practices for WAIF's multi-agent, multi-team workflow. The goals are to minimize merge friction, keep `main` releasable, and make coordination explicit and auditable.

TL;DR (default happy path)

1) Start from an up-to-date `main`.
2) Create a short-lived topic branch for a single bd issue.
3) Keep work small; re-sync frequently; avoid rewriting shared history.
4) Open a PR into `main` with a `bd-<id>` in the title and use the PR template.
5) Record handoffs, commands run, and files touched in bd.

Scope and assumptions (Option 3: team worktree + topic branches)

- Teams are persistent (they deliver many bd issues over time).
- Each team maintains one long-lived worktree for day-to-day work.
- Each bd issue is implemented on a short-lived topic branch created from `origin/main`.
- `main` is the canonical integration branch and must remain releasable.
- `bd` is the authoritative source of work state and the place to record handoffs, decisions, and commands executed.

Important Git worktree constraint

- A single branch cannot be checked out in multiple worktrees at once.
- If multiple agents must work in parallel on the same bd issue, they should use separate branches (agent sub-branches) and merge into the topic branch (or use stacked PRs).

Principles

- Topic branch is the unit of work: one bd issue → one topic branch.
- Keep branches short-lived and PRs small; merge frequently.
- Prefer determinism over cleverness: record what you did in bd.
- Never force-push shared branches without explicit Producer authorization.

Naming conventions

Team worktrees

- Create one worktree per team (examples):
  - `../worktree_team_core`
  - `../worktree_team_cli`
  - `../worktree_team_agents`

Topic branches

- Create one topic branch per bd issue (examples):
  - `topic/bd-123/fix-ask-prompt`
  - `topic/bd-79y/pr-title-validation`

Agent sub-branches (only when parallel work is needed)

- If multiple agents need to work at the same time on the same bd issue, create sub-branches from the topic branch:
  - `topic/bd-123/patch`
  - `topic/bd-123/docs`
  - `topic/bd-123/ci`

Branch lifecycle (topic branches)

1) Sync with `origin/main`:
   - `git fetch origin`
   - `git checkout main`
   - `git pull --rebase`

2) Create a topic branch:
   - `git checkout -b topic/bd-<id>/<short-desc>`

3) Work locally with small commits. Run local quality gates when appropriate:
   - `npm test`
   - `npm run lint`
   - `npm run build`

4) Publish and open a PR to `main`:
   - PR title must include the bd id, e.g. `bd-123: fix ask prompt`
   - Use `.github/PULL_REQUEST_TEMPLATE.md`

5) Merge to `main` only when CI is green and reviews are complete.

6) Cleanup after merge:
   - delete the remote branch
   - remove any short-lived worktrees created specifically for the topic branch

Team worktree: recommended setup

The team worktree is a stable working directory for the team. It should generally track `main` when idle and be used to create new topic branches.

Example (create once):

- `git fetch origin`
- `git worktree add ../worktree_team_<team> origin/main`

Daily usage:

- Keep the team worktree clean.
- When starting a new bd issue, create the topic branch inside the team worktree and then hand it off to an implementation agent (or publish it if multiple collaborators need it).

Worktrees and agent workflows

Agents may still use per-role worktrees (e.g., `worktree_patch`, `worktree_ship`) for isolation and reproducibility. In Option 3, those worktrees should generally operate on topic branches rather than long-lived per-issue team branches.

Recommended patterns

- One agent working solo on a topic branch:
  - Work directly on `topic/bd-<id>/<short-desc>` in their worktree.

- Multiple agents working in parallel:
  - Create agent sub-branches and merge into the topic branch.
  - Keep sub-branches short-lived.

Example parallel flow

- Create topic branch: `topic/bd-123/fix-thing`
- Create parallel branches:
  - Patch works on `topic/bd-123/patch`
  - Scribbler works on `topic/bd-123/docs`
- Merge sub-branches into `topic/bd-123/fix-thing` (merge owner coordinates).
- Open PR to `main` from `topic/bd-123/fix-thing`.

Rebasing vs merging (rules)

| Situation | Recommended update strategy |
|---|---|
| Local-only branch (not pushed / nobody else fetched it) | Rebase frequently onto `origin/main` |
| Published branch (others may have fetched) | Prefer merge from `origin/main` into branch; avoid rewriting public history |
| Long-running work | Prefer incremental PRs + feature flags; avoid mega-rebases |

Push and publish policy

- Default: humans own pushes and merges.
- Agents must follow their permission files (`.opencode/agent/*.md`). Many roles require asking before `git push`.
- Before pushing:
  - ensure local checks are run (as appropriate)
  - sync with `origin/main` (rebase or merge according to the table above)

Pull requests, reviews, and CI

- PRs are the integration and review point.
- PR titles should include the bd id (e.g., `bd-123: short description`) for traceability.
- Use `.github/PULL_REQUEST_TEMPLATE.md`.
- Branch protection should require:
  - PRs to merge to `main`
  - passing CI checks
  - at least one approving review
  - force-push disabled

See: `docs/.github/branch_protection.md`

Automation note (planned)

- We intend to add a PR validation workflow that enforces PR title formatting and (optionally) template sections.
- Tracking issue: `wf-79y.14`.

Agent boundaries and responsibilities (summary)

- Patch (Implementation): implements changes and tests; asks before pushing and before destructive git operations.
- Probe (QA): runs tests and assesses risk; provides structured feedback in bd.
- Ship (DevOps): keeps CI healthy and monitors release readiness.
- Forge: maintains `.opencode/agent/*.md` and least-privilege permissions.
- Map: coordinates bd state and assigns ownership; does not merge by default.
- Scribbler / Muse / Pixel: doc/design/asset work; avoid publishing risky changes without Producer coordination.

Handoffs and delegation

- Use the canonical handoff template at `docs/.github/handoff_note_template.md` (mirrored in `history/handoff_note_template.md`).
- For hard handoffs and any transfer of responsibility, copy the template into a bd comment and fill it out.

Handoff checklist (must include for hard handoffs)

1) bd id and branch name (topic branch)
2) From and To (agent/person)
3) Summary and acceptance criteria
4) Commands run and results
5) Files changed (paths)
6) Risks and follow-ups
7) Any planning stored in `history/`

Delegation and merge ownership

- Map or the Producer should designate the merge owner early.
- Record delegations in bd using: `delegated-to:@<actor> (scope)`.
- Do not assume merge authority unless it is explicitly delegated.

Related process artifacts

- Handoff template: `docs/.github/handoff_note_template.md`
- PR template: `.github/PULL_REQUEST_TEMPLATE.md`
- Branch protection guidance: `docs/.github/branch_protection.md`
- Permissions matrix: `docs/.github/permissions_matrix.md`

Notes

This guidance intentionally trades some flexibility for predictability. When in doubt about destructive actions, shared branch rewrites, or ownership, escalate via bd and the Producer.
