import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { runOpencodeIngestor } from '../src/commands/ooda.js';
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

  it('logs formatted events to stdout', async () => {
    const stopCapture = captureStdout();
    const mock = createOpencodeSdkMock();
    const unsub = await runOpencodeIngestor({ source: mock._sdk.event, once: false, sample: false, log: false });

    // give microtask time for mock events
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
    // run once with sample events via mock source
    const mock = createOpencodeSdkMock();
    await runOpencodeIngestor({ source: mock._sdk.event, once: false, sample: true, logPath });

    const data = fs.readFileSync(logPath, 'utf8').trim().split(/\r?\n/).filter(Boolean);
    expect(data.length).toBeGreaterThanOrEqual(3);
    const parsed = data.map((l) => JSON.parse(l));
    const types = parsed.map((p) => p.type);
    expect(types).toContain('agent.started');
    expect(types).toContain('message.returned');
    expect(types).toContain('agent.stopped');
  });
});
