---
description: Create an intake brief (Workflow step 1)
tags:
  - workflow
  - intake
agent: build
---

You are running **Workflow step 1: intake brief** (see `docs/Workflow.md`, step 1).

Goal:

- Capture just enough context to decide whether the work needs:
  - a NEW PRD, or
  - an UPDATE to an existing PRD.
- Create a Beads issue to track the intake brief.
- Record all gathered information in the issue description.

Hard requirements:

- Use an **interview style**.
- Ask concise, high-signal questions.
- Soft-maximum of **three questions per iteration**.
- Do not invent requirements or constraints; if unknown, ask.
- Search the repo for related PRDs/specs and surface likely duplicates.
- Search Beads for related issues.
- Produce a short list of clarifying questions.
- Create a Beads issue to track the brief.

Argument handling:

- The user may optionally provide a short topic/title as `$ARGUMENTS`.
  - If provided, treat it as a working title for the intake brief.
  - Do not attempt to parse flags/options.
- If `$ARGUMENTS` is empty, ask the user for a short working title.

Process (must follow):

1. Interview (human-provided content)

   In iterations (≤ 3 questions each), gather the following information (providing suggestions/examples where helpful):

   - Problem (one paragraph)
     - What is the problem / opportunity?
     - Why now?
   - Users (one paragraph)
     - Who are the primary users?
     - Who are the secondary stakeholders?
   - Success criteria (one paragraph)
     - What outcomes define success?
     - If possible, include a measurable target or a clear “done” test.
   - Constraints (one paragraph)
     - Timeline / deadlines
     - Risk tolerance
     - Compatibility expectations (what must not break)

   If the user indicates this is a change to something existing, also gather:

   - What exists today (current behavior)
   - What should change (desired behavior)
   - Where it likely lives (paths, commands, APIs)

2. Repo search (agent responsibility)

   Use the user’s answers to derive 2–6 keywords. Then search for related artifacts.

   - Search for likely PRDs/specs:
     - Prefer scanning `docs/` and filenames containing `PRD`.
     - Use ripgrep where available (where not available use an alternative, but ask the user to install ripgrep).
     - Examples:
       - `rg -n "Product Requirements Document|\bPRD\b" docs/`
       - `rg -n "<keyword1>|<keyword2>" docs/ src/ README.md`
   - Search for related Beads issues covering this topic (duplicates / precursors):
     - Examples:
       - `bd list --status open --json | rg -i "<keyword>"`
       - `bd ready --json | rg -i "<keyword>"`
     - If `rg` is unavailable, use a best-effort alternative and ask the user to install ripgrep.
     - If you find candidates:
       - List them as "Related issues" (ids + titles).
       - If one clearly already represents this work, prefer updating that issue (or creating a child issue) instead of creating a duplicate.
   - If you find candidates:
     - List them as "Likely duplicates / related docs".
     - Ask the user to confirm whether to update one of them.

3. Beads search (agent responsibility)

   Search existing issues for overlaps.

   - Use Beads as the source of truth.
   - Suggested approaches (pick the simplest available in the environment):
     - `bd list --status open --json | rg -i "<keyword>"`
     - If `rg` is unavailable, ask the user whether you should do a broad manual scan (and suggest the user installs ripgrep).

   Output:

   - "Related issues" list (ids + titles) OR explicitly state "No obvious related issues found".

4. Clarifying questions (agent responsibility)

   Produce a short list (3–7) of clarifying questions that would unblock PRD creation/editing.
   Keep them actionable and specific.

5. Decide next step: NEW PRD vs UPDATE

   Decide, then confirm with the user:

   - If UPDATE: identify the file path to update (ask for confirmation if uncertain).
   - If NEW: propose a PRD file path under `docs/dev/`.
     - Convention: `docs/dev/<feature>_PRD.md`.

6. Create or update the Beads issue (must do)

    Create a new Beads issue, or update an existing issue, so that the description contains the full intake brief and links.

    - Type: `feature`
    - Priority: default to `2` unless the user indicates urgency/risk.
    - Title: `<working title>: Intake brief`

    Use `bd create ... --json`.

    Issue description template (must follow):

    - Problem
    - Users
    - Success criteria
    - Constraints
    - Existing state (if applicable)
    - Desired change (if applicable)
    - Likely duplicates / related docs (file paths)
    - Related issues (Beads ids)
    - Clarifying questions
    - Proposed next step:
      - `NEW PRD` at: `<path>` OR
      - `UPDATE PRD` at: `<path>`
      - Recommended next command: `/prd <path> <new-issue-id>`

    Cross-linking (must do):

    - If you are creating a new PRD as part of intake, ensure two-way traceability:
      - The PRD file must include `Source issue: <new-issue-id>`.
      - The newly-created beads issue must include a line `Linked PRD: <path/to/PRD.md>` in its description.

    - Preferred mechanism: after creating the issue and writing the PRD, call the beads CLI to update the issue description with the PRD link. Example sequence:

      1. `bd create "<title>" -t feature -p 2 --description "<full intake body>" --json` -> captures `id` in output
      2. Write PRD to `<path>` with `Source issue: <id>` inside
      3. `bd update <id> --body-file - < <path>` to append or include `Linked PRD: <path>` in the issue description

    - If `bd` is unavailable, provide a deterministic fallback and explicit manual instructions to the user (e.g., edit `.beads/issues.jsonl` to add the `Linked PRD` line), and do not silently fail to leave the issue unlinked.

    - The cross-link must be idempotent: re-running intake/prd with the same PRD path and issue id must not add duplicate `Linked PRD` lines.

    If there is a suitable parent issue then create the new issue as a sub-issue (use `--parent <id>`).

   - Problem
   - Users
   - Success criteria
   - Constraints
   - Existing state (if applicable)
   - Desired change (if applicable)
   - Likely duplicates / related docs (file paths)
   - Related issues (Beads ids)
   - Clarifying questions
   - Proposed next step:
     - `NEW PRD` at: `<path>` OR
     - `UPDATE PRD` at: `<path>`
     - Recommended next command: `/prd <path> <new-issue-id>`

   If there is a suitable parent issue then create the new issue as a sub-issue (use `--parent <id>`).

7. Finish

   After creating the issue, print:

   - The new Beads issue id
   - A 1–2 sentence summary
   - The exact next command the user should run
     - Example: `/prd docs/dev/<feature>_PRD.md <issue-id>`
