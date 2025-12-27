import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';

let client: any | undefined;

export const DEFAULT_OPENCODE_LOG = '.waif/opencode_events.jsonl';

export interface OpencodeEvent {
  type: string;
  payload: any;
  ts?: string;
}

export interface OpencodeEventSource {
  on(event: string, handler: (payload: any) => void): void;
  off?(event: string, handler: (payload: any) => void): void;
}

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
  const host = process.env.OPENCODE_HOST || serverCfg.host || '127.0.0.1';
  const port = Number(process.env.OPENCODE_PORT || serverCfg.port || 4096);
  const defaultAgent = process.env.OPENCODE_DEFAULT_AGENT || serverCfg.defaultAgent || 'map';
  const defaultProvider = process.env.OPENCODE_PROVIDER || serverCfg.provider || 'github-copilot';
  const defaultModel = process.env.OPENCODE_MODEL || serverCfg.model || 'gpt-5-mini';

  const running = await checkPort(host, port, 300);

  try {
    const mod = await import('@opencode-ai/sdk');
    const createOpencode = mod?.createOpencode ?? mod?.default?.createOpencode;
    const createOpencodeClient = mod?.createOpencodeClient ?? mod?.default?.createOpencodeClient;

    let sdkClient: any | undefined;

    if (!running) {
      // start both server and client
      if (typeof createOpencode === 'function') {
        const timeoutMs = Number(process.env.OPENCODE_STARTUP_TIMEOUT || 5000);
        const inst = await createOpencode({ hostname: host, port, timeout: timeoutMs });
        sdkClient = inst?.client ?? inst;
      }
    } else {
      // connect to existing server as client only
      if (typeof createOpencodeClient === 'function') {
        sdkClient = await createOpencodeClient({ baseUrl: `http://${host}:${port}` });
      }
    }

    if (!sdkClient) {
      throw new Error('Failed to create OpenCode client');
    }

    // attempt to list agents and write cache
    try {
      if (sdkClient.app && typeof sdkClient.app.agents === 'function') {
        const agentsRes = await sdkClient.app.agents();
        const agents = Array.isArray(agentsRes?.data) ? agentsRes.data : agentsRes;
        if (Array.isArray(agents)) {
          const outLines: string[] = [];
          for (const a of agents) {
            const name = (a?.name || a?.title || a?.id || '').toString();
            const id = (a?.id || name).toString();
            if (name) outLines.push(`${name}: ${id}`);
          }
          if (outLines.length > 0) {
            const { writeFileSync: wfs, mkdirSync: mds } = await import('fs');
            const { dirname: dn } = await import('path');
            const target = resolve('.opencode/agent_map.yaml');
            mds(dn(target), { recursive: true });
            wfs(target, outLines.join('\n') + '\n', 'utf8');
          }
        }
      }
    } catch (e) {
      // ignore agent listing errors
    }

    client = {
      ask: async (agent: string, prompt: string) => {
        // Map agent name -> id with fallbacks
        const map = loadAgentMap();
        const requested = agent || defaultAgent;
        const mapped = map[requested] || requested || defaultAgent;

        // Preferred path: start a session and send a prompt
        if (sdkClient.session && typeof sdkClient.session.create === 'function' && typeof sdkClient.session.prompt === 'function') {
          const session = await sdkClient.session.create({});
          const sessionID = session?.data?.id || session?.id;
          if (!sessionID) throw new Error('Failed to create OpenCode session');

          const res = await sdkClient.session.prompt({
            path: { id: sessionID },
            body: {
              agent: mapped,
              model: { providerID: defaultProvider, modelID: defaultModel },
              parts: [{ type: 'text', text: prompt }],
            },
          });

          // Try to read assistant text from the created message
          const message = res?.data?.info;
          const parts = res?.data?.parts;
          const textPart = Array.isArray(parts) ? parts.find((p: any) => p?.type === 'text') : undefined;
          if (textPart?.text) return { markdown: String(textPart.text) };

          if (typeof message?.content === 'string') return { markdown: message.content };

          if (message?.error?.data?.message) {
            return { markdown: `OpenCode error: ${message.error.data.message}` };
          }

          // Fallback: fetch messages for the session and pick last assistant text part
          try {
            const msgs = await sdkClient.session.messages({ path: { id: sessionID }, query: { limit: 5 } });
            const list = Array.isArray(msgs?.data) ? msgs.data : [];
            for (let i = list.length - 1; i >= 0; i -= 1) {
              const m = list[i];
              if (m?.info?.role === 'assistant' && Array.isArray(m?.parts)) {
                const tp = m.parts.find((p: any) => p?.type === 'text' && p?.text);
                if (tp) return { markdown: String(tp.text) };
              }
            }
          } catch (e) {
            // ignore fetch errors
          }

          return { markdown: JSON.stringify(res ?? {}) };
        }

        throw new Error('OpenCode client has no supported ask method');
      },
      _sdk: sdkClient,
      _defaultAgent: defaultAgent,
    };

    // ensure agent_map exists (create empty cache if missing)
    try {
      const { writeFileSync: wfs, existsSync, mkdirSync: mds } = await import('fs');
      const target = resolve('.opencode/agent_map.yaml');
      if (!existsSync(target)) {
        mds(resolve('.opencode'), { recursive: true });
        wfs(target, '# Auto-generated agent map\n', 'utf8');
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

function getEventSourceFromClient(cl: any): OpencodeEventSource | undefined {
  if (!cl) return undefined;
  if (cl.events && typeof cl.events.on === 'function') return cl.events as OpencodeEventSource;
  if (cl._sdk && cl._sdk.events && typeof cl._sdk.events.on === 'function') return cl._sdk.events as OpencodeEventSource;
  return undefined;
}

export async function subscribeToOpencodeEvents(
  eventTypes: string[],
  handler: (event: OpencodeEvent) => void,
  options?: { source?: OpencodeEventSource },
): Promise<{ unsubscribe: () => void } | undefined> {
  const source = options?.source || getEventSourceFromClient(await ensureClient());
  if (!source || typeof source.on !== 'function') return undefined;

  const listeners: Array<{ type: string; fn: (payload: any) => void }> = [];
  for (const type of eventTypes) {
    const fn = (payload: any) => handler({ type, payload, ts: new Date().toISOString() });
    source.on(type, fn);
    listeners.push({ type, fn });
  }

  return {
    unsubscribe: () => {
      if (!source.off) return;
      for (const { type, fn } of listeners) {
        try {
          source.off(type, fn);
        } catch (e) {
          // ignore detach errors
        }
      }
    },
  };
}

function truncate(text: string, max = 80): string {
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

export function formatOpencodeEvent(event: OpencodeEvent): string {
  const payload = event.payload || {};
  const agent = payload.agent?.name || payload.agent?.id || payload.agent || payload.agentName || 'unknown';
  const messageText =
    (payload.message && (payload.message.content || payload.message.text)) || payload.text || payload.content || payload.summary;
  const msgPart = messageText ? ` message="${truncate(String(messageText))}"` : '';
  return `[opencode] ${event.type} agent=${agent}${msgPart}`;
}

export function appendOpencodeEventLog(logPath: string, event: OpencodeEvent): void {
  const abs = resolve(logPath);
  mkdirSync(dirname(abs), { recursive: true });
  const record = { ...event, ts: event.ts || new Date().toISOString() };
  writeFileSync(abs, `${JSON.stringify(record)}\n`, { flag: 'a' });
}

export function getSampleOpencodeEvents(): OpencodeEvent[] {
  return [
    { type: 'agent.started', payload: { agent: { name: 'map' } } },
    { type: 'message.returned', payload: { agent: { name: 'forge' }, message: { content: 'finished parsing request' } } },
    { type: 'agent.stopped', payload: { agent: { name: 'ship' }, reason: 'complete' } },
  ];
}
