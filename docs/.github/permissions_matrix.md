Permissions & enforcement matrix

Purpose

Provide an unambiguous mapping of agent/human roles to allowed Git operations, and the escalation path for exceptions.

Default rule

- Humans own publishing actions (push/merge/tag).
- Agents can prepare changes locally and must ask (or be explicitly delegated) for publishing actions.
- Branch protection on `main` is the enforcement mechanism; agent permissions are the operational guardrails.

Roles and allowed operations (typical)

Legend:
- allow: normal operation
- ask: must ask Producer (or delegated merge owner) before running
- n/a: should not do this at all

| Role | Create branch | Commit | Push | Merge to main | Tag release | Force-push | Notes |
|---|---|---|---|---|---|---|---|
| Producer (human) | allow | allow | allow | allow | allow | ask (self-approve only if safe) | Final release decisions |
| Ship (DevOps) | allow | allow | ask | ask (unless delegated) | ask (unless delegated) | ask | Keep `main` releasable; validate CI/release readiness |
| Patch (Implementation) | allow | allow | ask | n/a | n/a | ask | Can author changes; ask before publishing actions |
| Probe (QA) | n/a | n/a | n/a | n/a | n/a | n/a | Runs tests and reports risk; no code changes |
| Forge (Agent defs) | allow | allow | ask | n/a | n/a | ask | Edits `.opencode/agent/*`; avoid runtime/CI changes without approval |
| Map (PM) | n/a | n/a | n/a | n/a | n/a | n/a | Coordinates in bd; avoids git state changes |
| Scribbler / Muse / Pixel | allow | allow | ask | n/a | n/a | ask | Docs/design/assets; ask before publishing changes |

Notes:
- The authoritative, machine-enforced permissions are in `.opencode/agent/*.md`.

Delegation pattern (bd)

When a human wants an agent to perform a normally-restricted action, record it in bd:

- `delegated-to:@ship (merge to main for bd-123)`
- `delegated-to:@patch (push branch topic/bd-123/patch)`

Minimum delegation fields:
- who (role/account), what (action), which branch/repo area, timebox (optional), and any required checks.

Admin enforcement checklist

- Use branch protection on `main`:
  - require PR review(s)
  - require status checks (tests, lint, build, and `pr/validate-title` once implemented)
  - block force pushes
  - restrict direct pushes
- Optionally add CODEOWNERS for sensitive areas (e.g., `.github/`, `.opencode/`, `scripts/`).

Related docs

- Branch protection guidance: `docs/.github/branch_protection.md`
- Workflow: `docs/dev/git_workflow.md`
