# ask — docs and E2E guide

Short summary and motivation

- The `waif ask` command is a one-shot CLI to send a short prompt to a named agent and print the agent's Markdown response. It integrates lazily with a local OpenCode server: the CLI will check for a configured server, start one via the OpenCode SDK if needed, then forward the prompt to the requested agent. When the OpenCode SDK or server is unavailable, `waif ask` falls back to a safe, non-fatal placeholder response so interactive workflows aren't blocked.

## Usage examples

- Default behavior (uses default agent "Map"):

```bash
waif ask "Summarize this file for me"
```

- Use a different agent:

```bash
waif ask "What should I change?" --agent Patch
```

- Emit JSON output (machine-readable):

```bash
waif ask "Give me a summary" --json
```

- Read prompt from stdin (hyphen `-` means read stdin):

```bash
echo "Write a short changelog" | waif ask - --agent Scribbler --json
```

- Enable/disable OpenCode integration (env var override):

```bash
OPENCODE_ENABLED=1 waif ask "Use real OpenCode"
OPENCODE_ENABLED=0 waif ask "Use fallback behavior"
```

- Override host/port for an existing server:

```bash
OPENCODE_HOST=127.0.0.1 OPENCODE_PORT=9000 OPENCODE_ENABLED=1 waif ask "Check server"
```

## Runtime behavior (what happens when you run `waif ask`)

1. Validate prompt
   - If the CLI is invoked with `-` as the prompt argument it reads stdin. Otherwise it uses the provided string argument. If no prompt is provided the command exits with a helpful error.

2. OpenCode integration check (lazy)
   - The command consults OpenCode configuration (see Configuration reference below) and the runtime enable flag. OpenCode integration is enabled by default; it can be disabled via env var or config.

3. Server reachability
   - The CLI checks for a running OpenCode server at the configured host/port (from `.opencode/server.yaml` or the env vars `OPENCODE_HOST`/`OPENCODE_PORT`).
   - If a server is reachable the CLI uses it.

4. Start local server (lazy start)
   - If no server is reachable and OpenCode integration is enabled the CLI attempts to start a local server using the OpenCode SDK's `serve()` function.
   - The CLI performs a safe startup with reasonable internal timeouts and logs progress to stderr. Expected log lines include:
     - "OpenCode: starting local server..."
     - "OpenCode: server listening at http://<host>:<port>"
     - "OpenCode: ready"
   - The CLI waits a short, bounded time for the server to become responsive before proceeding. If the server does not become ready within that window the CLI logs a non-fatal warning and proceeds to fallback behavior.

5. Use the server (if available)
   - When a client is available the CLI calls the server via the SDK, mapping the provided agent name to the internal agent ID and issuing the ask request. The CLI prints the returned Markdown (or JSON wrapper if `--json` was passed).

6. Fallback behavior
   - If the OpenCode SDK cannot be imported, the server cannot be started, or the ask call fails, the CLI falls back to a safe, non-fatal placeholder response (a simple Markdown echo with the agent name). Failures are logged as warnings to stderr, not as hard errors, so simple scripting workflows continue to work.

## Configuration reference

- `.opencode/server.yaml` (recommended keys and defaults)
  - The CLI looks in `.opencode/server.yaml` for local OpenCode server configuration. Recommended default example:

```yaml
server:
  host: "localhost"
  port: 8080
  enable: true
  description: "Local OpenCode server config for development. Enable/disable via OPENCODE_ENABLED env var or edit this file."
```

  - Notes:
    - `enable`: When true the CLI will attempt to connect to or start a local OpenCode server. The implementation treats OpenCode integration as enabled by default unless explicitly disabled via env vars or config.
    - `host`/`port`: network address used to check/connect to a running server and to start one if required.

- Environment variable overrides
  - `OPENCODE_HOST` — host to check/start the server on (overrides `.opencode/server.yaml.server.host`)
  - `OPENCODE_PORT` — port used for server connectivity (overrides `.opencode/server.yaml.server.port`)
  - `OPENCODE_ENABLED` — when set to a truthy value (1/true) enables OpenCode integration; when set to an explicit falsy value (0/false) disables it. When unset OpenCode integration is enabled by default.

- Agent name → agent-id mapping
  - Purpose: the CLI (and the OpenCode client) accepts logical agent names like "Map", "Patch", "Scribbler" and maps them to the concrete agent IDs the OpenCode server understands.
  - Recommended location/scheme:
    - File: `.opencode/agent_map.yaml`
    - Schema (YAML mapping string→string):

```yaml
Map: map-agent-id
Patch: patch-agent-id
Scribbler: scribbler-agent-id
```

  - How to add a mapping:
    - Add a new key/value to `.opencode/agent_map.yaml`: `<FriendlyName>: <OpenCodeAgentID>`
    - The `waif ask` CLI reads the mapping at invocation time.

## Testing and E2E guide

- Prerequisites (macOS/Linux):
  - Node.js (recommended current LTS)
  - git checkout of this repository

