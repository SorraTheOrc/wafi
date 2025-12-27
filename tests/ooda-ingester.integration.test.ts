import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { runIngester } from '../src/lib/ooda-ingester.js';

function tmpFile(prefix: string) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('ooda ingester integration with mock NDJSON', () => {
  let tempDir: string;
  let mockFile: string;
  let historyFile: string;

  beforeEach(() => {
    tempDir = tmpFile('waif-ooda-');
    mockFile = path.join(tempDir, 'events.jsonl');
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
    const lines = [
      JSON.stringify({ type: 'agent.started', payload: { agent: { name: 'map' }, token: 'abc', timestamp: '2024-01-01T00:00:00Z' } }),
      JSON.stringify({ type: 'message.returned', payload: { agent: { name: 'forge' }, message: { content: 'done' }, secret: 'x' } }),
      'invalid json',
    ];
    fs.writeFileSync(mockFile, `${lines.join('\n')}\n`, 'utf8');

    await runIngester({ mockPath: mockFile, once: false, logPath: historyFile });

    const data = fs.readFileSync(historyFile, 'utf8').trim().split(/\r?\n/);
    expect(data.length).toBe(2);

    const parsed = data.map((l) => JSON.parse(l));
    expect(parsed[0].agent).toBe('map');
    expect(parsed[0].event).toBe('agent.started');
    expect(parsed[0].meta.token).toBe('[REDACTED]');
    expect(parsed[1].agent).toBe('forge');
    expect(parsed[1].message).toBe('done');
    expect(parsed[1].meta.secret).toBe('[REDACTED]');
  });
});
