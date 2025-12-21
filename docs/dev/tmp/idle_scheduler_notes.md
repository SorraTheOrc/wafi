# Idle Scheduler Notes (wf-6pe)

- **Module file**: `scripts/idle-scheduler.sh`
- **Scope**: Provide an interactive-shell-only idle task runner with randomized intervals and safe `PROMPT_COMMAND` chaining.
- **Key features**:
  - Random interval between `IDLE_SCHEDULER_MIN_INTERVAL` (default 20s) and `IDLE_SCHEDULER_MAX_INTERVAL` (default 40s)
  - Guard against multiple sourcing via `__IDLE_SCHEDULER_ACTIVE`
  - Allows overriding `idle_task()` before sourcing
  - Handles `PROMPT_COMMAND` defined as a string or array, prepending the scheduler hook
  - Exits early when not in an interactive shell
- **Manual validation plan**:
  1. Source the module in two separate terminals
  2. Override `idle_task()` to log to a file and confirm independent timers
  3. Run a long-lived command to ensure the scheduler waits until the prompt returns
- **Open questions**: Consider tmux/session awareness and optional guards for `PIPESTATUS`/last exit code in future enhancements
