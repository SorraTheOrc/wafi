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
  const net = await import('node:net');
  return new Promise((resolveCheck) => {
    const socket = new (net as any).Socket();
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
    // Note: connect signature differs between node versions; use host/port
    try { socket.connect(port, host); } catch (e) { resolveCheck(false); }
  });
}
export async function ensureClient(): Promise<any | undefined> {
  if (client) return client;
  if (!isEnabled()) return undefined;

  // Read config
  const cfg = readYaml(resolve('.opencode/server.yaml')) || {};
  const serverCfg = cfg.server || {};
  const host = process.env.OPENCODE_HOST || serverCfg.host || 'localhost';
  const port = Number(process.env.OPENCODE_PORT || serverCfg.port || 4096);

  const running = await checkPort(host, port, 300);

  try {
    const mod = await import('@opencode-ai/sdk');
    const createOpencode = mod?.createOpencode ?? mod?.default?.createOpencode ?? mod?.createOpencodeClient;
    const createOpencodeClient = mod?.createOpencodeClient ?? mod?.createOpencodeClient;

    let sdkClient: any | undefined;

    if (!running) {
      // start both server and client
      if (typeof createOpencode === 'function') {
        const timeoutMs = Number(process.env.OPENCODE_STARTUP_TIMEOUT || 5000);
        const inst = await createOpencode({ hostname: host, port, timeout: timeoutMs });
        sdkClient = inst?.client ?? inst?.client ?? inst;
      }
    } else {
      // connect to existing server as client only
      if (typeof createOpencodeClient === 'function') {
        sdkClient = await createOpencodeClient({ baseUrl: `http://${host}:${port}` });
      } else if (typeof createOpencode === 'function') {
        const inst = await createOpencode({ hostname: host, port, timeout: 0 });
        sdkClient = inst?.client ?? inst;
      }
    }

    if (!sdkClient) {
      throw new Error('Failed to create OpenCode client');
    }

    // attempt to list agents and write cache
    try {
      if (sdkClient.app && typeof sdkClient.app.agents === 'function') {
        const agents = await sdkClient.app.agents();
        if (Array.isArray(agents)) {
          const outLines: string[] = [];
          for (const a of agents) {
            const name = (a?.name || a?.title || a?.id || '').toString();
            const id = (a?.id || name).toString();
            if (name) outLines.push(`${name}: ${id}`);
          }
          if (outLines.length > 0) {
            const { writeFileSync, mkdirSync } = await import('fs');
            const { dirname } = await import('path');
            const target = resolve('.opencode/agent_map.yaml');
            mkdirSync(dirname(target), { recursive: true });
            writeFileSync(target, outLines.join('\n') + '\n', 'utf8');
          }
        }
      }
    } catch (e) {
      // ignore agent listing errors
    }

    client = {
      ask: async (agent: string, prompt: string) => {
        // Map agent name -> id
        const map = loadAgentMap();
        const mapped = map[agent] || agent;

        // Prefer session-based prompt
        try {
          if (sdkClient.session && typeof sdkClient.session.create === 'function') {
            const session = await sdkClient.session.create({ body: { title: `waif ask (${mapped})` } });
            const res = await sdkClient.session.prompt({ path: { id: session.id }, body: { parts: [{ type: 'text', text: prompt }] } });
            // Attempt to extract assistant parts text
            const parts = (res?.parts) || (res?.info?.parts) || res?.parts || [];
            const texts: string[] = [];
            for (const p of parts) {
              if (typeof p === 'string') texts.push(p);
              else if (p?.type === 'text' && typeof p?.text === 'string') texts.push(p.text);
              else if (p?.content && typeof p.content === 'string') texts.push(p.content);
            }
            const joined = texts.join('\n\n') || JSON.stringify(res);
            return { markdown: joined };
          }
        } catch (e) {
          // continue to other methods
        }

        // Fallback: try client.app.prompt or client.session.command
        try {
          if (sdkClient.app && typeof sdkClient.app.prompt === 'function') {
            const out = await sdkClient.app.prompt({ body: { text: prompt } });
            return { markdown: out?.text ?? String(out) };
          }
        } catch (e) {}

        throw new Error('OpenCode client has no supported ask method');
      },
      _sdk: sdkClient,
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
    process.stderr.write(`[warn] OpenCode SDK unavailable or failed: ${e instanceof Error ? e.message : String(e)}\n`);
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
