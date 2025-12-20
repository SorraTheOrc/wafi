# Product Requirements Document

**Source issue:** wf-ba2.3.7

## Summary

Integrate `waif prd` with OpenCode `/prd` to provide a reproducible, local CLI flow that runs interactive or agent-driven PRD authoring, writes auditable Markdown PRDs to the repo, and records idempotent beads links.

## Scope

- Implement `waif prd` to drive OpenCode headless runs or attachable servers to generate PRDs.
- Produce atomic, formatted PRD Markdown files under a repository path (default `docs/dev/<name>_PRD.md`).
- Add idempotent beads linking (comment + external-ref) after successful PRD writes.

Out of scope: automatic PR creation (opt-in via `--create-pr`) and SDK-only integrations until M2.

## Goals (measurable)

1. `waif prd` writes `<path>` on session completion in interactive and agent modes.
2. Beads issue receives one `Linked PRD: <path>` comment and one `PRD: <path>` external-ref after successful writes (idempotent).
3. File writes are atomic and formatted with `remark` before finalization.
4. Clear, deterministic exit codes for common failures.

## Constraints

- Must use `bd`/beads for issue linking; no alternative trackers.
- Default backend is `cli`; `serve` and `sdk` are optional backends behind feature flags.
- Session and audit data live under `.waif/` and must be gitignored by default.
- Implementation must avoid network calls that send repo contents to third parties (prompts redacted).

## Assumptions

- Developers running tests have `node`, `npx`, and a POSIX-like shell.
- `opencode` CLI may not be installed in CI; integrations must be gated.
- `bd` CLI is available on dev machines used to run `waif prd` automation; code must handle `bd` absence as a fallback.
- Repo has a standard root (where `git rev-parse --show-toplevel` resolves) and tests can create temp repos.

## Decision Points (to be resolved during implementation)

1. Audit storage default: out-of-repo under `.waif/audit/` (recommended). Approve? (yes/no)
2. PR creation policy: opt-in `--create-pr` (recommended). Approve? (yes/no)
3. Agent permission granularity: boolean `--allow-agent-permissions` vs role-based allowlist. Choose one for M0.
4. Whether `waif prd` should auto-stage/commit PRD files when `--create-pr` is used (opt-in mechanics).

## Requirements

### Functional

1. `waif prd --out <path> [--issue <id>] [--interactive|--agent <name>] [--backend <cli|serve|sdk>]` must create `<path>` on success.
2. `--issue <id>` must seed context with `bd show <id> --json` fields `title`, `description`, `acceptance`.
3. `cli` backend must invoke: `opencode run --command prd <target> --format json --session <session-id> [--model <model>]`.
4. `--session <id>` resumes `.waif/sessions/<id>/`.
5. File writes use write-then-remark-then-fsync-then-rename atomic procedure. If content unchanged, no mtime change.
6. Beads linking uses idempotent algorithm (see below) and records actions in audit.
7. Exit codes: `0` success, `2` missing `opencode` (cli), `3` interrupted/saved partial, `4` parse/schema error.

### Non-functional

- Unit tests for parser, beads linker, and file manager.
- Integration tests gated by `opencode` presence.
- Redaction: remove PEM blocks/tokens before audit storage.
- Platform: Linux/macOS supported (Windows not required for M0).

## Architecture Overview

Pluggable backend abstraction with three backends (`cli`, `serve`, `sdk`), a Session Manager, Runner/Adapter, Event Parser, Interaction Adapter, File Manager, Beads Linker, and Audit Logger.

## Sequence / Flow (testable steps)

1. Validate CLI args; if `--out` missing and not `--emit-opencode-cmd`, fail.
2. If `--backend cli`: run `which opencode` or `opencode --version`; if missing exit `2` and print install steps.
3. If `--issue <id>`: run `bd show <id> --json` and create `seed.json` in session dir.
4. Create session dir `.waif/sessions/<id>` and write `seed.json`.
5. Start backend runner and iterate events; for each canonical event assert deterministic handler behavior:
   - `question`: terminal prompts yield string answers; agent handlers return Promise<string>.
   - `file-proposal`: interactive requires explicit accept; agent requires `--allow-agent-permissions` to auto-accept.
   - `file-write`: File Manager executes atomic write procedure and records path.
   - `checkpoint`: persist transcript and partial audit.
