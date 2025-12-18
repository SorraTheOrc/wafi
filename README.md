# WAFI

WAFI is a repo-first workflow tool intended to help humans make sense of the jumble that “vibe coding” produces.

WAFI is not really an acronym:
- `W` / `F`: Workflow
- `A` / `I`: Alien Intelligence (NOT Artificial Intelligence)

The fact that it’s jumbled into `WAFI` is the point. It also nods affectionately at the nautical acronym, WAIF ("Wind Assisted Freaking Idiot"), a tongue-in-cheek term used by sailors for someone relying too much on wind power - here pointing at humans or agents relying too much on one another.

## CLI scaffold

A minimal Node.js TypeScript CLI that exposes a `wafi` command with a `prd` subcommand. `wafi prd --out <path>` writes a stub PRD markdown file and supports `--json` and `--verbose` flags. This scaffold is the M0 baseline for downstream tasks (`ba2.2.2`, `ba2.3.1`).

## Requirements

- Node.js 18+
- npm (or pnpm/yarn)

## Install

From the repo root:

```bash
npm install
npm run build
npm link
```

This installs dependencies, builds the `wafi` entrypoint to `dist/index.js`, and symlinks it to your global npm bin. For local dev without build, you can run `npm run start` (tsx).

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

**Troubleshooting: Name Conflicts**

If `wafi --help` shows unexpected output, you may have a conflicting `wafi` command on your PATH. Check with `which wafi`.

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

To expose `wafi` on your PATH locally, run `npm link` after `npm run build`. That symlinks the built binary (`dist/index.js`) into your global npm bin (honoring the prefix above), so `wafi ...` works from any directory. Use `npm unlink wafi` to remove it later.

## Testing

Build then run tests:

```bash
npm run build
npm test
```

The tests cover root help, subcommand help, missing `--out` usage error, stub write, and JSON output.
