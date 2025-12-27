import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createOpencodeSdkMock } from './mocks/opencode-sdk-mock.js';
import { runIngester } from '../src/lib/ooda-ingester.js';

function tmpFile(prefix: string) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('ooda ingester integration with mock NDJSON', () => {
  let tempDir: string;
  let historyFile: string;

  beforeEach(() => {
    tempDir = tmpFile('waif-ooda-');
    historyFile = path.join(tempDir, 'ooda_status.jsonl');
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {
      // ignore
    }
  });

  it('writes redacted events to history file', async () => {
    const mock = createOpencodeSdkMock();

    await runIngester({ source: mock._sdk.event, once: true, logPath: historyFile });

    const data = fs.readFileSync(historyFile, 'utf8').trim().split(/\r?\n/);
    expect(data.length).toBe(6);

    const parsed = data.map((l) => JSON.parse(l));
    expect(parsed[0].agent).toBe('map');
    expect(parsed[0].event).toBe('agent.started');
    expect(parsed[0].meta.token).toBe('[REDACTED]');
    expect(parsed[0].meta.secret).toBe('[REDACTED]');
    expect(parsed[1].agent).toBe('forge');
    expect(parsed[1].event).toBe('message.returned');
    expect(parsed[1].meta.secret).toBe('[REDACTED]');
    expect(parsed[2].event).toBe('agent.stopped');
    // legacy aliases still map
    expect(parsed.map((p) => p.event)).toContain('agent.started');
    expect(parsed.map((p) => p.event)).toContain('message.returned');
    expect(parsed.map((p) => p.event)).toContain('agent.stopped');
  });
});
