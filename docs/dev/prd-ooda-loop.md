# Product Requirements Document

## Introduction

* One-liner
  * A lightweight, read-only OODA loop CLI (`waif ooda`) that continuously monitors tmux agent panes and displays a concise status table (agent | Busy/Free | Title), providing situational awareness for multi-agent workflows.

* Problem statement
  * Operators and PM agents must manually inspect tmux panes to determine agent status. This is slow, error-prone, and does not scale as the number of agents grows. There is no single-pane view that shows who is busy, what they are doing, or a simple way to gather this information for audits.

* Goals
  * Deliver a first-iteration CLI command that runs until stopped and prints a width-aware, read-only table summarizing agent pane state.
  * Make the output human-friendly and scriptable (plain text table) and persist probe logs for auditing in history/.
  * Keep scope conservative: no automation that sends commands to agents in v1.

* Non-goals
  * Initiating actions on agents (e.g., invoking `waif ask`) — automation is explicitly out of scope for v1.
  * Replacing or integrating deeply with CI or centralized monitoring systems.

## Users

* Primary users
  * Producers, PM agents (Map), and human operators who need quick situational awareness across tmux-managed agents.

* Secondary users (optional)
  * Developers performing debugging or audits; observers during handoffs; automation engineers planning later automation phases.

* Key user journeys
  * Start the monitor locally: a human runs `waif ooda start` in a terminal and sees an updating table of agent status.
  * Observe a single glance view: the operator can tell which agents are Busy vs Free and view the pane title to understand current activity.
  * Audit a period of activity: operator runs `waif ooda --log history/ooda_probe_<ts>.txt` to persist a snapshot or continuous log for later review.

## Requirements

* Functional requirements (MVP)
  1. CLI surface
     * Provide `waif ooda start` to start the monitoring loop and `waif ooda stop` to stop it (or `Ctrl-C` to quit interactively).
     * Provide flags: `--interval <seconds>` (default: 5), `--log <path>` to persist probe output, and `--once` to run a single snapshot.
  2. Pane discovery
     * Discover tmux panes using `tmux list-panes` (or equivalent) and read pane titles and PIDs when available.
  3. Display
     * Print a width-aware table with columns: Agent | Busy/Free | Title. Update in-place in the terminal (clearing/redrawing) at the chosen interval.
  4. Heuristics
     * Classify pane state using a configurable heuristic chain:
       * Primary: pane title keywords (e.g., contains 'busy', 'running', 'in\_progress', an agent name, or a bd id).
       * Secondary: PID/process activity (short sampled %CPU > 0 or process state not sleeping).
       * Fallback: treat empty title or explicit 'idle' keyword as Free.
  5. Logging
     * Persist raw probe output when `--log <path>` is provided. Default log directory: `history/` with filenames `history/ooda_probe_<timestamp>.txt`.
  6. Safety & read-only
     * The command must not send any instructions to agents in v1. Any code paths that would call agent commands must be gated behind future flags and explicit owner review.

* Non-functional requirements
  * Low overhead: default polling interval 5s with jitter; backoff to longer intervals (e.g., 60s) after N cycles of no change.
  * Terminal-friendly: handle narrow terminals and wrap or truncate titles gracefully.
  * Cross-platform consideration: prefer standard tmux APIs; if tmux is absent, exit gracefully with a helpful message.
  * Configurability: allow users to override heuristics via env vars or a small config file (e.g., `.waif-ooda.yaml`), but ship sensible defaults.

* Integrations
  * tmux for pane inspection (primary integration).
  * OptionalOS commands: `ps` for process checks where available.
  * Local filesystem for logs (history/).

* Security & privacy
  * Do not record sensitive terminal contents. Logs should only include pane titles, session/window/pane identifiers, and lightweight process metadata (pid, comm, stat, %cpu). Document the exact log schema and redact anything beyond titles and process metadata in later versions.
  * File permissions: when writing logs, default to user-only permissions (umask-respecting file creation).

## Release & Operations

* Rollout plan
  1. Spike / PoC (current): ship a non-invasive probe script (scripts/ooda\_probe.sh) and collect sample outputs into history/ for heuristic tuning.
  2. v1 beta: implement `waif ooda` CLI with read-only monitor, flags for interval and `--log`, and ship under an experimental flag or PATH entry.
  3. Iterate: collect user feedback (operators and Map), harden heuristics, add configuration, and then propose automation phases in a follow-up PRD.

* Quality gates / definition of done
  * Unit and integration tests for parsing tmux output and for heuristics logic (simulated pane outputs).
  * Manual acceptance: a developer can run `waif ooda start` and observe a stable updating table for at least 5 minutes without errors on a dev workstation running tmux.
  * Logging validation: `--log` produces `history/ooda_probe_<ts>.txt` and files contain expected columns and no raw terminal buffers.

* Risks & mitigations
  * Heuristic brittleness: mitigated by combining multiple signals (title + process) and making rules configurable.
  * Interference with live sessions: keep v1 read-only and surface debugging guidance to operators; run spike only on dev workstations.
  * Privacy of logs: mitigate via redaction policy and user-only file permissions on logs.

## Open Questions

* What is the canonical command lifecycle for starting/stopping across environments? (We propose CLI `waif ooda start/stop` for v1.)
* Should we expose a heartbeat API for agents to publish explicit state in future versions, reducing reliance on titles and process heuristics? (future work)
* Where should configuration live for teams (global config vs per-user `~/.waif-ooda`), and what is the expected override priority?

***

Source issue: wf-cvz

Seed context (from issue wf-cvz):

* Title: ooda command that will monitor the state of the project and agents within it and periodicaly issue instructions: Intake brief
* Summary: Need a read-only OODA loop that inspects tmux pane titles, infers Busy/Free heuristics, prints a concise table, and (later) may emit `waif ask` instructions. v1 should remain read-only and save probe output for audit. See related docs: docs/Workflow.md, docs/dev/TUI\_PRD.md, docs/dev/CLI\_PRD.md, docs/dev/idle\_scheduler\_module.md

Assumptions made while drafting

* v1 is strictly read-only and must not call agent commands.
* Users run `waif ooda` on machines where tmux is present (or the tool will fail gracefully).
* Logs are stored under history/ and must not capture raw terminal output beyond titles and lightweight process metadata.
