import { readFileSync } from 'fs';
import { resolve } from 'path';

let client: any | undefined;

function readYaml(path: string): any | undefined {
  try {
    // minimal YAML parsing without adding deps: only simple key: value and mappings
    const txt = readFileSync(path, 'utf8');
    const lines = txt.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const out: any = {};
    for (const line of lines) {
      if (line.includes(':')) {
        const [k, ...rest] = line.split(':');
        const v = rest.join(':').trim().replace(/^"|"$/g, '');
        out[k.trim()] = v;
      }
    }
    return out;
  } catch (e) {
    return undefined;
  }
}

export function isEnabled() {
  // Default: enabled unless explicitly disabled
  const env = process.env.OPENCODE_ENABLED;
  if (typeof env === 'string') {
    const v = env.toLowerCase();
    if (v === '0' || v === 'false') return false;
    return Boolean(v);
  }

  // fallback to config file
  const cfg = readYaml(resolve('.opencode/server.yaml'))?.server;
  if (cfg && typeof cfg.enable !== 'undefined') {
    return String(cfg.enable).toLowerCase() === 'true' || String(cfg.enable) === '1';
  }

  return true;
}

async function checkPort(host: string, port: number, timeout = 500): Promise<boolean> {
  return new Promise((resolveCheck) => {
    const net = require('net');
    const socket = new net.Socket();
    let done = false;
    socket.setTimeout(timeout);
    socket.on('connect', () => {
      done = true;
      socket.destroy();
      resolveCheck(true);
    });
    socket.on('error', () => {
      if (!done) {
        done = true;
        resolveCheck(false);
      }
    });
    socket.on('timeout', () => {
      if (!done) {
        done = true;
        resolveCheck(false);
      }
    });
    socket.connect(port, host);
  });
}

export async function ensureClient(): Promise<any | undefined> {
  if (client) return client;
  if (!isEnabled()) return undefined;

  // Read config
  const cfg = readYaml(resolve('.opencode/server.yaml')) || {};
  const serverCfg = cfg.server || {};
  const host = process.env.OPENCODE_HOST || serverCfg.host || 'localhost';
  const port = Number(process.env.OPENCODE_PORT || serverCfg.port || 8080);

  const running = await checkPort(host, port, 300);

  try {
    const mod = await import('@opencode-ai/sdk');
    const OpenCode = mod?.OpenCode ?? mod?.default ?? mod;
    const oc = new OpenCode({ host, port });

    if (!running) {
      // attempt to start server
      try {
        process.stderr.write('[debug] OpenCode: starting local server...\n');
        // oc.serve may return a promise or a server object
        if (typeof oc.serve === 'function') {
          await oc.serve({ port });
        }
        // wait for port to be available
        const start = Date.now();
        const timeoutMs = Number(process.env.OPENCODE_STARTUP_TIMEOUT || 5000);
        while (Date.now() - start < timeoutMs) {
          const ok = await checkPort(host, port, 200);
          if (ok) break;
          await new Promise((r) => setTimeout(r, 200));
        }
        process.stderr.write(`[debug] OpenCode: server listening at http://${host}:${port}\n`);

        // recreate agent_map cache after starting server
        try {
          const map = await oc.listAgents ? await oc.listAgents() : undefined;
          // if oc.listAgents returns mapping, write to .opencode/agent_map.yaml
          if (map && typeof map === 'object') {
            const outLines: string[] = [];
            for (const [k, v] of Object.entries(map)) {
              outLines.push(`${k}: ${v}`);
            }
            const { writeFileSync, mkdirSync } = await import('fs');
            const { dirname } = await import('path');
            const target = resolve('.opencode/agent_map.yaml');
            mkdirSync(dirname(target), { recursive: true });
            writeFileSync(target, outLines.join('\n') + '\n', 'utf8');
          }
        } catch (e) {
          // ignore errors in cache creation
        }
      } catch (e) {
        process.stderr.write(`[warn] OpenCode: failed to start local server: ${e instanceof Error ? e.message : String(e)}\n`);
      }
    }

    client = {
      ask: async (agent: string, prompt: string) => {
        if (typeof oc.ask === 'function') {
          const res = await oc.ask(agent, prompt);
          return { markdown: res?.markdown ?? String(res) };
        }
        throw new Error('OpenCode client has no ask method');
      },
      _oc: oc,
    };

    // ensure agent_map exists (create empty cache if missing)
    try {
      const { writeFileSync, existsSync, mkdirSync } = await import('fs');
      const target = resolve('.opencode/agent_map.yaml');
      if (!existsSync(target)) {
        mkdirSync(resolve('.opencode'), { recursive: true });
        writeFileSync(target, '# Auto-generated agent map\n', 'utf8');
      }
    } catch (e) {
      // ignore
    }

    return client;
  } catch (e) {
    process.stderr.write(`[warn] OpenCode SDK unavailable: ${e instanceof Error ? e.message : String(e)}\n`);
    return undefined;
  }
}

export function loadAgentMap(): Record<string, string> {
  try {
    const txt = readFileSync(resolve('.opencode/agent_map.yaml'), 'utf8');
    const lines = txt.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const map: Record<string, string> = {};
    for (const line of lines) {
      if (line.includes(':')) {
        const [k, ...rest] = line.split(':');
        map[k.trim()] = rest.join(':').trim();
      }
    }
    return map;
  } catch (e) {
    return {};
  }
}
