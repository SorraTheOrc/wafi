Overview

This document defines recommended Git, branch, and worktree practices for WAIF's multi-agent, multi-team workflow. Its goals are to minimize merge friction, keep main releasable, and make coordination explicit and auditable.

Scope and assumptions

- One beads (bd) work item → one team branch. A "team" is the set of agents and humans assigned to the bd issue.
- Agents generally use per-role git worktrees (worktree_patch, worktree_probe, worktree_ship, worktree_scribbler, worktree_pixel, worktree_forge, worktree_muse, worktree_map). Each worktree should target the team branch for the active bd issue.
- main is the canonical integration branch and must remain releasable. Short-lived team branches + CI gating are required.
- bd is the authoritative source of task state and the place to record handoffs, decisions, and commands executed.

Principles (short)

- Team branch is the unit of work: keep agent changes for a bd item on a single team branch.
- Use git worktree for parallel agent editing, not long-lived separate branches per agent.
- Keep changes small and well-scoped; commit often with clear messages that include bd-<id> when possible.
- Prefer rebasing local, unpublished work for a clean history; avoid rebasing published branches without coordination.
- Never force-push shared branches without explicit Producer authorization.
- Run local quality gates (npm test, npm run lint, npm run build) before requesting reviews or pushing.

Branch lifecycle and naming

- Create a short-lived team branch for each bd issue. Example safe flow:
  1) git fetch origin && git checkout main && git pull --rebase
  2) git checkout -b bd-<id>/<short-desc>
  3) git push -u origin bd-<id>/<short-desc>  # (optional) publish early if others will collaborate remotely
- Suggested name patterns (pick one consistently): bd-<id>/<short-desc> or bd-<id>/team/<short-desc>.
- Merge back to main via PR after Probe/Ship sign-off and passing CI checks. Delete branch after merge to avoid clutter.

Worktrees and per-agent workflows

- Provide a separate working directory per agent using git worktree. Recommended command patterns:
  - If branch already exists on local repo: git worktree add ../worktree_patch bd-123/fix-a-thing
  - To create branch from main and add worktree in one step:
    git fetch origin && git checkout main && git pull --rebase
    git worktree add -b bd-123/fix-a-thing ../worktree_patch origin/main
- Each worktree should:
  - Start sessions by synchronizing with the latest main. If the branch is only used locally, prefer rebasing onto origin/main; if the branch is shared remotely, prefer merging origin/main into the branch to avoid rewriting public history. Always ensure the worktree is clean before making edits.
  - Commit focused, test-backed changes and keep diffs small. Run targeted tests locally (unit tests, linters) before publishing changes.
  - Use git status and git diff frequently and avoid leaving uncommitted work when switching tasks or changing branches.

Rebasing vs merging (clear rules)

- Local-only work: rebase frequently onto origin/main to stay current and keep history linear.
- Shared, published branches: do not rewrite history after others have fetched. Prefer merge-based updates (merge origin/main into branch) to avoid forcing teammates to rebase.
- Long-running or risky changes: prefer incremental PRs and feature flags. If a public rebase is unavoidable, coordinate via bd and get explicit Producer approval.

Push and publish policy

