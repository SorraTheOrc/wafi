Short spike: reuse patterns from Beads' Claude integration for WAIF OpenCode plugin

Reviewed materials referenced by wf-gn7.2 (Claude integration patterns):
- CLI + Hooks (bd prime + SessionStart/PreCompact hooks) for context injection
- Small priming contexts (recommend ~1–2k tokens)
- Avoid shipping Claude Skills by default; make plugin-scoped skills opt-in
- Lightweight install/setup UX (bd setup claude) + health checks
- MCP server as optional fallback for non-shell environments

Analysis and recommendations (summary):
1) Adopt a CLI + Hooks approach for OpenCode context injection. Implement a small priming CLI command (waif prime/opencode) and lifecycle hooks (session.start, pre-compact) rather than embedding a large MCP tool schema. Rationale: simpler install surface, predictable lifecycle, lower attack surface.

2) Enforce compact priming. Provide utilities for summarization and token-counting; default priming target ~1k–2k tokens. Rationale: reduces latency/cost and keeps LLM attention focused on task-critical facts.

3) Make any OpenCode-specific "skills" or extended agent behaviors opt-in and plugin-scoped. Do not enable by default. Provide a clear opt-in CLI flag and uninstall path. Rationale: avoids surprising behavior for users and reduces maintenance burden.

4) Provide a lightweight installer/health-check command for hooks (e.g., waif setup opencode-hooks). Installer should: register hooks, validate hook lifecycle, run a smoke test that emits a sample event and verifies OODA consumption, and surface actionable errors.

5) Provide an MCP/fallback option for restricted environments (CI, limited shell). Document differences and trade-offs (latency, complexity, auth). Rationale: ensures compatibility with environments where the CLI cannot run local hooks.

6) Security and secrets: do not populate priming context with raw secrets. Implement redaction and a permission boundary for what the plugin can include in priming content. Rationale: limit accidental secret exposure.

7) Testing: create end-to-end CI tests for hook installation, priming, and OODA detection (happy path and failure modes). Rationale: prevent regressions and ensure developer setup works reliably.

Recommended immediate child issues (one recommendation each):
- Implement CLI-based Hooks (context injection)
- Hook installer + health checks
- Compact priming utilities (summarize, token-limit enforcement)
- Opt-in skills policy and implementation
- MCP fallback server support
- End-to-end CI tests for hooks and OODA
- Security review and secrets handling

Files referenced while reviewing:
- .opencode/ (local command templates)
- history/design-opencode-agent-integration-body.txt
- history/wire-waif-prd-to-prd-agent-body.txt

Next steps taken in this session:
- Child bd issues created (see beads for IDs)
- This spike note written to history/wf-gn7.claude-spike.md

Risks / follow-ups:
- Claude-specific patterns may not map 1:1 to OpenCode lifecycle; validate hook lifecycle events during implementation.
- Token limits and summarization heuristics require iteration after real-world testing.
- Security policy work may surface infra/permission requirements that delay rollout.

Prepared-by: Map (PM AI)
Date: 2025-12-24