- Install the OpenCode SDK (local dev):
  - Option A (preferred if `opencode` package alias is available):

```bash
npm install --save-dev opencode
```

  - Option B (explicit SDK package name):

```bash
npm install --save-dev @opencode-ai/sdk
```

- Run the real OpenCode server locally (manual start)
  - Start server in background (port 8080 example):

```bash
npx opencode serve --port 8080 &
echo $! > .opencode/opencode.pid
```

  - Enable CLI to use it:

```bash
export OPENCODE_HOST=localhost
export OPENCODE_PORT=8080
export OPENCODE_ENABLED=1
```

- Run the WAIF E2E tests that hit the real server
  - From repo root:

```bash
# Only runs the E2E ask tests when explicitly enabled
OPENCODE_E2E=1 OPENCODE_ENABLED=1 npm test -- -t "ask.e2e"
```

  - Notes:
    - `npm test` will run the TypeScript build then Vitest. The `-t "ask.e2e"` flag narrows tests to the E2E file.
    - Make sure the OpenCode server is fully up before running tests. If the server is slow to start, start it first and verify the HTTP endpoint responds.

- Test isolation and teardown
  - After tests:

```bash
# kill background server if you started it earlier
if [ -f .opencode/opencode.pid ]; then
  kill $(cat .opencode/opencode.pid) && rm .opencode/opencode.pid
fi
```

  - Or use: `pkill -f "opencode serve"` (be careful in multi-user CI)

  - CI recommendation
    - Preferred: run an official OpenCode service container in your CI pipeline (if one exists), or run the server as a background step before tests:

```bash
# example CI step
npx opencode serve --port 8080 &
export OPENCODE_HOST=localhost OPENCODE_PORT=8080 OPENCODE_ENABLED=1
npm test -- -t "ask.e2e"
```

    - Alternatively the test job may call the CLI's server start helper (the implementation exposes a lazy start behavior), for example:

```bash
# ensure server is up via CLI before running tests
OPENCODE_ENABLED=1 waif ask "warmup" || true
npm test -- -t "ask.e2e"
```

## Security & safety notes

- The OpenCode local server listens on a TCP port — be mindful of exposing it to untrusted networks. Bind to `localhost` in development to reduce exposure.
- Prompts and conversation content may contain confidential information. Treat logs and server storage as sensitive:
  - Avoid storing prompts in long-lived logs or public CI artifacts.
  - If your OpenCode server uses API keys or external model providers, store credentials in CI secret stores (do not check them into repo).
- Audit responses before using them in code generation or CVE-sensitive contexts.

## Troubleshooting — common failures and mitigations

- "Port already in use" when starting server:
  - Change `.opencode/server.yaml` port or set `OPENCODE_PORT` to an unused port.
  - Find the occupying process: `lsof -i :8080` or `ss -ltnp | grep 8080` and stop it.

- OpenCode SDK missing / cannot import
  - Error message: cannot find module 'opencode'
  - Fix: install the SDK locally: `npm install --save-dev opencode` (or `@opencode-ai/sdk`).

- Server slow to start / timeouts in tests
  - Start the server manually (`npx opencode serve`) and confirm readiness before running tests.
  - Increase Vitest/Jest test timeout or add a short `wait-for` script in CI to poll the OpenCode HTTP endpoint before running tests.

- Ask responses failing (SDK `ask` call throws)
  - Check server logs for the OpenCode server (stdout/stderr from `npx opencode serve`).
  - Ensure agent ID mappings exist in `.opencode/agent_map.yaml` and the server recognizes the agent id used.

## Acceptance criteria (short checklist for docs author / reviewer)

- The doc includes:
  - Summary and motivation.
  - CLI usage examples matching repository semantics (prompt arg, `-`, `--agent`, `--json`).
  - Precise runtime behavior: server reachability check, lazy start via SDK, waiting/logging behavior, and safe fallback behavior.
  - Configuration reference with `.opencode/server.yaml` snippet and environment variable overrides.
  - Agent name → ID mapping example and recommended file path (`.opencode/agent_map.yaml`).
  - Runnable E2E instructions with explicit `npm`/`npx` commands and how to run tests (`OPENCODE_E2E=1 OPENCODE_ENABLED=1 npm test -- -t "ask.e2e"`).
  - Security notes, troubleshooting, and a short acceptance checklist.

---

PR-ready changelog paragraph

- Add developer documentation for the new `waif ask` command, including usage examples, runtime behavior with lazy OpenCode integration, configuration and agent-mapping guidance, and end-to-end testing instructions. Reviewers should verify that the examples match the CLI flags and environment variables, that the `.opencode/server.yaml` snippet reflects the intended default enablement (`enable: true`), and that the E2E steps run the real OpenCode server and `OPENCODE_E2E=1 npm test -- -t "ask.e2e"` successfully in their environment.

Files reviewers should check (concise)

- src/commands/ask.ts
- src/lib/opencode.ts
- .opencode/server.yaml
- .opencode/agent/* (existing agent docs)
- (recommended) .opencode/agent_map.yaml
