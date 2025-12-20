# WAIF

WAIF is a repo-first workflow tool intended to help humans make sense of the jumble that “vibe coding” produces.

WAIF is not really an acronym:

- `W` / `F`: Workflow
- `A` / `I`: Alien Intelligence (NOT Artificial Intelligence)

The fact that it’s jumbled into `WAFI` is the point. It also nods affectionately at the nautical acronym, WAFI ("Wind Assisted Freaking Idiot"), a tongue-in-cheek term used by sailors for someone relying too much on wind power - here pointing at humans or agents relying too much on one another. To accomodate poor human brains we flipped the F and I to make it easier to remember. Confused? Yep, that's what happens when working with alien intelligences - hopefully WAIF can help.

## Approach

This is an experimental project — expect rapid change. This section is intended to stay current as the workflow, tooling, and conventions morph.

### AI-Assisted Development

WAIF is designed around “agent + human” collaboration: agents propose changes, run constrained tasks, and keep a high-signal paper trail in the repo; humans review, steer, and ship.

For the detailed workflow (including how we structure agent work, track progress, and validate changes), see [`docs/Workflow.md`](docs/Workflow.md).

### Agent Personas + Guided Commands

We provide multiple agent personas intended to drive different development phases (exploration, implementation, review, release, etc.). Alongside that, we provide workflow-oriented commands that act as guardrails — telling agents what to do next, how to format output, and how to integrate with the repo’s conventions.

### CLI-First Interaction

The project provides a CLI tool (`waif`) that humans, agents, and even old-school systems can use to interact with both agents and Beads (issue tracker). The CLI is a thin layer on top of the underlying tools used in this workflow. Its use is optional, but it provides a consistent interface and helpers for human+agent teams.

### Agent tmux workflow

- Launch the multi-pane workflow runner:

  ```bash
  ./scripts/start-workflow-tmux.sh --session waif-workflow --window agents
  ```

  This creates/reuses a tmux window with one pane per role (pm, design, build, docs, review, user). Each agent pane uses a dedicated git worktree and starts `waif startWork <role>` in that directory so prompts and titles reflect the role.

- `waif startWork <agent>` sets the tmux pane title (when inside tmux), prints a brief welcome, and starts an interactive shell with prompt `waif> `. Flags:
  - `--norc` to skip rc/profile loading (defaults to loading your shell rc).
  - `--env KEY=VAL` to inject env vars.
  - `--init "command"` to run setup commands before the shell starts.

When interacting with agents, the `waif` CLI tool is designed to integrate with **OpenCode** (an open source agent framework). The CLI automates invoking agents with pre-defined prompts and handling outputs according to the workflow conventions. However, use of the CLI is optional; humans can also interact with agents directly via chat or other interfaces.

#### Slash Commands

[OpenCode Slash Commands](https://opencode.ai/docs/commands/) are a way to define short commands that guide agents in their completion of specific tasks. WAIF defines several slash commands which can be run directly or via the CLI tool (using `wafi COMMAND [ARGS]`). These commands are defined in [`.opencode/command`](.opencode/command) and include:

- [`/prd`](.opencode/command/prd.md): Creates or edits a PRD through a short interview; optionally seeds from a Beads issue id and/or a target file path, then writes the PRD in a standard Markdown outline.
- [`/design`](.opencode/command/design.md): Runs an interview + drafting loop to create or improve design notes for a single Beads issue id via `bd update --design`.
- [`/implement`](.opencode/command/implement.md): Implements a Beads issue end-to-end from an id

## WAIF CLI Features

- `waif next`: prints three human sections (In Progress table, Recommended Summary table, Recommended Detail), copies the recommended issue id to your clipboard (best-effort), and supports `--json` output for automation.
- `waif --version` (alias: `-v`): prints the CLI version and exits.

### Symbols config

Some CLI and library output uses configurable ASCII-safe symbols.
Defaults are defined in `config/symbols.json`.

## Install

From the repo root:

```bash
npm install
npm run build
```

This installs dependencies and builds the `waif` entrypoint to `dist/index.js`. For local dev without build, you can run `npm run start` (tsx).

### Global Install (npm link)

After `npm run build`, run `npm link` to make the `waif` command available globally. This symlinks `dist/index.js` into your npm global bin directory.

**If you encounter permission errors**, configure a user-writable npm prefix:

```bash
npm link
```

Ensure the environment will load the global npm bin directory by adding it to your `PATH`. You can use `direnv` to manage this automatically. Example `.envrc`:

```bash
sudo apt install direnv  # if not already installed
direnv allow .
```

## Development

- Issue tracking: this repo uses **Beads** (`bd`) for all work tracking. See [steveyegge/beads](https://github.com/steveyegge/beads)
- Scheduling: this repo uses **beads-viewer** (`bv`) to schedule and prioritize work using dependency graph insights. See [Dicklesworthstone/beads_viewer](https://github.com/Dicklesworthstone/beads_viewer)
- Docs: user documentation lives in [`docs`](docs)
- Docs: developer-focused documentation lives in [`docs/dev`](docs/dev)
- Agent CLI: recommended tool is **OpenCode** for agent-driven workflows. See [opencode-ai/opencode](https://github.com/opencode-ai/opencode)

## Testing

Build then run tests:

```bash
npm run build
npm test
```

The tests cover root help, subcommand help, missing `--out` usage error, stub write, and JSON output.
