# pm CLI scaffold

A minimal Python Typer CLI that exposes a `pm` command with a `prd` subcommand. `pm prd --out <path>` writes a stub PRD markdown file and supports `--json` and `--verbose` flags. This scaffold is the M0 baseline for downstream tasks (`ba2.2.2`, `ba2.3.1`).

## Requirements
- Python 3.10+
- pip

## Install
From the repo root:

```bash
python -m pip install -e .
```

This installs the `pm` entrypoint defined in `pyproject.toml` and pulls in `typer`.

## Usage
- Help: `pm --help`
- PRD stub (human output):
  ```bash
  pm prd --out /tmp/stub.md
  ```
- PRD stub (JSON output):
  ```bash
  pm prd --out /tmp/stub.md --json
  ```
- Verbose logging: add `--verbose` (writes debug to stderr).

## Testing
Install dev deps (already covered by `pip install -e .` if available), then run:

```bash
pytest
```

The tests cover root help, subcommand help, missing `--out` usage error, stub write, and JSON output.
