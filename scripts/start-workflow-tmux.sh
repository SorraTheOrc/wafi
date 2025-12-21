#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/start-workflow-tmux.sh [--restart] [--session <name>] [--window <name>]

Starts (or reuses) a tmux session and creates one pane per workflow agent
(described in docs/Workflow.md) plus a user pane.

Options:
  --restart         kill tmux server first (outside tmux only)
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
RESTART=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --restart)
      RESTART=1
      shift
      ;;
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

setup_tmux_options() {
  local target_window="${1:-}"

  # Enable mouse globally.
  tmux set-option -g mouse on >/dev/null 2>&1 || true

  # Configure the workflow window so pane borders show only agent names and
  # prevent shells/programs from mutating names/titles.
  if [[ -n "$target_window" ]]; then
    tmux set-window-option -t "$target_window" allow-rename off >/dev/null 2>&1 || true
    tmux set-window-option -t "$target_window" automatic-rename off >/dev/null 2>&1 || true
    tmux set-window-option -t "$target_window" pane-border-format "#{pane_title}" >/dev/null 2>&1 || true
    tmux set-window-option -t "$target_window" pane-active-border-format "#{pane_title}" >/dev/null 2>&1 || true
  else
    tmux set-window-option -g allow-rename off >/dev/null 2>&1 || true
    tmux set-window-option -g automatic-rename off >/dev/null 2>&1 || true
    tmux set-window-option -g pane-border-format "#{pane_title}" >/dev/null 2>&1 || true
    tmux set-window-option -g pane-active-border-format "#{pane_title}" >/dev/null 2>&1 || true
  fi
}

retitle_workflow_panes() {
  local target_window="$1" # session:window
  local delay="${2:-0}" # optional delay in seconds

  if [[ "$delay" -gt 0 ]]; then
    sleep "$delay"
  fi

  # Force pane titles to agent names, overriding any shell escape sequences.
  tmux select-pane -t "${target_window}.0" -T "pm" 2>/dev/null || true
  tmux select-pane -t "${target_window}.1" -T "design" 2>/dev/null || true
  tmux select-pane -t "${target_window}.2" -T "build" 2>/dev/null || true
  tmux select-pane -t "${target_window}.3" -T "docs" 2>/dev/null || true
  tmux select-pane -t "${target_window}.4" -T "review" 2>/dev/null || true
  tmux select-pane -t "${target_window}.5" -T "User" 2>/dev/null || true
}

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

# Worktree helpers (creates or reuses a git worktree at ./worktree_<actor>)
worktree_branch_name() {
  local actor="$1"
  printf "worktree_%s" "$actor"
}

worktree_dir_path() {
  local actor="$1"
  printf "%s/worktree_%s" "$repo_root" "$actor"
}

worktree_exists_for_branch() {
  local branch="$1"
  git -C "$repo_root" worktree list --porcelain | awk -v b="refs/heads/$branch" '\
    $1=="branch" && $2==b {print 1; exit 0} END{exit 1}'
}

ensure_worktree() {
  local actor="$1"
  local target_dir
  target_dir="$(worktree_dir_path "$actor")"
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

  if [[ -n "$agent_role" ]]; then
    pane_title "$pane_id" "$agent_role"
  else
    pane_title "$pane_id" "$label"
  fi

    if [[ -n "$agent_role" ]]; then
      # Use actor name equal to role for simple mapping; ensure worktree exists and start waif in it.
      local actor_name="$agent_role"
      if ! ensure_worktree "$actor_name"; then
        tmux send-keys -t "$pane_id" "cd \"$repo_root\"; clear; echo \"[$label] Failed to create/reuse worktree for $actor_name\"" C-m
        return 0
      fi
      local wt_dir
      wt_dir="$(worktree_dir_path "$actor_name")"
      local extra_cmd=""
      if [[ "$actor_name" == "pm" ]]; then
        extra_cmd="function idle_task(){ clear; waif in-progress; }; source \"${repo_root}/scripts/idle-scheduler.sh\""
      fi
      local pane_cmd="cd \"$wt_dir\"; export BEADS_NO_DAEMON=1; export BD_ACTOR=\"$actor_name\"; clear"
      if [[ -n "$extra_cmd" ]]; then
        pane_cmd+="; $extra_cmd"
      fi
      pane_cmd+="; waif startWork \"$actor_name\""
      tmux send-keys -t "$pane_id" "$pane_cmd" C-m
    else
      tmux send-keys -t "$pane_id" "cd \"$repo_root\"; clear; echo \"[User] Shell ready in repo root.\"" C-m
    fi

}


create_layout_in_window() {
  local target_window="$1" # e.g. session:window

  # Apply window-specific tmux options before any panes start their shells.
  setup_tmux_options "$target_window"

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

  # Shells will set their titles via escape sequences during startup.
  # Wait briefly then force our agent names back.
  (sleep 0.5; retitle_workflow_panes "$target_window" 0) &
}

if [[ -n "${TMUX:-}" ]]; then
  current_session="$(tmux display-message -p '#{session_name}')"
  target_window="${current_session}:${WINDOW}"

  if tmux list-windows -t "$current_session" -F '#{window_name}' | grep -Fxq "$WINDOW"; then
    echo "Window '$WINDOW' already exists in session '$current_session'." >&2
    echo "Switching to it." >&2
    setup_tmux_options "$target_window"
  else
    tmux new-window -t "$current_session" -n "$WINDOW" -c "$repo_root" >/dev/null
    create_layout_in_window "$target_window"
  fi

  tmux select-window -t "$target_window" >/dev/null
  retitle_workflow_panes "$target_window" 0
  exit 0
fi

# Not inside tmux: optionally restart server, then create/reuse session and attach.
if [[ "$RESTART" -eq 1 ]]; then
  echo "Restarting tmux server..." >&2
  tmux kill-server >/dev/null 2>&1 || true
fi

if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "Reusing existing tmux session: $SESSION" >&2
else
  tmux new-session -d -s "$SESSION" -n "$WINDOW" -c "$repo_root"
  create_layout_in_window "$SESSION:$WINDOW"
fi

# Wait for background retitle job from create_layout_in_window
sleep 0.6
retitle_workflow_panes "$SESSION:$WINDOW" 0
setup_tmux_options "$SESSION:$WINDOW"

tmux attach -t "$SESSION"
