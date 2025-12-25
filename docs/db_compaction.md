db_compaction.md

Purpose

This document describes the recommended runbook and CLI usage for performing Beads (bd) database compaction in this repository. It is derived from the upstream examples (examples/compaction) and the feature request tracked in bd issue wf-2ch.

Goals

- Provide safe, repeatable compaction workflows (interactive and automated).
- Offer tiered compaction modes and thresholds to avoid low-value runs.
- Default to non-destructive preview/dry-run behavior.
- Produce observable output (logs, stats, and exit codes) suitable for CI and cron use.

Command surface (recommended)

bd compact [run|preview|stats] [--tier N] [--threshold N] [--dry-run] [--yes|--commit] [--log-file <path>]

Modes

- preview (default): Identify eligible candidates for compaction and estimate bytes reclaimable and issue counts. Non-destructive.
  - Example: bd compact preview --tier 1 --dry-run --log-file "$BD_LOG_FILE"

- run (execute): Perform compaction. Must be explicit (use --yes or --commit to opt-in to auto-commit/push; otherwise fail-safe requires manual confirmation).
  - Example (interactive): bd compact run --tier 2
  - Example (cron/CI opt-in): bd compact run --tier 1 --threshold 50 --yes --log-file "$BD_LOG_FILE"

- stats: Show post-compact statistics, counts of compacted items, bytes reclaimed, and an estimated cost metric.
  - Example: bd compact stats --log-file "$BD_LOG_FILE"

Flags & environment

- --tier N (1 = safe/light, 2 = deep/ultra-compression)
- --threshold N (only run if >= N eligible items; useful for auto/cron)
- --dry-run (do not modify DB; same as preview)
- --yes or --commit (bypass interactive confirmation and allow commit/push)
- --log-file <path> (write logs to file; env alternative BD_LOG_FILE)

Environment variables

- BD_REPO_PATH: When running compaction from scripts, set repository path explicitly when not running in repo root.
- BD_LOG_FILE: Default log file path used by cron-compact.sh and other scripts.
- ANTHROPIC_API_KEY: Optional. Used by upstream examples for AI-assisted previews; not required for core compaction.

Safety rules (mandatory)

- Default to preview/dry-run. Any run that changes DB or JSONL must require explicit confirmation (interactive) or an explicit flag (--yes/--commit).
- Auto-commit/push in cron must be opt-in and documented. If cron auto-commits, the script must log actions and the commit message should reference the bd issue (wf-2ch) and compaction stats.
- Tier 2 compactions can be slow and should be scheduled during low-traffic windows.

Example scripts (implementation guidance)

- workflow.sh: Interactive, shows preview, prompts per-tier, shows final statistics and guidance. Useful for ad-hoc manual maintenance.
- cron-compact.sh: Non-interactive script for scheduled compaction. Pulls latest, runs bd compact with configured flags, logs output to BD_LOG_FILE, optionally commits and pushes if --yes supplied. Installable into /etc/cron.monthly or a crontab entry.
- auto-compact.sh: Thresholded automation script. Runs only when the number of eligible items exceeds --threshold. Supports --dry-run for testing.

Installation example (cron monthly)

# Ensure script is executable and has proper path/environment
cp cron-compact.sh /etc/cron.monthly/bd-compact
chmod +x /etc/cron.monthly/bd-compact

Or add to crontab:
0 2 1 * * /path/to/cron-compact.sh

Observability & CI

- Exit codes: 0 = success (no changes or run succeeded), 1 = preview/validation error, 2 = compaction made changes and commit/push failed (useful hook in CI to alert maintainers).
- Logs: All runs should write concise logs to --log-file or BD_LOG_FILE. Include counts, bytes reclaimed, tier used, threshold, and commit SHA if a push occurred.
- bd compact --stats should be machine-parseable (JSON output optional) to allow CI to post results or generate cost estimates.

Testing & verification

- Always run preview/dry-run locally before enabling cron jobs: bd compact preview --dry-run --tier 1
- Test cron script locally by setting BD_REPO_PATH to a test clone and running cron-compact.sh --dry-run
- Create unit/integration tests that exercise the CLI flags for thresholds, tiers, dry-run behavior, and exit codes.

Project-size recommendations

- Small (<500 issues): Manual interactive runs (workflow.sh) once or twice per year.
- Medium (500-5,000): Quarterly cron-compact or auto-compact with low threshold.
- Large (5,000+): Monthly cron-compact with tier 2 enabled for deep compaction; consider combining auto-compact for tier 1 in CI with threshold 50.
- High-velocity teams: auto-compact in CI for tier 1 (threshold 50) + monthly cron-compact tier 2.

Runbook & drafts

- Draft scripts and experimental runbooks should be created first in history/examples/compaction/ and then promoted to examples/compaction/ and docs/ after review.
- Reference bd issue: wf-2ch for implementation, tests, and rollout tracking.

References

- Upstream examples: https://github.com/steveyegge/beads/tree/main/examples/compaction
- bd issue: wf-2ch

Maintenance notes

- Any automation that performs git commit/push must include a clear commit message and be reviewed by repo admins if branch protection rules apply.
- Keep default behavior non-destructive and observable; do not permit silent destructive runs.
