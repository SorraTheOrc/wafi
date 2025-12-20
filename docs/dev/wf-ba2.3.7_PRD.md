<!-- Seed Context: wf-ba2.3.7
Title: Design: integrate waif CLI with OpenCode PRD agent
Description: Allow the Node/TypeScript `waif` CLI to initiate and run an interactive PRD authoring session driven by the OpenCode `/prd` command. M0: spawn `opencode run --command /prd --format json --session <session-id>` and mediate the interactive event loop.
Notes: Implementation tasks: Session Manager, CLI adapter (stdin piping), Event Parser, Interaction Adapter, File Manager, Beads Linker, Audit Logger, tests.
-->

# Product Requirements Document

## Introduction

* One-liner
  * Provide a waif CLI workflow that drives OpenCode `/prd` to produce auditable PRDs seeded from beads issues.

* Problem statement
  * There is no integrated, local CLI flow that drives the OpenCode `/prd` PRD agent while mediating an auditable, idempotent write of the resulting PRD into the repository and linking it to the originating beads issue.

* Goals
  * `waif prd --issue wf-ba2.3.7 --out docs/dev/wf-ba2.3.7_PRD.md` completes and writes the PRD file to disk.
  * The system interviews the user (via waif) to gather missing details during the session, and the agent may propose file edits that the user accepts or rejects.
  * After success, beads receives a single `Linked PRD: docs/dev/wf-ba2.3.7_PRD.md` comment and a `PRD: docs/dev/wf-ba2.3.7_PRD.md` external-ref (idempotent).

* Non-goals
  * Implementing a full OpenCode SDK integration (M2) or automatic branch/PR creation by default.

## Users

* Primary users
  * Product designers and PMs who author PRDs via an interactive CLI-driven interview.

* Secondary users
  * Engineers and automation systems that need reproducible PRD files and two-way traceability with beads issues.

* Key user journeys
  * Start an interview seeded from a beads issue, answer agent questions, accept proposed file changes, and close the session with a written PRD and beads link.

## Requirements

* Functional requirements (MVP)
  1. Invocation: `waif prd --issue wf-ba2.3.7 --out docs/dev/wf-ba2.3.7_PRD.md [--backend cli|serve|sdk] [--session <id>]` must start an interactive session.
  2. Backend (M0): when `--backend cli` (default), waif must spawn: `opencode run --command /prd --format json --session <session-id>` and stream JSON events.
  3. Event mediation: waif must display `question` events, accept user answers, forward answers to `/prd` (stdin piping for M0), show `file-proposal` previews, accept/reject them, and handle `file-write` events by performing atomic writes.
  4. File writes: write to a temp file in session dir, run `remark` formatting, fsync, and rename over target; if content is identical, avoid mtime change.
  5. Session resume: `--session <id>` resumes `.waif/sessions/<id>/`.
  6. Beads linking: after success run idempotent linking (see Idempotent Beads Linking) and record actions in audit.
  7. Audit: write `.waif/audit/<session-id>.json` with redacted prompt excerpt and metadata.
  8. Exit codes: `0` success; `2` missing `opencode` when `--backend cli`; `3` interrupted & partial saved; `4` schema/parse error.

* Non-functional requirements
  * Tests: unit tests for Event Parser, Beads Linker (mocked bd), File Manager atomic writes; integration tests gated by presence of `opencode`.
  * Security: redact secrets from prompts before writing audits; reject proposals outside repo root.
  * Platform: Linux/macOS supported for M0.

* Integrations
  * OpenCode CLI (`opencode`) for `/prd` runs.
  * Beads CLI (`bd`) for issue seed and linking.
  * `remark` for Markdown formatting.

* Security & privacy
  * Audit logs are stored under `.waif/audit/` and are gitignored by default.
  * Prompts must be redacted (PEM blocks, tokens) before storage.

## Release & Operations

* Rollout plan
  1. Implement M0 `cli` backend and core components with unit tests.
  2. Add a mocked `opencode` harness for CI integration tests; gate live integration on `opencode` availability.
  3. Incrementally add `serve` and `sdk` backends.

* Quality gates / definition of done
  * Unit tests pass locally (`npm test`).
  * Integration tests (mocked) exercise the event loop and validate file writes and beads linking.
  * `waif prd --issue wf-ba2.3.7 --out <path>` completes end-to-end in a dev environment when `opencode` is present.

* Risks & mitigations
  * Missing `opencode` or `bd`: the tool must surface clear fallback instructions and write audit entries indicating manual linking steps.
  * Schema drift in `/prd` events: detect missing required fields, write raw event to session dir, and exit with code `4`.
  * Disk full / permission errors: abort file writes, revert temp files, record error in audit, and surface clear error to user.
  * Malicious or accidental out-of-repo paths: reject proposals outside repo root and record in audit.

