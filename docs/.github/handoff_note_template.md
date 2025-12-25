Handoff Note Template

This file is a visible copy of the canonical handoff template (also stored in history/). Use the template when performing handoffs between agents or humans. Copy it into the originating bd issue as a comment or note and update fields before posting.

---
Handoff: [brief one-line summary]
bd: bd-<id>
Branch: <origin/bd-123/short-desc>
From: @<sender> (agent or person)
To: @<receiver> (agent or person)
Type: [soft|hard]

Summary
- What changed: (1–2 bullets)
- Acceptance criteria: (clear pass/fail bullets)

Commands run (include full commands and short result)
- git status
- npm test (describe pass/fail)
- npm run lint
- other commands

Files changed (paths)
- path/to/file1
- path/to/file2

Risks / TODOs
- Risk 1 and mitigation
- Remaining work or follow-ups

Ephemeral planning
- history/<file> (if applicable)

Reviewer checklist (suggested)
- Run X targeted tests
- Manually verify Y
- Confirm Z (e.g., accessibility, build, packaging)

Delegated-to (optional)
- delegated-to:@<owner> (scope)

Notes
- Add any context or links to related bd issues or PRs here.
---
