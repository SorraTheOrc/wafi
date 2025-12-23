Permissions & enforcement matrix (draft)

Purpose

Provide a concise mapping of agent/human roles to allowed Git operations to reduce friction and ambiguity.

Roles and allowed operations (summary)

- Producer (human): push, merge, tag, create branches, force-push with Producer approval. Owner of final release decisions.
- Ship (agent/human): recommend release readiness, may be delegated merge/tag authority for releases (explicit delegated-to:@ship required). Should not force-push without Producer approval.
- Patch (agent/human): create branches, commit, request push/merge; ask before pushing shared branches or publishing.
- Probe (agent): read-only; run tests and post findings in bd. Does not commit/push.
- Forge (agent): modify .opencode/agent files; do not change runtime code/CI without Producer approval.
- Map (agent): coordinate bd state and may create/update issues; not a default merge owner.
- Scribbler / Muse / Pixel (agents): doc/design/asset tasks; avoid pushing release branches without Producer approval.

Delegation pattern

- Use bd comment for delegation: delegated-to:@<actor> (scope). Example: delegated-to:@ship for release validation.
- When delegation includes merge authority, make it explicit in bd and name the merge owner.

Enforcement notes for admins

- Use branch protection to restrict who can push and require PRs for merging.
- Add CODEOWNERS for directories where automatic reviewer suggestions help (optional).
- Document exact enforcement steps in docs/.github/branch_protection.md
