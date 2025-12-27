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
  subscribe: (options: any, handler: (payload: any) => void) => Promise<any> | any;
  unsubscribe?: () => void;
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

export async function ensureClient(): Promise<any> {
  if (client) return client;

  // Read config (host/port only; do not auto-start server)
  const cfg = readYaml(resolve('.opencode/server.yaml')) || {};
  const serverCfg = cfg.server || {};
  const host = process.env.OPENCODE_HOST || serverCfg.host || '127.0.0.1';
  const port = Number(process.env.OPENCODE_PORT || serverCfg.port || 4096);
  const defaultAgent = process.env.OPENCODE_DEFAULT_AGENT || serverCfg.defaultAgent || 'map';
  const defaultProvider = process.env.OPENCODE_PROVIDER || serverCfg.provider || 'github-copilot';
  const defaultModel = process.env.OPENCODE_MODEL || serverCfg.model || 'gpt-5-mini';

  let mod: any;
  try {
    mod = await import('@opencode-ai/sdk');
  } catch (e: any) {
    throw new Error(`OpenCode SDK not available: ${e?.message || e}`);
  }

  const createOpencodeClient = mod?.createOpencodeClient ?? mod?.default?.createOpencodeClient;
  if (typeof createOpencodeClient !== 'function') {
    throw new Error('OpenCode SDK client factory not available');
  }

  const sdkClient = await createOpencodeClient({ baseUrl: `http://${host}:${port}` });
  if (!sdkClient) {
    throw new Error('Failed to create OpenCode client');
  }

  // attempt to list agents and write cache (best-effort)
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

        const message = res?.data?.info;
        const parts = res?.data?.parts;
        const textPart = Array.isArray(parts) ? parts.find((p: any) => p?.type === 'text') : undefined;
        if (textPart?.text) return { markdown: String(textPart.text) };

        if (typeof message?.content === 'string') return { markdown: message.content };

        if (message?.error?.data?.message) {
          return { markdown: `OpenCode error: ${message.error.data.message}` };
        }

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

export async function subscribeToOpencodeEvents(
  eventTypes: string[],
  handler: (event: OpencodeEvent) => void,
  options?: { source?: OpencodeEventSource },
): Promise<{ unsubscribe: () => void }> {
  const clientObj = await ensureClient();
  const source = options?.source ?? clientObj?._sdk?.event ?? clientObj?._sdk?.events ?? clientObj?.event ?? clientObj?.events;

  if (!source || typeof source.subscribe !== 'function') {
    throw new Error('OpenCode SDK event.subscribe API is required for ingestion');
  }

  const subRes = await source.subscribe({ filter: { type: eventTypes } }, (payload: any) => {
    const type = payload?.type || 'unknown';
    handler({ type, payload, ts: new Date().toISOString() });
  });

  let unsubCalled = false;
  const unsubscribe = () => {
    if (unsubCalled) return;
    unsubCalled = true;
    try {
      if (typeof subRes === 'function') {
        subRes();
        return;
      }
      if (subRes && typeof subRes.unsubscribe === 'function') {
        subRes.unsubscribe();
        return;
      }
      if (subRes && typeof subRes.close === 'function') {
        subRes.close();
        return;
      }
      if (typeof source.unsubscribe === 'function') {
        source.unsubscribe();
      }
    } catch (e) {
      // swallow unsubscribe errors to keep cleanup best-effort
    }
  };

  return { unsubscribe };
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

