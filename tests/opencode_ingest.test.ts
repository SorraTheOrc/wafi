import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { runOpencodeIngestor } from '../src/commands/ooda.js';
import { OpencodeEvent } from '../src/lib/opencode.js';

class MockSource {
  listeners: Record<string, Array<(p: any) => void>> = {};
  on(event: string, fn: (p: any) => void) {
    (this.listeners[event] ||= []).push(fn);
  }
  off(event: string, fn: (p: any) => void) {
    this.listeners[event] = (this.listeners[event] || []).filter((f) => f !== fn);
  }
  emit(event: string, payload: any) {
    (this.listeners[event] || []).forEach((fn) => fn(payload));
  }
}

function captureStdout() {
  const writes: string[] = [];
  const orig = process.stdout.write;
  // @ts-ignore
  process.stdout.write = (chunk: any, ...args: any[]) => {
    writes.push(String(chunk));
    return true;
  };
  return () => {
    // @ts-ignore
    process.stdout.write = orig;
    return writes.join('');
  };
}

describe('opencode ingester', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waif-test-'));
  });
  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) {}
  });

  it('logs formatted events to stdout', async () => {
    const stopCapture = captureStdout();
    const source = new MockSource();
    const unsub = await runOpencodeIngestor({ source, once: false, sample: false, logPath: undefined });

    // emit events
    source.emit('agent.started', { agent: { name: 'map' } });
    source.emit('message.returned', { agent: { name: 'forge' }, message: { content: 'ok' } });
    source.emit('agent.stopped', { agent: { name: 'ship' }, reason: 'done' });

    // give microtask time
    await new Promise((r) => setTimeout(r, 20));

    const out = stopCapture();
    expect(out).toContain('agent.started');
    expect(out).toContain('agent=map');
    expect(out).toContain('message.returned');
    expect(out).toContain('agent=forge');

    if (typeof unsub === 'function') unsub();
  });

  it('writes newline-delimited JSON to --log path when provided (once+sample)', async () => {
    const logPath = path.join(tmpDir, 'oc_events.jsonl');
    // run once with sample events
    await runOpencodeIngestor({ source: undefined as any, once: true, sample: true, logPath });

    const data = fs.readFileSync(logPath, 'utf8').trim().split(/\r?\n/).filter(Boolean);
    expect(data.length).toBeGreaterThanOrEqual(3);
    const parsed = data.map((l) => JSON.parse(l));
    const types = parsed.map((p) => p.type);
    expect(types).toContain('agent.started');
    expect(types).toContain('message.returned');
    expect(types).toContain('agent.stopped');
  });
});
