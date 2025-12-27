Summary
-------
Review opencode-beads and extract reusable patterns for WAIFOpenCode integration. Prototype a minimal "priming" approach and capture decisions.

Key takeaway / direction change
------------------------------
Instead of defaulting to automatic OpenCode-session context injection ("bd prime") as the primary approach, prefer an **explicit priming command** design:

- Provide a WAIF command like `waif prime <beads-id>` (or an OpenCode command wrapper like `/waif-prime <beads-id>`), which generates a context pack for the specified Beads issue.
- Allow different agents/roles to choose different bootstrap profiles (e.g., implementer vs reviewer) by varying the context pack.
- Treat automatic session context injection as an optional reliability layer (e.g., recovery after compaction), not the default mechanism.

This is cleaner, less error-prone, and reduces the risk of injecting the wrong issue context.

What opencode-beads suggests (reusable ideas)
--------------------------------------------
- "bd-prime" pattern: preload session context to reduce repeated lookups and recover after compaction.
- /bd-* command surface mirroring the bd CLI for agent convenience.
- Concept of a beads-task-agent (autonomous completion)  promising, but safety-sensitive.

WAIF-specific requirements / changes needed
------------------------------------------
- Privacy/scope: prime content must be scoped to the active session + issue, with expiry to avoid cross-session leakage.
- Permissions: any write operations (create/update/close) must require explicit policy checks and likely human-in-the-loop confirmation.
- Auditability: actions triggered from OpenCode must be logged and linked to both the Beads issue and the OpenCode event/session.

Prototype produced (POC)
-----------------------
PR #68: https://github.com/SorraTheOrc/waif/pull/68

- `scripts/wf-gn7.1-inject.js`: minimal proof-of-concept script that POSTs a context payload to an OpenCode session endpoint (non-destructive). This demonstrates feasibility of the "inject payload" mechanism if we later need it for recovery.
- `history/wf-gn7.1-spike.md`: earlier decision record (content migrated here per request).

How to test
-----------
Option A: with a real OpenCode runtime
1) Checkout branch:
   - `git fetch origin`
   - `git checkout feature/wf-gn7.1.1-spike`

2) Set env vars:
   - `OPENCODE_URL` (base URL)
   - `OPENCODE_API_KEY` (token)

3) Run:
   - `node scripts/wf-gn7.1-inject.js --session test-session-123 --context '{"beads":"example-prime"}'`

Expected output: "Context injected successfully" or a clear error message.

Option B: without OpenCode (local mock)
1) Start mock server:
   - `node -e "const http=require('http');http.createServer((req,res)=>{let b='';req.on('data',c=>b+=c);req.on('end',()=>{console.log('RECEIVED',req.method,req.url,b);res.writeHead(200);res.end('ok');});}).listen(8080);console.log('listening 8080');"`

2) Run injector against it:
   - `OPENCODE_URL="http://localhost:8080" OPENCODE_API_KEY=dummy node scripts/wf-gn7.1-inject.js --session test-session-123 --context '{"beads":"example-prime"}'`

Follow-up work recommended (create separately)
---------------------------------------------
- Implement `waif prime <beads-id>` context pack generator (explicit priming).
- Add OpenCode wrapper command `/waif-prime <beads-id>` that calls the same generator.
- Add automatic re-prime on compaction/session start only when bd-id is unambiguous.
- Evaluate /bd-* command mirroring for read-only ops first.
- Safety review for any autonomous task-agent: RBAC, rate limits, audit logs, human-in-the-loop.

Files touched in this spike
---------------------------
- history/wf-gn7.1-spike.md (created earlier)
- scripts/wf-gn7.1-inject.js (created earlier)
- PR: https://github.com/SorraTheOrc/waif/pull/68
