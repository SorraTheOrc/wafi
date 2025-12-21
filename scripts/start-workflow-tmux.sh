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

Environment:
  WORKFLOW_AGENTS_CONFIG  path to alternate workflow_agents.yaml config file

Notes:
  - If already inside tmux, this creates a new window in the current session.
  - If the target session already exists, it will be reused.
  - Agent panes are configured via config/workflow_agents.yaml (or defaults).
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

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

# --- Config loading ---
# Load agent config from YAML via Python helper.
# Falls back to built-in defaults if config is missing.

load_agents_config() {
  local parser_script="$repo_root/scripts/parse-workflow-config.py"
  
  if [[ ! -f "$parser_script" ]]; then
    echo "Error: Config parser not found: $parser_script" >&2
    exit 1
  fi
  
  if ! command -v python3 >/dev/null 2>&1; then
    echo "Error: python3 is required to parse workflow config." >&2
    exit 1
  fi
  
  local config_json
  if ! config_json=$(python3 "$parser_script" 2>&1); then
    echo "Error parsing workflow config:" >&2
    echo "$config_json" >&2
    exit 2
  fi
  
  echo "$config_json"
}

# Parse JSON array into bash arrays using python (avoids jq dependency)
# Sets global arrays: AGENT_NAMES, AGENT_LABELS, AGENT_ROLES, AGENT_WORKTREES,
#                     AGENT_IS_USERS, AGENT_IDLE_TASKS, AGENT_IDLE_FREQS, AGENT_IDLE_VARS
# Also sets associative array: AGENT_ENVS (name -> "KEY=val KEY2=val2" string)
declare -a AGENT_NAMES=()
declare -a AGENT_LABELS=()
declare -a AGENT_ROLES=()
declare -a AGENT_WORKTREES=()
declare -a AGENT_IS_USERS=()
declare -a AGENT_IDLE_TASKS=()
declare -a AGENT_IDLE_FREQS=()
declare -a AGENT_IDLE_VARS=()
declare -A AGENT_ENVS=()

parse_agents_json() {
  local json="$1"
  
  # Use Python to parse JSON and output shell-friendly format
  local parsed
  parsed=$(python3 -c "
import json
import sys
import shlex

data = json.loads(sys.stdin.read())
for agent in data:
    name = agent['name']
    label = agent['label']
    role = agent['role'] if agent['role'] else ''
    worktree = '1' if agent['worktree'] else '0'
    is_user = '1' if agent['is_user'] else '0'
    
    idle = agent.get('idle') or {}
    idle_task = idle.get('task', '')
    idle_freq = str(idle.get('frequency', 30))
    idle_var = str(idle.get('variance', 10))
    
    # Format env vars as KEY=value pairs (space-separated)
    env_pairs = []
    for k, v in agent.get('env', {}).items():
        env_pairs.append(f'{k}={shlex.quote(v)}')
    env_str = ' '.join(env_pairs)
    
    # Output tab-separated fields
    print(f'{name}\t{label}\t{role}\t{worktree}\t{is_user}\t{idle_task}\t{idle_freq}\t{idle_var}\t{env_str}')
" <<< "$json")
  
  while IFS=$'\t' read -r name label role worktree is_user idle_task idle_freq idle_var env_str; do
    AGENT_NAMES+=("$name")
    AGENT_LABELS+=("$label")
    AGENT_ROLES+=("$role")
    AGENT_WORKTREES+=("$worktree")
    AGENT_IS_USERS+=("$is_user")
    AGENT_IDLE_TASKS+=("$idle_task")
    AGENT_IDLE_FREQS+=("$idle_freq")
    AGENT_IDLE_VARS+=("$idle_var")
    AGENT_ENVS["$name"]="$env_str"
  done <<< "$parsed"
}

# --- tmux helpers ---

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

  # Force pane titles to agent labels, overriding any shell escape sequences.
  local i
  for i in "${!AGENT_NAMES[@]}"; do
    local label="${AGENT_LABELS[$i]}"
    tmux select-pane -t "${target_window}.${i}" -T "$label" 2>/dev/null || true
  done
}

# --- Worktree helpers ---

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

# --- Pane bootstrap ---

pane_title() {
  local pane_id="$1"
  local title="$2"
  tmux select-pane -t "$pane_id" -T "$title" 2>/dev/null || true
}