## Open Questions

* Should `--create-pr` be implemented as opt-in to auto-stage/commit the PRD when desired? (recommended: opt-in)
* Decide agent permission model: `--allow-agent-permissions` boolean vs role-based allowlist. (M0: boolean)

## Appendix: Acceptance Criteria (testable)

* Running: `waif prd --issue wf-ba2.3.7 --out docs/dev/wf-ba2.3.7_PRD.md` writes `docs/dev/wf-ba2.3.7_PRD.md` and produces `.waif/audit/<session-id>.json`.
* Beads: `bd show wf-ba2.3.7 --json` includes an external-ref `PRD: docs/dev/wf-ba2.3.7_PRD.md` and a comment `Linked PRD: docs/dev/wf-ba2.3.7_PRD.md` (idempotent on repeated runs).
* File formatting: `npx remark` was run successfully on the file.

## Approved Example Exchange

The following is the exact approved example exchange that must be preserved in the PRD. This is the canonical sample run that demonstrates how the CLI should mediate the OpenCode `/prd` session, including question/answer flow, file-proposal preview and acceptance, atomic file write, and session completion.

- Invocation:
  - User: `waif prd --issue wf-ba2.3.7 --out docs/dev/wf-ba2.3.7_PRD.md`
  - waif spawns: `opencode run --command /prd --format json --session <session-id>`

- Question (opencode → waif → user → opencode stdin):
  - opencode event: `{ "type": "question", "id": "q1", "text": "What is the one-line purpose of this feature?" }`
  - waif displays and collects answer and writes to opencode stdin: `{ "type": "answer", "questionId": "q1", "text": "Make it easy for PMs to run an interactive PRD authoring session locally." }`

- Follow-up question (clarification):
  - opencode event: `{ "type": "question", "id": "q2", "text": "Who is the primary user persona for this PRD?" }`
  - waif prompts the user; user replies: `{ "type": "answer", "questionId": "q2", "text": "Product Managers who need auditable, local PRDs." }`

- Scope question (edge cases):
  - opencode event: `{ "type": "question", "id": "q3", "text": "Should the tool attempt to create a PR, or only write the PRD file?" }`
  - user replies: `{ "type": "answer", "questionId": "q3", "text": "Only write the PRD file by default; PR creation is opt-in." }`

- File-proposal (preview):
  - opencode event: `{ "type":"file-proposal","id":"f1","path":"docs/dev/wf-ba2.3.7_PRD.md","preview":"### Purpose\nMake it easy for PMs to run...\n### Users\n..." }`
  - waif prompts accept? [y/N] → user inspects preview and answers `y` — waif sends `{ "type":"file-accept","fileId":"f1","accepted":true }` to opencode stdin

- Additional question (content detail):
  - opencode event: `{ "type": "question", "id": "q4", "text": "Provide 2-3 acceptance criteria for the PRD output." }`
  - user replies: `{ "type": "answer", "questionId": "q4", "text": "1) File written, 2) Audit present, 3) Beads link added." }`

- File-proposal (second patch preview):
  - opencode event: `{ "type":"file-proposal","id":"f2","path":"docs/dev/wf-ba2.3.7_PRD.md","preview":"### Acceptance Criteria\n1. File written...\n2. Audit..." }`
  - user inspects and rejects a small wording change: user selects `n` and sends `{ "type":"file-accept","fileId":"f2","accepted":false }` and then provides an inline edit via waif UI: `{ "type":"file-edit","fileId":"f2","patch":"Replace 'Audit' with 'Audit log'" }`

- File-write (agent commits accepted changes):
  - opencode event: `{ "type":"file-write","id":"w1","path":"docs/dev/wf-ba2.3.7_PRD.md","content":"<full markdown including accepted edits>" }`
  - waif runs atomic write: tmp -> remark -> fsync -> rename; records `{ "type":"file-written","fileId":"w1","status":"ok" }` in session log

- Multi-file write (agent writes ancillary artifacts):
  - opencode event: `{ "type":"file-write","id":"w2","path":".waif/audit/<session-id>.json","content":"{...redacted audit...}" }`
  - waif writes audit atomically and replies `{ "type":"file-written","fileId":"w2","status":"ok" }`

- Session complete:
  - opencode event: `{ "type":"session-complete","summary":{"files":["docs/dev/wf-ba2.3.7_PRD.md",".waif/audit/<session-id>.json"]} }`
  - waif runs final remark, computes affected-files, idempotently links beads, writes `.waif/audit/<session-id>.json` (if not already present), replies with final summary JSON, and exits `0`.

## Source issue: wf-ba2.3.7
