# Tooling Integrations

WAIF is designed to be repo-first and to reuse best-in-class external tools rather than re-implementing them. This document describes the external tooling that WAIF integrates with during development and how to install, verify, and upgrade those tools.

The integrations described here are optional in the sense that WAIF can still run without them in limited modes, but the intended workflow assumes these CLIs are installed and available on your `PATH`.

## Beads

Beads (`bd`) is a git-friendly, dependency-aware issue tracker that stores issue state in-repo (typically under `.beads/`).

WAIF uses Beads as the canonical issue system of record.

- Repo (fork used by this project): https://github.com/SorraTheOrc/beads
- How WAIF uses it:
  - Shells out to `bd` for issue reads/updates (e.g., `bd show <id> --json`).
  - Prefers `bd update <id> --body-file -` to update issue bodies.
  - In limited cases, when `bd` is unavailable, WAIF falls back to a deterministic edit of `.beads/issues.jsonl`.

## Beads-Viewer

Beads-Viewer (`bv`) is a terminal viewer/analysis tool for Beads projects. It can render issue lists/details and compute graph insights (critical path, cycles, influence metrics) for quicker planning and triage.

- Repo (fork used by this project): https://github.com/SorraTheOrc/beads_viewer
- How WAIF uses it:
  - Uses `bv`’s graph analysis features (critical path, cycles, centrality/influence metrics) to help prioritize and manage work items in a dependency-aware way.
  - When using `bv` in automated/agent flows, prefer the non-interactive `--robot-*` flags rather than launching the interactive TUI.

## OpenCode

OpenCode (`opencode`) is the conversational coding interface WAIF is designed to work alongside. This repo includes OpenCode command assets that define and guide parts of the workflow.

- Repo (fork used by this project): https://github.com/SorraTheOrc/opencode
- How WAIF uses it:
  - Stores OpenCode command content under `.opencode/command/`.
  - Workflow documentation in `docs/` references running OpenCode slash commands (for example, `/prd`).

## Installation

The steps below assume you are starting from the WAIF repo root.

### Clone into sibling directories

Clone each fork adjacent to the WAIF repo so paths are predictable.

```bash
# From inside the waif repo root directory
git clone https://github.com/SorraTheOrc/beads ../beads
git clone https://github.com/SorraTheOrc/beads_viewer ../beads_viewer
git clone https://github.com/SorraTheOrc/opencode ../opencode
```

### Install Go-based CLIs (bd, bv)

Beads and Beads-Viewer are Go projects. You need a reasonably recent Go toolchain installed.

Install both tools from source by building from the sibling checkouts and copying the resulting binaries into a directory on your `PATH` (examples: `~/.local/bin` on many Linux distros, or `~/bin` if you prefer).

```bash
# Pick one bin directory that is on your PATH
mkdir -p ~/.local/bin

# Build + install bd from the sibling checkout
(cd ../beads && go build -o bd ./cmd/bd)
cp ../beads/bd ~/.local/bin/bd

# Build + install bv from the sibling checkout
(cd ../beads_viewer && go build -o bv ./cmd/bv)
cp ../beads_viewer/bv ~/.local/bin/bv
```

### Install OpenCode (opencode)

This repo expects OpenCode to be installed from source (not via an installer script or published global package).

Prerequisites:

- `git`
- `bun` (OpenCode uses bun for installs/builds)

```bash
# From inside the waif repo root directory
# Install dependencies at the repo root
(cd ../opencode && bun install)

# Build the opencode binary for your current platform
(cd ../opencode/packages/opencode && bun run build -- --single)

# Copy the built binary onto your PATH.
# The dist folder contains the platform/arch in its name.
mkdir -p ~/.local/bin
cp "$(ls ../opencode/packages/opencode/dist/*/bin/opencode | head -n 1)" ~/.local/bin/opencode
chmod +x ~/.local/bin/opencode
```

If you have multiple binaries in `dist/` (for example because you built for multiple targets), pick the correct one for your platform and copy it into place.

### Verify

```bash
bd --version
bv --version
opencode --version
```

## Upgrading

For each tool, pull the latest changes and reinstall the binary.

### Beads

```bash
(cd ../beads && git pull --rebase)
(cd ../beads && go build -o bd ./cmd/bd)
cp ../beads/bd ~/.local/bin/bd

# If you use Beads daemons, restart them after upgrading
bd daemons killall
```

### Beads-Viewer

```bash
(cd ../beads_viewer && git pull --rebase)
(cd ../beads_viewer && go build -o bv ./cmd/bv)
cp ../beads_viewer/bv ~/.local/bin/bv
```

### OpenCode

Pull latest and rebuild the local binary.

```bash
(cd ../opencode && git pull --rebase)
(cd ../opencode && bun install)
(cd ../opencode/packages/opencode && bun run build -- --single)

cp "$(ls ../opencode/packages/opencode/dist/*/bin/opencode | head -n 1)" ~/.local/bin/opencode
chmod +x ~/.local/bin/opencode
```
