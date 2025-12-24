# OODA Busy/Free heuristics (spike)

Goals:
- Provide simple, explainable signals to classify tmux panes as Busy/Free
- Favor pane-title hints first; add lightweight process checks as secondary signals

Primary signals (pane title):
- Mark Busy if title contains: busy, running, in_progress, agent, or a bd id pattern (e.g., map-wf-cvz.1)
- Mark Free if title is empty or contains idle

Secondary signals (process state):
- If pane PID exists and %CPU > 0 within sample window -> Busy
- If process STAT first letter is not S (sleeping) or I (idle) -> Busy
- Otherwise -> Free

Fallback:
- Free if no title and no process data

Recommended poll interval and backoff:
- Default interval: 5s
- Jitter: up to 1s
- Backoff to 60s after 12 unchanged cycles

Notes:
- Keep probe read-only; do not send input to tmux
- Keep heuristics configurable via env vars in future iterations
