#!/usr/bin/env bash
# Note: We use 'set -u' for undefined variable checking but NOT 'set -e'
# because we want to handle errors gracefully (e.g., worktree creation failures
# should not prevent tmux from starting).
set -uo pipefail

# Track warnings to display in welcome message
declare -a WARNINGS=()

usage() {
  cat <<'EOF'
Usage:
  scripts/start-workflow-tmux.sh [--restart] [--session <name>]

Starts (or reuses) a tmux session and creates windows/panes for workflow agents
(described in docs/Workflow.md) plus a user pane.

Options:
  --restart         kill tmux server first (outside tmux only)
  --session <name>  tmux session name (default: waif-workflow)
  -h, --help        show this help

Environment:
  WORKFLOW_AGENTS_CONFIG  path to alternate workflow_agents.yaml config file

Notes:
  - If already inside tmux, this creates new windows in the current session.
  - If the target session already exists, it will be reused.
  - Agent panes are configured via config/workflow_agents.yaml.
  - Agents are grouped into windows by their 'window' field (default: core).
EOF
}

SESSION="waif-workflow"
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
# Load agent config from YAML via Node.js helper.
# Falls back to built-in defaults if config is missing.

load_agents_config() {
  local parser_script="$repo_root/scripts/parse-workflow-config.js"
  
  if [[ ! -f "$parser_script" ]]; then
    echo "Error: Config parser not found: $parser_script" >&2
    exit 1
  fi
  
  if ! command -v node >/dev/null 2>&1; then
    echo "Error: node is required to parse workflow config." >&2
    exit 1
  fi
  
  local config_json
  if ! config_json=$(node "$parser_script" 2>&1); then
    echo "Error parsing workflow config:" >&2
    echo "$config_json" >&2
    exit 2
  fi
  
  echo "$config_json"
}

# Parse JSON array into bash arrays using node (avoids jq dependency)
# Sets global arrays: AGENT_NAMES, AGENT_LABELS, AGENT_ROLES, AGENT_WINDOWS, AGENT_WORKTREES,
#                     AGENT_IS_USERS, AGENT_IDLE_TASKS, AGENT_IDLE_FREQS, AGENT_IDLE_VARS
# Also sets associative array: AGENT_ENVS (name -> "KEY=val KEY2=val2" string)
declare -a AGENT_NAMES=()
declare -a AGENT_LABELS=()
declare -a AGENT_ROLES=()
declare -a AGENT_WINDOWS=()
declare -a AGENT_WORKTREES=()
declare -a AGENT_IS_USERS=()
declare -a AGENT_IDLE_TASKS=()
declare -a AGENT_IDLE_FREQS=()
declare -a AGENT_IDLE_VARS=()
declare -A AGENT_ENVS=()

