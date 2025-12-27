import { dirname, resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { logStdout } from './io.js';
import { getSampleOpencodeEvents, isEnabled, readMockEvents, subscribeToOpencodeEvents } from './opencode.js';

export const OODA_STATUS_LOG = 'history/ooda_status.jsonl';

export interface OodaEventRecord {
  agent: string;
  event: string;
  timestamp: string;
  message?: string;
  meta?: any;
}

const REDACT_KEYS = ['token', 'password', 'secret', 'pem', 'key'];

function shouldRedactKey(key: string): boolean {
  const lower = key.toLowerCase();
  return REDACT_KEYS.some((k) => lower.includes(k));
}

export function redactSensitive<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => redactSensitive(v)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const out: any = Array.isArray(value) ? [] : {};
    for (const [k, v] of Object.entries(value as any)) {
      if (shouldRedactKey(k)) {
        out[k] = '[REDACTED]';
        continue;
      }
      out[k] = redactSensitive(v);
    }
    return out as T;
  }
  return value;
}

function stableClone(value: any): any {
  if (Array.isArray(value)) return value.map((v) => stableClone(v));
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
    const out: any = {};
    for (const [k, v] of entries) {
      out[k] = stableClone(v);
    }
    return out;
  }
  return value;
}

export function stableStringify(value: any): string {
  return JSON.stringify(stableClone(value));
}

function extractMessage(payload: any): string | undefined {
  if (!payload) return undefined;
  const candidate =
    payload.message?.content || payload.message?.text || payload.text || payload.content || payload.summary || payload.message;
  if (candidate === undefined || candidate === null) return undefined;
  return typeof candidate === 'string' ? candidate : JSON.stringify(candidate);
}

export function mapToInternalEvent(event: any): OodaEventRecord {
  const payload = event?.payload ?? event ?? {};
  const agent =
    payload.agent?.name || payload.agent?.id || payload.agentName || payload.agent || payload.agent_id || 'unknown';
  const timestamp = event?.timestamp || event?.ts || payload.timestamp || payload.ts || new Date().toISOString();
  const message = extractMessage(payload);

  const record: OodaEventRecord = {
    agent: agent || 'unknown',
    event: event?.type || payload?.type || 'unknown',
    timestamp,
    meta: redactSensitive(payload),
  };

  if (message !== undefined) record.message = message;
  return redactSensitive(record);
}

function appendRecord(path: string, record: OodaEventRecord): void {
  const abs = resolve(path);
  mkdirSync(dirname(abs), { recursive: true });
  const line = stableStringify(record);
  writeFileSync(abs, `${line}\n`, { flag: 'a' });
  logStdout(line);
}

export interface IngesterOptions {
  mockPath?: string;
  once?: boolean;
  logPath?: string;
  events?: string[];
  sample?: boolean;
  source?: any;
  log?: boolean;
}

export async function runIngester(options: IngesterOptions = {}) {
  const {
    mockPath,
    once = false,
    logPath,
    events = ['agent.started', 'agent.stopped', 'message.returned'],
    sample = false,
    source,
    log = true,
  } = options;
  const targetLog = logPath || OODA_STATUS_LOG;
  const shouldLog = log !== false;

  const handleEvent = (ev: any) => {
    const mapped = mapToInternalEvent(ev);
    if (shouldLog) {
      appendRecord(targetLog, mapped);
    } else {
      logStdout(stableStringify(mapped));
    }
  };

  if (mockPath) {
    let processed = 0;
    for await (const ev of readMockEvents(mockPath)) {
      handleEvent(ev);
      processed += 1;
      if (once && processed > 0) break;
    }
    return;
  }

  if (sample) {
    for (const ev of getSampleOpencodeEvents()) {
      handleEvent(ev);
      if (once) break;
    }
    return;
  }

  if (!isEnabled()) return;

  let unsubscribe: (() => void) | undefined;
  const sub = await subscribeToOpencodeEvents(events, (ev) => {
    handleEvent(ev);
    if (once && unsubscribe) unsubscribe();
  }, { source });
  unsubscribe = sub?.unsubscribe;

  // If we received a subscription object, keep the process alive for continuous mode.
  if (unsubscribe && !once) {
    // log debug so users know we're waiting for events
    try { process.stderr.write('[debug] ooda-ingester: subscribed and awaiting events (CTRL-C to exit)\n'); } catch (e) {}

    // Wait until process receives termination signal or unsubscribe is called elsewhere.
    await new Promise<void>((resolve) => {
      const cleanup = () => {
        try { unsubscribe && unsubscribe(); } catch (e) {}
        resolve();
      };
      process.on('SIGINT', cleanup);
      process.on('SIGTERM', cleanup);
      // no-op: keep promise pending until signal triggers cleanup
    });

    return undefined;
  }

  return unsubscribe;
}
