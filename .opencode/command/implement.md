---
description: Implement a beads issue by id
agent: build
# model: GPT-5.1-Codex-max
---

You are implementing a Beads issue in this repository.

Argument handling:

- The user should run this as `/implement <bd-id>`.
- Use `$1` as the Beads ID.
- If `$1` is empty/undefined, ask for the missing id and stop.

Project rules (must follow):

- Use `bd` for ALL task tracking; do not create markdown TODOs.
- Keep changes minimal and scoped to the issue.
- Validate changes with the most relevant tests/commands available.
- Use a git branch + PR workflow (no direct-to-main changes).
- Ensure the working branch is pushed to `origin` before you finish.
- Do NOT close the Beads issue until the PR is merged.

Context files:

- Tracker workflow: @AGENTS.md
- Copilot rules: @.github/copilot-instructions.md

Live context (do not guess; use this output):

- Current issue JSON: !`bd show $1 --json`
- Git status: !`git status --porcelain=v1 -b`
- Current branch: !`git rev-parse --abbrev-ref HEAD`
- Origin remote: !`git remote get-url origin 2>/dev/null || echo "(no origin remote)"`
- Default origin branch (best effort): !`git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null || true`

Process:

0. Safety gate: handle dirty working tree

   - Before making any changes, check whether the working tree is clean (`git status --porcelain=v1 -b`).
   - If there are _any_ uncommitted changes (modified, staged, or untracked files), **stop and ask the user what to do**. Do not assume changes are irrelevant.
   - Offer clear options and wait for an explicit choice:
     - A) Carry changes into this issue branch (continue as-is).
     - B) Commit current changes first (either on current branch or a separate "prep" branch).
     - C) Stash changes (and confirm whether to pop later).
     - D) Revert/discard changes (only with explicit confirmation).
     - E) Abort implementation so the user can inspect.

1. Understand the issue

   - Restate the acceptance criteria and constraints from the issue JSON.
   - Identify dependencies/blockers; if blocked, explain what is missing and ask the user how to proceed.

2. Create a working branch

   - If you are already on a topic branch for this issue, keep it.
   - Otherwise create a new branch named like `feature/$1-<short-suffix>` or `bug/$1-<short-suffix>`.
   - Do not commit directly on `main`.

3. Claim the issue

   - Run `bd update $1 --status in_progress --assignee "$USER" --json`.
   - If `--assignee` is not accepted in this environment, rerun without it.

4. Implement

   - Identify the smallest set of files to change.
   - Make the code changes.
   - If you discover additional required work, create new linked issues using `bd create ... --deps discovered-from:$1 --json`.
   - Author appropriate tests that validate the intended behaviour
   - Document the changes in the project documentation

5. Validate

   - Run the most specific checks available for the changed area (tests/lint/build).

6. Push and open a PR

   - Commit your code changes on the branch (include the Beads id in the commit message).
   - Push the branch to `origin` and set upstream.
     - If `origin` is missing, ask the user for the correct remote URL and add it with `git remote add origin <url>` before pushing.
   - Open a PR.
     - Prefer `gh pr create` if `gh` is installed and authenticated.
     - Otherwise, provide the exact branch name and ask the user to open a PR in the hosting UI.
   - Capture the PR URL.

7. Update Beads (do not close)

   - Update the issue to include the PR URL using `--external-ref` and/or `--notes`.
   - Keep the issue in `in_progress` until the PR is merged.
   - Run `bd sync` before ending the session.
     - If there are no Beads changes to commit (or you are on an ephemeral branch without upstream), use `bd sync --flush-only`.

8. After merge (manual follow-up)

   - After the PR is merged, close the issue on `main`:
     - `bd close $1 --reason "Done" --json`
     - `bd sync`

Start now: confirm the issue scope from the injected JSON and ask the user for the first implementation instruction if the next concrete step is not obvious.