parse_agents_json() {
  local json="$1"
  
  # Use Node.js to parse JSON and output shell-friendly format
  # Note: Empty fields use a placeholder to prevent bash IFS from collapsing consecutive tabs
  local parsed
  parsed=$(node -e "
const data = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf-8'));
const EMPTY = '__EMPTY__';  // Placeholder for empty fields
for (const agent of data) {
  const name = agent.name;
  const label = agent.label;
  const role = agent.role || EMPTY;
  const window = agent.window || 'core';
  const worktree = agent.worktree ? '1' : '0';
  const is_user = agent.is_user ? '1' : '0';
  
  const idle = agent.idle || {};
  const idle_task = idle.task || EMPTY;
  const idle_freq = String(idle.frequency || 30);
  const idle_var = String(idle.variance || 10);
  
  // Format env vars as KEY=value pairs (space-separated, shell-quoted)
  const envPairs = Object.entries(agent.env || {}).map(([k, v]) => {
    // Simple shell quoting for values
    const quoted = String(v).replace(/'/g, \"'\\\\''\");
    return k + \"='\" + quoted + \"'\";
  });
  const env_str = envPairs.join(' ') || EMPTY;
  
  // Output tab-separated fields
  console.log([name, label, role, window, worktree, is_user, idle_task, idle_freq, idle_var, env_str].join('\t'));
}
" <<< "$json")
  
  while IFS=$'\t' read -r name label role window worktree is_user idle_task idle_freq idle_var env_str; do
    # Convert placeholders back to empty strings
    [[ "$role" == "__EMPTY__" ]] && role=""
    [[ "$idle_task" == "__EMPTY__" ]] && idle_task=""
    [[ "$env_str" == "__EMPTY__" ]] && env_str=""
    
    AGENT_NAMES+=("$name")
    AGENT_LABELS+=("$label")
    AGENT_ROLES+=("$role")
    AGENT_WINDOWS+=("$window")
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

retitle_window_panes() {
  local target_window="$1" # session:window
  local window_name="$2"   # window name to filter agents
  local delay="${3:-0}"    # optional delay in seconds

  if [[ "$delay" -gt 0 ]]; then
    sleep "$delay"
  fi

  # Force pane titles to agent labels for agents in this window
  local pane_idx=0
  local i
  for i in "${!AGENT_NAMES[@]}"; do
    if [[ "${AGENT_WINDOWS[$i]}" == "$window_name" ]]; then
      local label="${AGENT_LABELS[$i]}"
      tmux select-pane -t "${target_window}.${pane_idx}" -T "$label" 2>/dev/null || true
      ((pane_idx++))
    fi
  done
}

# --- Worktree helpers ---

worktree_branch_name() {
  local actor="$1"
  printf "worktree_%s" "$actor"
}

# Return a path for the actor's worktree. If the branch is already checked out
# in any worktree, return that existing path; otherwise return the default
# ./worktree_<actor> path under the repo root.
worktree_dir_path() {
  local actor="$1"
  local branch
  branch=$(worktree_branch_name "$actor")

  # Look for an existing worktree that has this branch checked out. The
  # porcelain output lists 'worktree <path>' and 'branch refs/heads/<name>' pairs.
  local existing
  existing=$(git -C "$repo_root" worktree list --porcelain | awk -v b="refs/heads/$branch" '\
    $1=="worktree"{p=$2} $1=="branch" && $2==b {print p; exit 0} END{exit 1}') || true

  if [[ -n "$existing" ]]; then
    printf "%s" "$existing"
    return 0
  fi

  printf "%s/worktree_%s" "$repo_root" "$actor"
}

ensure_worktree() {
  local actor="$1"
  local target_dir
  target_dir="$(worktree_dir_path "$actor")"
  local branch
  branch=$(worktree_branch_name "$actor")

  # If the target directory already exists on disk, ensure it's a worktree.
  if [[ -d "$target_dir" ]]; then
    if git -C "$target_dir" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
      return 0
    else
      WARNINGS+=("[$actor] Directory exists but is not a git worktree: $target_dir")
      return 1
    fi
  fi

  # If the branch is checked out in another worktree, reuse it instead of failing.
  local existing
  existing=$(git -C "$repo_root" worktree list --porcelain | awk -v b="refs/heads/$branch" '\
    $1=="worktree"{p=$2} $1=="branch" && $2==b {print p; exit 0} END{exit 1}') || true
  if [[ -n "$existing" ]]; then
    WARNINGS+=("[$actor] Branch '$branch' already checked out at: $existing")
    return 0
  fi

  # Try to create the worktree at the desired path
  local output
  if git -C "$repo_root" show-ref --verify --quiet "refs/heads/$branch"; then
    if ! output=$(git -C "$repo_root" worktree add "$target_dir" "$branch" 2>&1); then
      WARNINGS+=("[$actor] Failed to create worktree: $output")
      return 1
    fi
  else
    if ! output=$(git -C "$repo_root" worktree add -b "$branch" "$target_dir" 2>&1); then
      WARNINGS+=("[$actor] Failed to create worktree: $output")
      return 1
    fi
  fi
  
  return 0
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
  local worktree_failed=0
  
  if [[ "$use_worktree" == "1" ]]; then
    if ensure_worktree "$name"; then
      working_dir="$(worktree_dir_path "$name")"
    else
      # Worktree failed - continue with repo root
      worktree_failed=1
    fi
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
  
  # Show warning if worktree failed
  if [[ "$worktree_failed" -eq 1 ]]; then
    cmd+="; echo '⚠ [$label] Worktree unavailable - using repo root'"
  fi
  
  # Start waif if role is specified
  # Note: waif startWork spawns a new shell, so any setup after this
  # must be sent as a separate command to the pane
  if [[ -n "$role" ]]; then
    cmd+="; waif startWork \"$role\""
  fi
  
  tmux send-keys -t "$pane_id" "$cmd" C-m
  
  # Set up idle task AFTER waif startWork has spawned the new shell
  # We need a small delay to let the new shell initialize
  if [[ -n "$idle_task" ]]; then
    local idle_cmd=""
    # Escape the idle_task for embedding in the function definition
    local escaped_task
    escaped_task=$(printf '%q' "$idle_task")
    idle_cmd="stty -echo 2>/dev/null; function idle_task(){ eval $escaped_task; }; source \"$repo_root/scripts/idle-scheduler.sh\" $idle_freq $idle_var; stty echo 2>/dev/null; clear"
    
    # Send idle setup after a brief delay to let the new shell start
    (sleep 1; tmux send-keys -t "$pane_id" "$idle_cmd" C-m) &
  fi
}

# --- Layout creation ---

# Get unique window names from agent config (preserving order)
get_window_names() {
  local seen=""
  for window in "${AGENT_WINDOWS[@]}"; do
    if [[ ! " $seen " =~ " $window " ]]; then
      echo "$window"
      seen="$seen $window"
    fi
  done
}

# Get agent indices for a specific window
get_agents_for_window() {
  local window_name="$1"
  for i in "${!AGENT_NAMES[@]}"; do
    if [[ "${AGENT_WINDOWS[$i]}" == "$window_name" ]]; then
      echo "$i"
    fi
  done
}

create_layout_in_window() {
  local target_window="$1" # e.g. session:window
  local window_name="$2"   # window name to filter agents

  # Apply window-specific tmux options before any panes start their shells.
  setup_tmux_options "$target_window"

  # Get agent indices for this window
  local -a window_agents=()
  while read -r idx; do
    window_agents+=("$idx")
  done < <(get_agents_for_window "$window_name")

  local agent_count="${#window_agents[@]}"
  if [[ "$agent_count" -eq 0 ]]; then
    echo "Warning: No agents configured for window '$window_name'." >&2
    return 0  # Don't fail, just skip
  fi

  # First pane is already created with the window
  local first_pane
  first_pane="$(tmux display-message -p -t "$target_window" '#{pane_id}')" || {
    echo "Error: Failed to get first pane for $target_window" >&2
    return 0
  }
  pane_bootstrap_from_config "$first_pane" "${window_agents[0]}"

  # Create additional panes
  local pane_num
  local last_user_pane=""
  for (( pane_num=1; pane_num<agent_count; pane_num++ )); do
    local agent_idx="${window_agents[$pane_num]}"
    
    # Alternate split direction for a tiled-ish layout
    local split_dir="-v"
    if (( pane_num % 2 == 0 )); then
      split_dir="-h"
    fi
    
    local new_pane
    new_pane="$(tmux split-window -t "$target_window" -c "$repo_root" -P -F '#{pane_id}' $split_dir 2>&1)" || {
      echo "Warning: Failed to create pane for ${AGENT_NAMES[$agent_idx]}: $new_pane" >&2
      continue
    }
    pane_bootstrap_from_config "$new_pane" "$agent_idx"
    
    # Track user pane for focus
    if [[ "${AGENT_IS_USERS[$agent_idx]}" == "1" ]]; then
      last_user_pane="$new_pane"
    fi
  done

  # Check if first agent is user pane
  if [[ "${AGENT_IS_USERS[${window_agents[0]}]}" == "1" ]]; then
    last_user_pane="$first_pane"
  fi

  tmux select-layout -t "$target_window" tiled >/dev/null 2>&1 || true
  
  # Focus on user pane if present in this window
  if [[ -n "$last_user_pane" ]]; then
    tmux select-pane -t "$last_user_pane" >/dev/null 2>&1 || true
  fi

  # Shells will set their titles via escape sequences during startup.
  # Wait briefly then force our agent names back.
  (sleep 0.5; retitle_window_panes "$target_window" "$window_name" 0) &
}

# Create all windows for a session
create_all_windows() {
  local session="$1"
  local first_window=1

  while read -r window_name; do
    local target_window="${session}:${window_name}"
    
    if [[ "$first_window" -eq 1 ]]; then
      # Rename the default window created with the session
      tmux rename-window -t "${session}:0" "$window_name" >/dev/null 2>&1 || true
      first_window=0
    else
      # Create new window
      if tmux list-windows -t "$session" -F '#{window_name}' | grep -Fxq "$window_name"; then
        echo "Window '$window_name' already exists in session '$session'." >&2
      else
        tmux new-window -t "$session" -n "$window_name" -c "$repo_root" >/dev/null
      fi
    fi
    
    create_layout_in_window "$target_window" "$window_name"
  done < <(get_window_names)
  
  # Select the first window (usually 'core')
  local first_win
  first_win=$(get_window_names | head -1)
  tmux select-window -t "${session}:${first_win}" >/dev/null 2>&1 || true
}

# --- Main ---

# Load and parse agent config
agents_json="$(load_agents_config)" || {
  echo "Error: Failed to load agent config" >&2
  exit 1
}
parse_agents_json "$agents_json"

if [[ "${#AGENT_NAMES[@]}" -eq 0 ]]; then
  echo "Error: No agents parsed from config" >&2
  exit 1
fi

echo "Starting workflow with ${#AGENT_NAMES[@]} agents..." >&2

if [[ -n "${TMUX:-}" ]]; then
  current_session="$(tmux display-message -p '#{session_name}')"
  
  # Create windows for each unique window name in config
  while read -r window_name; do
    target_window="${current_session}:${window_name}"
    
    if tmux list-windows -t "$current_session" -F '#{window_name}' | grep -Fxq "$window_name"; then
      echo "Window '$window_name' already exists in session '$current_session'." >&2
      echo "Switching to it." >&2
      setup_tmux_options "$target_window"
    else
      tmux new-window -t "$current_session" -n "$window_name" -c "$repo_root" >/dev/null
      create_layout_in_window "$target_window" "$window_name"
    fi
  done < <(get_window_names)

  # Select the first window (usually 'core')
  first_win=$(get_window_names | head -1)
  tmux select-window -t "${current_session}:${first_win}" >/dev/null 2>&1 || true
  retitle_window_panes "${current_session}:${first_win}" "$first_win" 0
  
  # Print any warnings
  if [[ "${#WARNINGS[@]}" -gt 0 ]]; then
    echo "" >&2
    echo "Warnings:" >&2
    for warn in "${WARNINGS[@]}"; do
      echo "  - $warn" >&2
    done
  fi
  exit 0
fi

# Not inside tmux: optionally restart server, then create/reuse session and attach.
if [[ "$RESTART" -eq 1 ]]; then
  echo "Restarting tmux server..." >&2
  tmux kill-server >/dev/null 2>&1 || true
fi

should_create=0

if tmux has-session -t "$SESSION" 2>/dev/null; then
  if [[ ! -t 0 ]]; then
    echo "Non-interactive shell: opening existing session: $SESSION" >&2
    tmux attach -t "$SESSION"
    exit 0
  fi

  echo "tmux session '$SESSION' already exists." >&2
  echo "Choose an option:" >&2
  echo "  [o] Open existing session" >&2
  echo "  [r] Reset session (kill and recreate)" >&2
  echo "  [c] Cancel" >&2
  printf "> " >&2
  read -r -n1 choice
  echo "" >&2
  case "${choice,,}" in
    o|"")
      echo "Opening existing tmux session: $SESSION" >&2
      tmux attach -t "$SESSION"
      exit 0
      ;;
    r)
      echo "Resetting tmux session: $SESSION" >&2
      tmux kill-session -t "$SESSION" >/dev/null 2>&1 || true
      should_create=1
      ;;
    c)
      echo "Canceled by user." >&2
      exit 0
      ;;
    *)
      echo "Unrecognized selection. Canceling." >&2
      exit 1
      ;;
  esac
else
  should_create=1
fi

if (( should_create == 1 )); then
  echo "Creating new tmux session: $SESSION" >&2
  tmux new-session -d -s "$SESSION" -n "temp" -c "$repo_root" || {
    echo "Error: Failed to create tmux session" >&2
    exit 1
  }
  create_all_windows "$SESSION"
  # Remove the temp window if it still exists
  tmux kill-window -t "${SESSION}:temp" 2>/dev/null || true
fi

# Wait for background retitle jobs from create_layout_in_window
sleep 0.6

# Retitle all windows
while read -r window_name; do
  retitle_window_panes "${SESSION}:${window_name}" "$window_name" 0
  setup_tmux_options "${SESSION}:${window_name}"
done < <(get_window_names)

# Print any warnings before attaching
if [[ "${#WARNINGS[@]}" -gt 0 ]]; then
  echo "" >&2
  echo "Warnings:" >&2
  for warn in "${WARNINGS[@]}"; do
    echo "  - $warn" >&2
  done
  echo "" >&2
fi

tmux attach -t "$SESSION"
