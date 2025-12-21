#!/usr/bin/env bash
# Per-terminal idle scheduler module with randomized intervals.
# Source from your interactive shell rc file (e.g., ~/.bashrc.d/idle-scheduler.sh).

if [[ ${BASH_SOURCE[0]} == "$0" ]]; then
  printf 'idle-scheduler: source this file instead of executing it.\n' >&2
  exit 1
fi

# Exit early for non-interactive shells or subshells to avoid unnecessary work.
if [[ $- != *i* ]]; then
  return 0
fi

if [[ -n ${__IDLE_SCHEDULER_ACTIVE:-} ]]; then
  return 0
fi
__IDLE_SCHEDULER_ACTIVE=1

__idle_scheduler_is_uint() {
  case $1 in
    (""|*[!0-9]*) return 1 ;;
    (*) return 0 ;;
  esac
}

__idle_scheduler_resolve_uint() {
  local candidate=$1
  local fallback=$2
  if __idle_scheduler_is_uint "$candidate"; then
    printf '%s\n' "$candidate"
  else
    printf '%s\n' "$fallback"
  fi
}

__IDLE_SCHEDULER_FREQUENCY_DEFAULT=${IDLE_SCHEDULER_FREQUENCY:-30}
__IDLE_SCHEDULER_VARIANCE_DEFAULT=${IDLE_SCHEDULER_VARIANCE:-10}

__IDLE_SCHEDULER_FREQUENCY=$(__idle_scheduler_resolve_uint "${1:-}" "$__IDLE_SCHEDULER_FREQUENCY_DEFAULT")
__IDLE_SCHEDULER_VARIANCE=$(__idle_scheduler_resolve_uint "${2:-}" "$__IDLE_SCHEDULER_VARIANCE_DEFAULT")

if (( __IDLE_SCHEDULER_FREQUENCY < 1 )); then
  __IDLE_SCHEDULER_FREQUENCY=1
fi
if (( __IDLE_SCHEDULER_VARIANCE < 0 )); then
  __IDLE_SCHEDULER_VARIANCE=0
fi

__idle_scheduler_min_candidate=$(( __IDLE_SCHEDULER_FREQUENCY - __IDLE_SCHEDULER_VARIANCE ))
if (( __idle_scheduler_min_candidate < 1 )); then
  __idle_scheduler_min_candidate=1
fi
__idle_scheduler_max_candidate=$(( __IDLE_SCHEDULER_FREQUENCY + __IDLE_SCHEDULER_VARIANCE ))
if (( __idle_scheduler_max_candidate < __idle_scheduler_min_candidate )); then
  __idle_scheduler_max_candidate=$__idle_scheduler_min_candidate
fi

if [[ -z ${IDLE_SCHEDULER_MIN_INTERVAL:-} ]]; then
  IDLE_SCHEDULER_MIN_INTERVAL=$__idle_scheduler_min_candidate
fi
if [[ -z ${IDLE_SCHEDULER_MAX_INTERVAL:-} ]]; then
  IDLE_SCHEDULER_MAX_INTERVAL=$__idle_scheduler_max_candidate
fi

# Default idle task prints a timestamp. Users can override by defining idle_task() first.
if ! declare -F idle_task >/dev/null 2>&1; then
  idle_task() {
    printf '[idle task] Running at %s\n' "$(date)"
  }
fi

__idle_scheduler_random_interval() {
  local min=$IDLE_SCHEDULER_MIN_INTERVAL
  local max=$IDLE_SCHEDULER_MAX_INTERVAL

  if (( max < min )); then
    local tmp=$min
    min=$max
    max=$tmp
  fi

  local span=$(( max - min ))
  if (( span <= 0 )); then
    printf '%s\n' "$min"
    return
  fi

  printf '%s\n' $(( RANDOM % (span + 1) + min ))
}

: "${IDLE_SCHEDULER_LAST_RUN:=0}"
: "${IDLE_SCHEDULER_NEXT_INTERVAL:=$(__idle_scheduler_random_interval)}"

__idle_scheduler_run() {
  local now
  now=$(date +%s)

  if (( now - IDLE_SCHEDULER_LAST_RUN >= IDLE_SCHEDULER_NEXT_INTERVAL )); then
    idle_task
    IDLE_SCHEDULER_LAST_RUN=$now
    IDLE_SCHEDULER_NEXT_INTERVAL=$(__idle_scheduler_random_interval)
  fi
}

__idle_scheduler_chain_prompt_command() {
  local hook="__idle_scheduler_run"
  local pc_decl
  pc_decl=$(declare -p PROMPT_COMMAND 2>/dev/null || true)

  if [[ $pc_decl == "declare -a PROMPT_COMMAND="* ]]; then
    local cmd
    for cmd in "${PROMPT_COMMAND[@]}"; do
      if [[ $cmd == "$hook" ]]; then
        return
      fi
    done
    PROMPT_COMMAND=( "$hook" "${PROMPT_COMMAND[@]}" )
    return
  fi

  if [[ -z ${PROMPT_COMMAND:-} ]]; then
    PROMPT_COMMAND="$hook"
  elif [[ $PROMPT_COMMAND == *"$hook"* ]]; then
    return
  else
    PROMPT_COMMAND="$hook; $PROMPT_COMMAND"
  fi
}

__idle_scheduler_chain_prompt_command
