# Product Requirements Document: Beads Search command (`waif search`)

Source issue: wf-32r

## Introduction

- One-liner
  - Add a `waif` CLI command that searches Beads issues quickly and ergonomically, defaulting to title+description search with optional expansion to notes/comments and linked documents.

- Problem statement
  - As `.beads/issues.jsonl` grows, finding relevant issues via manual paging or `bd show` becomes slow.
  - Users want a `waif`-native search optimized for interactive use, while still supporting JSON output for scripting.

- Goals
  - Provide a `waif search` command that searches Beads issues.
  - Default scope: title + description.
  - Optional scope expansion: include notes/comments; include linked documents.
  - Fast enough for interactive use.
  - Provide stable JSON output with enough metadata to triage.

- Non-goals
  - Full-text indexing service, daemon, or external dependency.
  - “Search everything in the repo” by default (document search is opt-in).

## Users

- Primary users
  - Human producer/PM operating the `waif` CLI.

- Secondary users
  - Scripts/automation calling `waif search --json`.

## CLI / UX

- Command
  - `waif search <query>`

- Human output
  - Print a table of matches sorted by best-effort relevance:
    - Primary sort: exact/substring match in title (best)
    - Secondary: match in description/notes/comments/docs
    - Tiebreaker: most recently updated
  - Table columns (MVP): `id`, `status`, `priority`, `title`.
  - If there are 0 matches, print `No matches` and exit 0.

- JSON output
  - `waif search --json <query>` returns:
    - `query`: the query string
    - `scope`: resolved scope flags
    - `count`: number of matches
    - `results`: array of issue objects (compatible with Beads JSONL fields), optionally with `matched_fields` metadata.

## Requirements

### Functional requirements

1. Default search scope
   - Search `title` and `description` fields.

2. Optional notes/comments scope
   - `--notes` expands scope to include `notes` and issue `comments[].text`.

3. Optional linked document scope
   - `--docs` expands scope to include the *text content* of linked documents.
   - Linked documents are discovered via:
     - `external_ref` prefixes: `PRD:` (file path following the prefix)
     - `Linked PRD:` lines found in issue description/notes/comments
   - Only read documents that are:
     - inside the repo, and
     - not ignored by `.gitignore`.

4. Matching semantics
   - Case-insensitive substring matching by default.
   - `--case-sensitive` enables case-sensitive matching.
   - `--regex` enables regex matching (ECMAScript regex).
     - If `--regex` is used, invalid regex must produce a non-zero exit and a clear error.

5. Result limiting
   - `--limit <n>` limits number of results returned/printed (default: 50).

6. Data sources
   - Preferred: call `bd search --json` when `bd` is available.
   - Fallback: search `.beads/issues.jsonl` directly.
   - Behavior should be consistent across both paths.

### Non-functional requirements

- Performance
  - For a repo with ~5,000 issues, default scope search should complete in 200ms locally on a typical dev machine.
  - `--docs` searches may be slower; must still be interactive (target: 2s for typical PRD sets).

- Safety / ignore boundaries
  - Never read ignored files.
  - If a linked doc is ignored, treat as “omitted” (do not error; optionally count it in debug output).

- Determinism
  - Results ordering must be stable given identical inputs and a static database.

## Release & Operations

- Definition of done
  - Command works with both `bd` and JSONL fallback.
  - `--json` schema is documented and stable.
  - Tests cover scope flags and matching semantics.

## Test plan

- Unit tests
  - Matching behavior (case-insensitive default, `--case-sensitive`, `--regex`).
  - Scope expansion (`--notes`, `--docs`) with fixture issues.
  - `.gitignore` enforcement for doc reads.

- Integration/E2E tests
  - Run `waif search` against the repo’s fixture Beads data and verify output count/IDs.

## Open questions

1. Command naming
   - Should we use `waif search`, `waif find`, or `waif beads search`?
2. Ranking
   - Is “title matches first” sufficient, or do we want a simple score model?
3. Output enrichment
   - Should human output include assignee and updated timestamp by default?
