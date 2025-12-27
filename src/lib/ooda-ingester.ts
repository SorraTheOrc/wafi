import { dirname, resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { logStdout } from './io.js';
import { subscribeToOpencodeEvents } from './opencode.js';

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
  const originalType = event?.originalType;

  const record: OodaEventRecord = {
    agent: agent || 'unknown',
    event: event?.type || payload?.type || 'unknown',
    timestamp,
    meta: redactSensitive(payload),
  };

  if (originalType && originalType !== record.event) {
    record.meta = { ...record.meta, originalType };
  }

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
  source?: any;
  once?: boolean;
  logPath?: string;
  events?: string[];
  log?: boolean;
}

export async function runIngester(options: IngesterOptions = {}) {
  const {
    source,
    once = false,
    logPath,
    events = ['agent.started', 'agent.stopped', 'message.returned', 'session.created', 'session.updated', 'session.status', 'session.idle', 'session.deleted', 'message.updated', 'message.removed', 'message.part.updated', 'message.part.removed'],
    log = true,
  } = options;
  const targetLog = logPath || OODA_STATUS_LOG;
  const shouldLog = log !== false;

  let wroteFirst = false;
  const handleEvent = (ev: any) => {
    const mapped = mapToInternalEvent(ev);
    if (shouldLog) {
      appendRecord(targetLog, mapped);
    } else {
      logStdout(stableStringify(mapped));
    }
    wroteFirst = true;
  };

  const subscription = await subscribeToOpencodeEvents(
    events,
    (ev) => {
      handleEvent(ev);
      if (once && wroteFirst) {
        try {
          subscription?.unsubscribe();
        } catch (e) {
          // ignore
        }
      }
    },
    { source },
  );

  if (!subscription || typeof subscription.unsubscribe !== 'function') {
    throw new Error('Failed to subscribe to OpenCode events');
  }

  const unsubscribeRef: { unsubscribe: () => void } = { unsubscribe: subscription.unsubscribe };

  if (!once) {
    // log debug so users know we're waiting for events
    try { process.stderr.write('[debug] ooda-ingester: subscribed and awaiting events (CTRL-C to exit)\n'); } catch (e) {}

    // Keep Node's event loop alive using a long-interval timer so the process
    // doesn't exit immediately when there are no other active handles.
    const keepAlive: ReturnType<typeof setInterval> | undefined = setInterval(() => {}, 1_000_000_000);

    // Also keep stdin open for compatibility with shells/pipes that expect it.
    try { if (process.stdin && typeof process.stdin.resume === 'function') process.stdin.resume(); } catch (e) {}

    await new Promise<void>((resolve) => {
      const originalUnsubscribe = unsubscribeRef.unsubscribe;
      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        try { if (keepAlive) clearInterval(keepAlive); } catch (e) {}
        try { originalUnsubscribe && originalUnsubscribe(); } catch (e) {}
        try { if (process.stdin && typeof process.stdin.pause === 'function') process.stdin.pause(); } catch (e) {}
        // remove handlers to avoid leaks
        process.off('SIGINT', cleanup);
        process.off('SIGTERM', cleanup);
        resolve();
      };

      // ensure unsubscribe from caller also triggers cleanup
      unsubscribeRef.unsubscribe = () => cleanup();

      process.on('SIGINT', cleanup);
      process.on('SIGTERM', cleanup);
      // promise remains pending until a signal triggers cleanup or unsubscribe is called
    });

    return undefined;
  }

  return unsubscribeRef.unsubscribe;

}
