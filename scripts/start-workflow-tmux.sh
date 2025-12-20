#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/start-workflow-tmux.sh [--session <name>] [--window <name>]

Starts (or reuses) a tmux session and creates one pane per workflow agent
(described in docs/Workflow.md) plus a user pane.

Options:
  --session <name>  tmux session name (default: waif-workflow)
  --window <name>   tmux window name (default: agents)
  -h, --help        show this help

Notes:
  - If already inside tmux, this creates a new window in the current session.
  - If the target session already exists, it will be reused.
EOF
}

SESSION="waif-workflow"
WINDOW="agents"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --session)
      SESSION="${2:-}"
      shift 2
      ;;
    --window)
      WINDOW="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown arg: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if ! command -v tmux >/dev/null 2>&1; then
  echo "tmux is required but was not found in PATH." >&2
  exit 1
fi

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

# Worktree helpers (creates or reuses a git worktree at ./<actor>)
worktree_branch_name() {
  local actor="$1"
  printf "%s_Worktree" "$actor"
}

worktree_exists_for_branch() {
  local branch="$1"
  git -C "$repo_root" worktree list --porcelain | awk -v b="refs/heads/$branch" '\
    $1=="branch" && $2==b {print 1; exit 0} END{exit 1}'
}

ensure_worktree() {
  local actor="$1"
  local target_dir="$repo_root/$actor"
  local branch
  branch=$(worktree_branch_name "$actor")

  if [[ -d "$target_dir" ]]; then
    if git -C "$target_dir" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
      return 0
    else
      echo "Directory exists but is not a git worktree: $target_dir" >&2
      return 1
    fi
  fi

  if worktree_exists_for_branch "$branch" >/dev/null 2>&1; then
    echo "Branch '$branch' is already checked out in another worktree." >&2
    return 1
  fi

  if git -C "$repo_root" show-ref --verify --quiet "refs/heads/$branch"; then
    git -C "$repo_root" worktree add "$target_dir" "$branch"
  else
    git -C "$repo_root" worktree add -b "$branch" "$target_dir"
  fi
}

pane_title() {
  local pane_id="$1"
  local title="$2"
  tmux select-pane -t "$pane_id" -T "$title" 2>/dev/null || true
}

pane_bootstrap() {
  local pane_id="$1"
  local label="$2"
  local agent_role="${3:-}"

  pane_title "$pane_id" "$label"

  if [[ -n "$agent_role" ]]; then
    # Use actor name equal to role for simple mapping; ensure worktree exists and start waif in it.
    local actor_name="$agent_role"
    if ! ensure_worktree "$actor_name"; then
      tmux send-keys -t "$pane_id" "cd \"$repo_root\"; clear; echo \"[$label] Failed to create/reuse worktree for $actor_name\"" C-m
      return 0
    fi
    local wt_dir="$repo_root/$actor_name"
    # Export BEADS_NO_DAEMON and BD_ACTOR, cd into worktree, run waif startWork.
    tmux send-keys -t "$pane_id" "cd \"$wt_dir\"; export BEADS_NO_DAEMON=1; export BD_ACTOR=\"$actor_name\"; clear; echo \"[$label] Starting waif startWork in $wt_dir\"; waif startWork \"$actor_name\"" C-m
  else
    tmux send-keys -t "$pane_id" "cd \"$repo_root\"; clear; echo \"[User] Shell ready in repo root.\"" C-m
  fi
}

create_layout_in_window() {
  local target_window="$1" # e.g. session:window

  local pm_pane
  pm_pane="$(tmux display-message -p -t "$target_window" '#{pane_id}')"
  pane_bootstrap "$pm_pane" "PM agent" "pm"

  local design_pane
  design_pane="$(tmux split-window -t "$target_window" -c "$repo_root" -P -F '#{pane_id}' -v)"
  pane_bootstrap "$design_pane" "Design agent" "design"

  local build_pane
  build_pane="$(tmux split-window -t "$target_window" -c "$repo_root" -P -F '#{pane_id}' -h)"
  pane_bootstrap "$build_pane" "Build agent" "build"

  local docs_pane
  docs_pane="$(tmux split-window -t "$target_window" -c "$repo_root" -P -F '#{pane_id}' -v)"
  pane_bootstrap "$docs_pane" "Doc agent" "docs"

  local review_pane
  review_pane="$(tmux split-window -t "$target_window" -c "$repo_root" -P -F '#{pane_id}' -h)"
  pane_bootstrap "$review_pane" "Review agent" "review"

  local user_pane
  user_pane="$(tmux split-window -t "$target_window" -c "$repo_root" -P -F '#{pane_id}' -v)"
  pane_bootstrap "$user_pane" "User" ""

  tmux select-layout -t "$target_window" tiled >/dev/null 2>&1 || true
  tmux select-pane -t "$user_pane" >/dev/null 2>&1 || true
}

if [[ -n "${TMUX:-}" ]]; then
  # Already inside tmux: add a new window to the current session.
  current_session="$(tmux display-message -p '#{session_name}')"
  target_window="${current_session}:${WINDOW}"

  if tmux list-windows -t "$current_session" -F '#{window_name}' | grep -Fxq "$WINDOW"; then
    echo "Window '$WINDOW' already exists in session '$current_session'." >&2
    echo "Switching to it." >&2
  else
    tmux new-window -t "$current_session" -n "$WINDOW" -c "$repo_root" >/dev/null
    create_layout_in_window "$target_window"
  fi

  tmux select-window -t "$target_window" >/dev/null
  exit 0
fi

# Not inside tmux: create/reuse session, then attach.
if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "Reusing existing tmux session: $SESSION" >&2
else
  tmux new-session -d -s "$SESSION" -n "$WINDOW" -c "$repo_root"
  create_layout_in_window "$SESSION:$WINDOW"
fi

tmux attach -t "$SESSION"