- Default: humans own pushes and merges. Agents must ask before running git push unless explicitly permitted in their agent permissions (see .opencode/agent/*.md).
- Before pushing:
  - Run local checks (tests, lint, build) and ensure commit messages reference bd-<id> where practical.
  - Fetch and rebase/merge origin/main to reduce surprises: git fetch origin && git rebase origin/main (or merge, per the branch strategy).
- Push command: git push origin bd-<id>/<short-desc>
- Branch protection should be configured for main (and any other protected branches): require PRs to merge, block force pushes, require passing CI checks, and require at least one reviewer. See docs/.github/branch_protection.md for recommended settings.

Conflict resolution

- Prevent conflicts with small commits, communication via bd, and frequent sync with origin/main.
- If a conflict happens:
  - Resolve it locally in one worktree, run tests, and push the resolved branch.
  - Record conflict details and resolution steps in bd (files changed, commands run, and rationale).
  - If the conflict affects multiple agents or needs policy decisions, open a short-lived bd coordination task and tag Map/Producer.

Pull requests, reviews, and CI

- Open a PR from the team branch into main. The PR is the integration and review point for Probe and Ship.
- Required checks before merge (examples to configure in branch protection): unit tests, lint, build. Probe should confirm test coverage (where applicable); Ship should validate release concerns when needed.
- PR description should include (use .github/PULL_REQUEST_TEMPLATE.md to enforce): bd id(s), summary of scope, commands run locally, tests executed, files changed, risks, rollback plan, and links to history/ planning if applicable.
- PR title should include the bd id (e.g., "bd-123: short description") to enable automation and traceability.
- Decide and document a merge strategy (squash, rebase-and-merge, or merge commit). Common recommendation: squash and merge to keep main concise unless preserving per-commit history is important for the change.

Commit messages and conventions

- Prefer Conventional Commits for automation. At minimum, include bd-<id>: short imperative description in the commit or PR title.
- Keep commits small and focused. If adopting Conventional Commits, add commitlint checks in CI and document how to run them locally.

Large assets and generated files

- Avoid committing large binaries to the repository without approval. Use Git LFS for approved large assets and follow the asset approval flow documented in docs/dev/git_lfs_policy.md.
- Pixel proposes asset names/locations; do not push large assets without Producer sign-off.

Agent boundaries and responsibilities (summary)

- Patch (Implementation): implements changes and tests; ask before pushing or doing large refactors.
- Probe (QA): runs tests and assesses risk; does not commit changes; provides structured feedback in bd.
- Ship (DevOps): responsible for CI and release readiness; validates release-related tasks and may be assigned merge ownership for releases.
- Forge (Agent definitions): edits .opencode agent files; do not change runtime code/CI without Producer approval.
- Map (PM): coordinates bd state, assigns merge owners, and avoids destructive git commands.
- Scribbler / Muse / Pixel: doc/design/asset work from their worktrees; avoid pushing release branches without Producer approval.

Agent interactions, handoffs, and delegation

- Use the canonical handoff template at docs/.github/handoff_note_template.md (also mirrored in history/handoff_note_template.md). For hard handoffs and any transfer of responsibility, copy the template into a bd comment and fill it out.

Handoff checklist (must include in a hard handoff)

1) bd id and branch name
2) From and To (agent/person)
3) Brief summary and acceptance criteria
4) Commands run and results
5) Files changed (paths)
6) Risks and TODOs
7) Location of ephemeral planning (history/ files) if any
8) Reviewer checklist

Handoff types and patterns

- Soft handoff: informal bd comment for low-risk checks.
- Hard handoff: explicit bd note using the template; receiver should mark accepted or create a follow-up bd task.
- Claim → Work → Handoff: an agent marks in_progress when they start; when done they post a handoff note.
- Discover → Create → Link: if follow-up work is discovered, create a new bd issue and link with --deps discovered-from:<parent-id>.

Delegation and merge ownership

- Map or the Producer should designate the merge owner (a human or Ship) when the work begins. Annotate delegations in bd using delegated-to:@<actor> so it is clear who may act on merges or release steps.
- Agents may take temporary ownership of subtasks (bd update in_progress) but must record handoffs and not assume merge authority unless explicitly delegated.

Escalation and destructive operations

- If a handoff exposes a blocking ambiguity or a required force-push, open a bd coordination task and tag Map/Producer for a decision. Do not perform destructive git operations on shared branches without explicit approval.

Auditability and history

- Record commands, files changed, test results, and reasoning in bd so a traceable audit trail exists. Use history/ for ephemeral planning and link to those files from the bd handoff note.

Session checklists (short)

Start of session
- bd ready / waif next to confirm assignment.
- git fetch origin && git checkout main && git pull --rebase
- git checkout -b bd-<id>/<short-desc>
- git worktree add ../worktree_<agent> bd-<id>/<short-desc>  # or use -b with origin/main to create-and-add
- Ensure worktree has clean status before editing.

End of session / before PR
- Run npm test && npm run lint && npm run build (or targeted suites).
- Rebase/merge from origin/main and resolve conflicts locally.
- Post a bd handoff note (use template) describing commands run, files changed, and remaining risks.
- Push or ask the merge owner to push and open a PR.

Cleanup after merge
- git push origin --delete bd-<id>/<short-desc>
- git worktree remove ../worktree_<agent> && git branch -D bd-<id>/<short-desc>
- Add a final bd update noting files changed and command history.

Related process artifacts (where to find templates and policies)

- Handoff template: docs/.github/handoff_note_template.md and history/handoff_note_template.md
- PR template: .github/PULL_REQUEST_TEMPLATE.md (recommended)
- Branch protection guidance: docs/.github/branch_protection.md (recommended)
- Large asset policy: docs/dev/git_lfs_policy.md (recommended)
- Dependency guidance: docs/dev/dependency_guidance.md (recommended)

Notes

This guidance balances linear history and practical collaboration constraints. When in doubt about destructive actions or ownership, escalate via bd and the Producer.
