# WAFI

WAFI is a repo-first workflow tool intended to help humans make sense of the jumble that “vibe coding” produces.

WAFI is not really an acronym:
- `W` / `F`: Workflow
- `A` / `I`: Alien Intelligence (NOT Artificial Intelligence)

The fact that it’s jumbled into `WAFI` is the point. It also nods affectionately at the nautical acronym, WAIF ("Wind Assisted Freaking Idiot"), a tongue-in-cheek term used by sailors for someone relying too much on wind power - here pointing at humans or agents relying too much on one another.

## Features

- no features implemented yet, it's just the CLI scaffold

## Install

From the repo root:

```bash
npm install
npm run build
```

This installs dependencies and builds the `wafi` entrypoint to `dist/index.js`. For local dev without build, you can run `npm run start` (tsx).

### Global Install (npm link)

After `npm run build`, run `npm link` to make the `wafi` command available globally. This symlinks `dist/index.js` into your npm global bin directory.

**If you encounter permission errors**, configure a user-writable npm prefix:

```bash
npm config set prefix "$HOME/.npm-global"
mkdir -p "$HOME/.npm-global/bin"
```

Then ensure `~/.npm-global/bin` is on your PATH. Add this line to your shell RC file (`~/.bashrc`, `~/.bash_profile`, or `~/.zshrc`):

```bash
export PATH="$HOME/.npm-global/bin:$PATH"
```

Then source it (for bash: `source ~/.bashrc`) and run `npm link` again.

## Usage

- Help: `node dist/index.js --help` (or after linking via `npm link`, just `wafi --help`)
- PRD stub (human output):
  ```bash
  wafi prd --out /tmp/stub.md
  ```
- PRD stub (JSON output):
  ```bash
  wafi prd --out /tmp/stub.md --json
  ```
- Verbose logging: add `--verbose` (writes debug to stderr).

## Development

- Issue tracking: this repo uses **Beads** (`bd`) for all work tracking. See [steveyegge/beads](https://github.com/steveyegge/beads)
- Scheduling: this repo uses **beads-viewer** (`bv`) to schedule and prioritize work using dependency graph insights. See [Dicklesworthstone/beads_viewer](https://github.com/Dicklesworthstone/beads_viewer)
- Docs: developer-focused documentation lives in [`docs/dev`](docs/dev)
- Agent CLI: recommended tool is **OpenCode** for agent-driven workflows. See [opencode-ai/opencode](https://github.com/opencode-ai/opencode)

## Testing

Build then run tests:

```bash
npm run build
npm test
```

The tests cover root help, subcommand help, missing `--out` usage error, stub write, and JSON output.
