# pm CLI scaffold

A minimal Node.js TypeScript CLI that exposes a `pm` command with a `prd` subcommand. `pm prd --out <path>` writes a stub PRD markdown file and supports `--json` and `--verbose` flags. This scaffold is the M0 baseline for downstream tasks (`ba2.2.2`, `ba2.3.1`).

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

This installs dependencies, builds the `pm` entrypoint to `dist/index.js`, and symlinks it to your global npm bin. For local dev without build, you can run `npm run start` (tsx).

### Global Install (npm link)

After `npm run build`, run `npm link` to make the `pm` command available globally. This symlinks `dist/index.js` into your npm global bin directory.

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

If `pm --help` shows Python errors or wrong output, you have a conflicting `pm` command. Check with `which pm`. If it shows `~/.local/bin/pm` (Python package manager), either:
1. Rename this CLI in package.json to `pm-cli` or similar
2. Remove the conflicting pm: `pip uninstall pm` or `rm ~/.local/bin/pm`
3. Clear shell cache: `hash -r` then retry

## Usage

- Help: `node dist/index.js --help` (or after linking via `npm link`, just `pm --help`)
- PRD stub (human output):
  ```bash
  node dist/index.js prd --out /tmp/stub.md
  ```
- PRD stub (JSON output):
  ```bash
  node dist/index.js prd --out /tmp/stub.md --json
  ```
- Verbose logging: add `--verbose` (writes debug to stderr).

To expose `pm` on your PATH locally, run `npm link` after `npm run build`. That symlinks the built binary (`dist/index.js`) into your global npm bin (honoring the prefix above), so `pm ...` works from any directory. Use `npm unlink pm` to remove it later.

## Testing

Build then run tests:

```bash
npm run build
npm test
```

The tests cover root help, subcommand help, missing `--out` usage error, stub write, and JSON output.
