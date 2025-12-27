import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { runIngester } from '../src/lib/ooda-ingester.js';
import { createOpencodeSdkMock } from './mocks/opencode-sdk-mock.js';

function captureStdout() {
  const writes: string[] = [];
  const orig = process.stdout.write;
  // @ts-ignore
  process.stdout.write = (chunk: any) => {
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

  it('logs mapped events to stdout', async () => {
    const stopCapture = captureStdout();
    const mock = createOpencodeSdkMock();
    const unsub = await runIngester({ source: mock._sdk.event, once: true, log: false });

    // give microtask time for mock events
    await new Promise((r) => setTimeout(r, 20));

    const out = stopCapture();
    expect(out).toContain('agent.started');
    expect(out).toContain('"agent":"map"');
    expect(out).toContain('message.returned');
    expect(out).toContain('"agent":"forge"');
    // ensure canonical session creates map to started
    expect(out).toContain('"originalType":"session.created"');

    if (typeof unsub === 'function') unsub();
  });

  it('writes newline-delimited JSON to --log path when provided', async () => {
    const logPath = path.join(tmpDir, 'oc_events.jsonl');
    const mock = createOpencodeSdkMock();
    await runIngester({ source: mock._sdk.event, once: true, logPath });

    const data = fs.readFileSync(logPath, 'utf8').trim().split(/\r?\n/).filter(Boolean);
    expect(data.length).toBeGreaterThanOrEqual(6);
    const parsed = data.map((l) => JSON.parse(l));
    const types = parsed.map((p) => p.event);
    expect(types).toContain('agent.started');
    expect(types).toContain('message.returned');
    expect(types).toContain('agent.stopped');
    // ensure canonical forms are mapped too
    expect(types.filter((t) => t === 'agent.started').length).toBeGreaterThanOrEqual(2);
    expect(types.filter((t) => t === 'agent.stopped').length).toBeGreaterThanOrEqual(2);
    expect(types.filter((t) => t === 'message.returned').length).toBeGreaterThanOrEqual(2);
  });
});
