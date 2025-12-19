---
description: Create or edit a PRD through interview
agent: build
---

You are helping create or update a Product Requirements Document (PRD) for an arbitrary product, feature, or tool.

First decision (must do): decide whether to CREATE a new PRD or EDIT an existing one.

How to decide:

- If the user provides an explicit path to an existing PRD file, EDIT that file.
- If the user provides a directory path, propose a new PRD filename in that directory (CREATE), unless an obvious existing PRD is present and the user confirms editing.
- If the repo already contains a PRD that matches the described product (based on title/filename), propose editing it and ask for confirmation.
- If the user provides no path or additional information, ask ONE question: "Create a new PRD, or update an existing PRD? If update, what file path?"

Inputs:

- The user may optionally provide arguments as `$ARGUMENTS`.
  - `$ARGUMENTS` can include:
    - a PRD target path (existing file = edit; directory = create; or a suggested filename)
    - a beads issue id to use as seed context (e.g., `bd-123` or `beads-testing-73k`)
  - Arguments can be provided in any order.

Argument parsing (must do):

- Parse `$ARGUMENTS` into tokens.
- Classify tokens into:
  - `issueId`: first token matching `^bd-[A-Za-z0-9]+$` or `^beads-[A-Za-z0-9-]+$`
  - `targetPath`: first token that looks like a file/dir path (contains `/` or ends with `.md`) or resolves to an existing file/dir
- If multiple plausible `issueId` or `targetPath` tokens exist, ask for confirmation rather than guessing.

Hard requirements:

- Be environment-agnostic: do not assume tech stack, hosting, repo layout, release process, or tooling.
- Do not invent integrations or constraints; if unknown, ask.
- Respect ignore boundaries: do not include or quote content from files excluded by `.gitignore` or any ignore rules configured in OpenCode.
- Use the simplest interpretation that fits what the user says.

Beads issue seed context (when `issueId` is provided):

- Fetch the issue details using beads CLI: `bd show <issueId> --json`.
- Use at minimum: `title`, `description`, `acceptance` (if present), and `design` (if present).
- If `bd` is unavailable or the issue cannot be found:
  - Fail fast and ask the user to provide a valid issue id or paste the issue content.
- Prepend a short “Seed Context” block to the interview that includes the fetched details.
- Treat seed context as authoritative initial intent, but still ask clarifying questions.

Process (must follow):

1. Interview first: ask concise, high-signal questions (grouped to a soft-maximum of three questions in each iteration) until you have enough detail to draft or update a useful PRD.
   - If anything is ambiguous, ask clarifying questions.
   - Keep the interview efficient; prefer short multiple-choice options when helpful.
2. Draft or update the PRD in Markdown using the PRD outline below.
3. Confirm the exact file path(s) that will be written.
4. Write the PRD file(s) to disk.

Editing rules (when updating an existing PRD):

- Preserve the document structure and intent; only change what is necessary.
- If you are making significant structural changes, call them out and ask for confirmation.
- Update the Open Questions section based on what is newly resolved vs still unknown.
- Before signing-off run a markdown lint process using `remark` with autofix enbled

PRD traceability (must do):

- If an `issueId` was provided, include a short reference in the PRD such as: `Source issue: <issueId>`.
- After writing the PRD file, ensure the beads issue is updated to reference the PRD. The issue should include a plain-text link in a comment:

  - `bd comment db-id "Linked PRD: <path/to/PRD.md>"`

  This cross-linking must be idempotent (do not add comments when re-running).

- The PRD reference should also be included in the issue external references:

  - `bd update <issueId> --external-ref "PRD: <path/to/PRD.md>"`

- The PRD should clearly contain the `Source issue: <issueId>` reference and the beads issue should contain `Linked PRD: <path>` so traceability is two-way and machine- and human-friendly.

PRD outline (use headings exactly):

# Product Requirements Document

## Introduction

- One-liner
- Problem statement
- Goals
- Non-goals

## Users

- Primary users
- Secondary users (optional)
- Key user journeys

## Requirements

- Functional requirements (MVP)
- Non-functional requirements
- Integrations
- Security & privacy

## Release & Operations

- Rollout plan
- Quality gates / definition of done
- Risks & mitigations

## Open Questions

- List remaining unknowns as questions

When you are ready to write:

- Provide a short summary of assumptions.
- Then write the file(s) exactly once.
