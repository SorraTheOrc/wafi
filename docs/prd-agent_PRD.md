# Product Requirements Document

## Introduction

* One-liner

`prd-agent` lets program/release managers and automation agents generate and update structured, review-ready PRDs from prompts and repo context, with template enforcement and automated checks.

* Problem statement

Creating consistent, high-quality Product Requirements Documents (PRDs) is time-consuming and manual: templates are applied inconsistently, reviewers request repeated clarifications, and documents often fall out of sync with repository context and issue trackers.

* Goals

1. Automate PRD drafting from prompts and repository context (speed & consistency).
2. Integrate PRDs with issue tracking and repository workflows (linking, branches, PRs).
3. Make PRDs reviewable and collaborative by producing structured PRDs and using PR-based review workflows.

* Non-goals

* Full replacement of human product judgment or detailed design work.

* Replacing a full-featured document editor or complex collaboration platform; initial focus is on generation, linting, and repo sync.

## Users

* Primary users

* Program and release managers who coordinate PRD reviews and sign-offs.

* AI agents / automation workflows that generate or update PRDs programmatically.

* Secondary users (optional)

* Engineering leads and reviewers who evaluate PRDs.

* Product managers who author or review PRDs.

* Key user journeys

* Create new PRD from a short prompt (CLI) and optional repository context; `prd-agent` generates a template-complete Markdown PRD.

* Update an existing in-repo PRD by providing a prompt and context; `prd-agent` applies edits, runs linting, and proposes a branch + PR with the changes.

* Schedule or trigger PRD generation from an issue or epic to create or update PRDs automatically (automation workflows).

## Requirements

* Functional requirements (MVP)

1. CLI generator: create a PRD in Markdown from a prompt and optional repo/context snapshot.
2. Repository context gathering: allow using any repository context required, as long as reading/writing respects `.gitignore` (never read or write ignored paths).
3. Markdown template enforcement and linting using `remark` rules, with configurable lint rules.
4. Repo write flow: create a branch, commit the generated/updated PRD, and open a pull request.
5. Integrate with `bd` (beads) for issue linking and use the GitHub `gh` CLI (user-authenticated) for PR creation and issue references.
6. Dry-run / preview mode to preview changes without writing to the repository.
7. Config per-repo for templates and lint rules to accommodate different teams.

* Non-functional requirements

1. Access control: require repository write permissions and operate under the invoking user’s credentials; generated PRDs must not embed secrets.
2. Reliability: generation and linting should complete within reasonable time (e.g., < 30s for non-remote operations; allow longer when fetching remote context).
3. Auditability: log generated changes and reviewer interactions for traceability.
   1. Store `prompt_redacted_excerpt` (max 8000 chars) plus `prompt_hash`.
   2. Store metadata: timestamp, invoker, mode (create/update, dry-run/write), affected files, and issue links.
   3. Default redactions: API keys/tokens, password assignments, and private key/PEM blocks.
4. Configuration: CLI-first MVP; future UI or additional interfaces are out of scope for initial release.
5. Extensibility: support adding more linting rules and templates without major refactors; allow per-repo configs.

* Integrations

* `bd` (beads) for issue tracking (primary integration).

* Git (local repository operations, branch creation, commits) and GitHub via the `gh` CLI for PR creation and issue linking.

* Optional: CI systems for validation (post-MVP).

* Security & privacy

* Forbid embedding secrets (API keys, passwords) in generated PRDs.

* Default to branch + PR workflows; never write directly to protected branches.

* Use the invoking user’s configured credentials for integrations (e.g., `gh` auth); require explicit user consent for write actions.

* Maintain an audit log of actions (who generated/updated a PRD, when, affected files, and redacted prompt content/metadata).

* Support repository-level access controls; do not perform writes without confirming target path and commit strategy.

## Release & Operations

* Rollout plan

1. Alpha (internal): CLI-only release to a small set of program/release managers and automation users for feedback.
2. Pilot: enable repository sync and `bd` linking for a pilot project; collect metrics and refine lint rules.
3. General availability: add more integrations and broader rollout for teams.

* Quality gates / definition of done

* PRD generation produces a Markdown file matching the required PRD outline.

* Markdown lint (autofix) runs without critical errors; remaining issues are documented for manual review.

* Default workflow creates a branch + PR (no direct commits unless explicitly permitted).

* PRD includes `bd` issue references when provided and can open a GitHub PR via `gh`.

* Basic audit logs and access checks are in place and tested.

* Approval policy: MVP requires human review/sign-off before merge; no agent-based approvals.

* Acceptance criteria

1. Given a prompt and a target output path, when the user runs the CLI in create mode, then `prd-agent` writes a Markdown PRD that matches the required PRD outline.
2. Given an existing PRD path, when the user runs the CLI in update mode, then `prd-agent` updates only that PRD and preserves unrelated files.
3. Given a repository with `.gitignore` rules, when `prd-agent` gathers context or writes output, then it does not read from or write to ignored paths.
4. Given a generated/updated PRD, when `prd-agent` runs `remark`, then the command completes without errors and the resulting PRD remains valid Markdown.
5. Given write permissions and a clean working tree, when the user runs in write mode, then `prd-agent` creates a new branch, commits the PRD change, and opens a PR (or clearly reports why PR creation failed).
6. Given a `bd` issue id is provided, when generating/updating a PRD, then the resulting PRD includes a reference to that issue.
7. Given `gh` is installed and the user is authenticated, when `prd-agent` needs to open a PR, then it uses `gh` (not raw API calls) and surfaces actionable errors if auth is missing.
8. Given the user runs with `--dry-run`, when `prd-agent` executes, then it performs generation + linting and outputs a preview/diff without writing files or creating git branches/PRs.
9. Given audit logging is enabled, when `prd-agent` runs, then it records redacted prompt excerpts (max 8000 chars), a prompt hash, and metadata including timestamp, invoker, and affected files.
10. Given a PR is opened by `prd-agent`, when it is ready to merge, then a human reviewer can approve/sign off before merge (no agent-based approvals in MVP).

* Risks & mitigations

* Risk: Generated PRDs contain inaccurate or misleading content.
  * Mitigation: Clearly mark generated sections as AI-assisted; require human review and sign-off before publishing.

* Risk: Unauthorized writes to repositories.
  * Mitigation: Default to branch + PR workflow; require explicit permission to commit to protected branches.

* Risk: Linting rules are too strict or too lax for different teams.
  * Mitigation: Make linting rules configurable per-repo and provide a set of conservative defaults.

* Risk: Automation workflows may produce PRDs without human oversight.
  * Mitigation: Add configurable approval gates and require explicit automation policies for scheduled/triggered generation.

## Open Questions

* None.