# Bootstrap a pane for an agent based on config
# Args: pane_id agent_index
pane_bootstrap_from_config() {
  local pane_id="$1"
  local idx="$2"
  
  local name="${AGENT_NAMES[$idx]}"
  local label="${AGENT_LABELS[$idx]}"
  local role="${AGENT_ROLES[$idx]}"
  local use_worktree="${AGENT_WORKTREES[$idx]}"
  local is_user="${AGENT_IS_USERS[$idx]}"
  local idle_task="${AGENT_IDLE_TASKS[$idx]}"
  local idle_freq="${AGENT_IDLE_FREQS[$idx]}"
  local idle_var="${AGENT_IDLE_VARS[$idx]}"
  local env_str="${AGENT_ENVS[$name]:-}"
  
  pane_title "$pane_id" "$label"
  
  if [[ "$is_user" == "1" ]]; then
    # User pane - just a shell in repo root
    tmux send-keys -t "$pane_id" "cd \"$repo_root\"; clear; echo \"[User] Shell ready in repo root.\"" C-m
    return 0
  fi
  
  # Agent pane
  local working_dir="$repo_root"
  
  if [[ "$use_worktree" == "1" ]]; then
    if ! ensure_worktree "$name"; then
      tmux send-keys -t "$pane_id" "cd \"$repo_root\"; clear; echo \"[$label] Failed to create/reuse worktree for $name\"" C-m
      return 0
    fi
    working_dir="$(worktree_dir_path "$name")"
  fi
  
  # Build the command to send to the pane
  local cmd="cd \"$working_dir\""
  
  # Add BEADS_NO_DAEMON
  cmd+="; export BEADS_NO_DAEMON=1"
  
  # Add env vars from config
  if [[ -n "$env_str" ]]; then
    # env_str is space-separated KEY=value pairs
    for pair in $env_str; do
      cmd+="; export $pair"
    done
  fi
  
  cmd+="; clear"
  
  # Add idle task setup if configured
  if [[ -n "$idle_task" ]]; then
    # Escape the idle_task for embedding in the function definition
    # Use printf %q to properly escape
    local escaped_task
    escaped_task=$(printf '%q' "$idle_task")
    cmd+="; function idle_task(){ eval $escaped_task; }"
    cmd+="; source \"$repo_root/scripts/idle-scheduler.sh\" $idle_freq $idle_var"
  fi
  
  # Start waif if role is specified
  if [[ -n "$role" ]]; then
    cmd+="; waif startWork \"$role\""
  fi
  
  tmux send-keys -t "$pane_id" "$cmd" C-m
}

# --- Layout creation ---

create_layout_in_window() {
  local target_window="$1" # e.g. session:window

  # Apply window-specific tmux options before any panes start their shells.
  setup_tmux_options "$target_window"

  local agent_count="${#AGENT_NAMES[@]}"
  if [[ "$agent_count" -eq 0 ]]; then
    echo "Error: No agents configured." >&2
    exit 1
  fi

  # First pane is already created with the window
  local first_pane
  first_pane="$(tmux display-message -p -t "$target_window" '#{pane_id}')"
  pane_bootstrap_from_config "$first_pane" 0

  # Create additional panes
  local i
  local last_user_pane=""
  for (( i=1; i<agent_count; i++ )); do
    # Alternate split direction for a tiled-ish layout
    local split_dir="-v"
    if (( i % 2 == 0 )); then
      split_dir="-h"
    fi
    
    local new_pane
    new_pane="$(tmux split-window -t "$target_window" -c "$repo_root" -P -F '#{pane_id}' $split_dir)"
    pane_bootstrap_from_config "$new_pane" "$i"
    
    # Track user pane for focus
    if [[ "${AGENT_IS_USERS[$i]}" == "1" ]]; then
      last_user_pane="$new_pane"
    fi
  done

  tmux select-layout -t "$target_window" tiled >/dev/null 2>&1 || true
  
  # Focus on user pane if present
  if [[ -n "$last_user_pane" ]]; then
    tmux select-pane -t "$last_user_pane" >/dev/null 2>&1 || true
  fi

  # Shells will set their titles via escape sequences during startup.
  # Wait briefly then force our agent names back.
  (sleep 0.5; retitle_workflow_panes "$target_window" 0) &
}

# --- Main ---

# Load and parse agent config
agents_json="$(load_agents_config)"
parse_agents_json "$agents_json"

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
