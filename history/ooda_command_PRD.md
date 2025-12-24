# OODA command PRD (spike draft)

Context
- Parent: wf-cvz (read-only OODA loop for tmux agent monitoring)
- This spike collects probe data and drafts heuristics for Busy/Free classification.

Proposed lifecycle / UX (v0 spike assumptions)
- Command: `waif ooda` (future), spike uses `scripts/ooda_probe.sh`
- Modes:
  - `--once`: single snapshot
  - default loop: poll at interval, print table to stdout
- Flags (planned): `--interval`, `--log <path>`, `--once`, `--no-log`, `--sample`
- Start/stop: run in a terminal; stop with Ctrl-C. Future: `waif ooda start/stop` wrappers.

Success criteria (spike)
- Table output: Agent | Busy/Free | Title
- Logs saved under history/ooda_probe_<ts>.txt
- Heuristics doc lists >=2 signals and default poll interval

Open questions / follow-ups
- Where to store configurable heuristics (env vs config file)
- How to represent agent identity beyond pane title (future heartbeat?)
- Table rendering under very narrow terminals

Next steps
- Harden parsing of tmux output
- Add tests around heuristics classification once integrated into waif CLI
- Revisit backoff strategy post-probe data review