6. On `session-complete`: run `npx remark` on written files, compute `affected-files`, run beads linking, write final audit, print JSON summary, exit `0`.

Each step above must have unit/integration tests that assert expected side effects (files created, beads updated, audit written).

## CLI Specification (flags & exact behavior)

(List of flags same as prior - omitted here for brevity; implementation must match the previous PRD section.)

## Idempotent Beads Linking (algorithm & verifiable checks)

1. `p = path.relative(repoRoot, targetPath)`
2. `state = bd show I --json` (mockable in tests)
3. If `comments` contains `Linked PRD: <p>` skip; else `bd comment I "Linked PRD: <p>"` and assert new comment exists.
4. If `external_refs` contains `PRD: <p>` skip; else `bd update I --external-ref "PRD: <p>"` and assert external_ref present.
5. If `bd` absent, write `beads_link_needed` entry in audit and surface exact `bd` commands to the user.

Verifiable tests: run beads linker with a mocked `bd` that returns controlled `comments`/`external_refs` and assert idempotence on repeated runs.

## Audit logging schema (explicit)

(Keep previous exact schema.) Audit writes must be JSON-parsable and have deterministic fields for test assertions.

## File Manager atomic write procedure (verifiable)

(Keep previous explicit procedure.) Tests must validate:
- Temp file created under session dir.
- `npx remark` runs successfully and errors cause write abort.
- Final file content matches expected.
- Unchanged-content case does not change mtime.

## Edge Cases & Failure Modes

- opencode absent: handled with exit `2` and clear instructions.
- bd absent: PRD still written; audit contains `beads_link_needed` with exact manual commands.
- Partial/slow stdout from `opencode` (streaming delay): runner must implement a read-timeout (configurable) and emit a parsing error if idle exceeds threshold.
- JSON schema drift: Event Parser must detect missing required fields and switch to debug mode that writes raw JSON event to session dir and exits `4`.
- Disk full or permission denied: File Manager must catch write errors, log full error to audit, revert temp files, and exit non-zero.
- Concurrent runs writing same target path: Session Manager must detect in-progress lock file `.waif/sessions/locks/<path>.lock` and refuse or serialize writes.
- Large prompt sizes: Truncate prompt excerpts to 8k chars for audit; compute `prompt_hash` for full content verification if needed.
- Malicious agent: Agents require explicit `--allow-agent-permissions`; otherwise agent answers are sandboxed and file-write events require human acceptance.

## Test Cases & Verification (concrete)

Unit tests (examples):
- Event Parser: feed canonical `question` JSON => expect `{type: 'question', text: '...'}`; feed malformed event => expect exit code `4`.
- Beads Linker: mocked `bd show` returns no comment -> assert `bd comment` called once; run again -> `bd comment` not called.
- File Manager: writeAtomic writes file and leaves mtime unchanged when content identical.

Integration tests (examples):
- Mocked opencode: spawn a process that writes canned JSON events to stdout; run `waif prd --out /tmp/test.md --issue wf-ba2.3.7 --format json` -> assert /tmp/test.md exists, audit created, beads linker attempted (mocked).
- Real opencode (optional CI): gated by `which opencode`; run against `.opencode/command/prd.md` and assert final PRD content and beads linking.

Verification commands (example):
- `git rev-parse --show-toplevel` to locate repo root for tests.
- `bd show wf-ba2.3.7 --json` to validate external_ref after run.
- `jq .beads_links_added .waif/audit/<session-id>.json` to assert beads actions.

## Removed / Consolidated Items

- Removed long migration prose; kept explicit rollout steps in Migration & Rollout.
- Removed duplicated CLI flag explanations (refer to CLI spec section during implementation).

## Migration & Rollout (concise)

1. Implement M0 (`cli`), tests, audit logger, beads linker.
2. Merge feature branch, run mocked CI tests, then enable live integration job when `opencode` is present.
3. Implement `serve`/`sdk` backends incrementally.

## Security & Privacy

(Keep previous explicit rules; ensure redaction regexes are unit tested.)

## Open Questions (actionable)

(Keep previous decision points.)

---

(End of audited PRD)
