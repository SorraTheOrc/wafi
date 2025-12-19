#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  start-agent NAME

Bootstraps a per-agent workspace directory and initializes waif.

Steps:
  1) Sets BD_ACTOR to NAME
  2) Creates (or reuses) a git worktree at ./$BD_ACTOR
    - Creates/uses branch "${BD_ACTOR}_Worktree"
  3) Runs: waif init $BD_ACTOR

Notes:
  - Assumes you run this from within an existing git checkout.
EOF
}

if [[ ${1:-} == "-h" || ${1:-} == "--help" ]]; then
  usage
  exit 0
fi

if [[ -z "${1:-}" ]]; then
  echo "Missing NAME." >&2
  usage >&2
  exit 2
fi

export BD_ACTOR="$1"
export BEADS_NO_DAEMON=1

workspace_dir="./${BD_ACTOR}_Worktree"

if ! command -v git >/dev/null 2>&1; then
  echo "git is required but was not found in PATH." >&2
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Current directory is not a git repo: $(pwd)" >&2
  exit 1
fi

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

branch="${BD_ACTOR}_Worktree"

worktree_branch_path() {
  local target_branch="$1"
  git worktree list --porcelain \
    | awk -v b="refs/heads/${target_branch}" '
        $1=="worktree"{wt=$2}
        $1=="branch" && $2==b {print wt; found=1}
        END{if(!found) exit 1}
      '
}

ensure_worktree() {
  local target_dir="$1"
  local target_branch="$2"

  if [[ -d "$target_dir" ]]; then
    if ! git -C "$target_dir" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
      echo "Directory exists but is not a git repo/worktree: $target_dir" >&2
      exit 1
    fi
    return 0
  fi

  # Prevent creating a second worktree on a branch already checked out.
  if wt_path="$(worktree_branch_path "$target_branch" 2>/dev/null)"; then
    echo "Branch '${target_branch}' is already checked out in worktree: ${wt_path}" >&2
    echo "Re-run using a different NAME, or remove the existing worktree." >&2
    exit 1
  fi

  if git show-ref --verify --quiet "refs/heads/$target_branch"; then
    git worktree add "$target_dir" "$target_branch"
  else
    git worktree add -b "$target_branch" "$target_dir"
  fi
}

ensure_worktree "$workspace_dir" "$branch"
cd "$workspace_dir"

# Ensure the worktree is on the correct branch.
git switch "$branch" >/dev/null 2>&1 || git switch -c "$branch"

# Run waif init (prefer global waif; fall back to local node_modules bin).
if command -v waif >/dev/null 2>&1; then
  waif init "$BD_ACTOR"
elif [[ -x "./node_modules/.bin/waif" ]]; then
  ./node_modules/.bin/waif init "$BD_ACTOR"
else
  echo "waif was not found (global or ./node_modules/.bin/waif)." >&2
  echo "From the repo root, run: npm install && npm run build" >&2
  exit 1
fi
