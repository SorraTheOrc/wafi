import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createOodaCommand } from '../src/commands/ooda.js';

describe('ooda CLI sample flag', () => {
  beforeEach(() => {
    // nothing
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses sample source when --opencode-sample', async () => {
    const runIngester = vi.fn().mockResolvedValue(undefined);
    const sampleSource = { subscribe: vi.fn() };
    const cmd = createOodaCommand({ runIngester, isOpencodeEnabled: () => true, sampleSourceFactory: () => sampleSource });
    await cmd.parse(['node', 'ooda', '--opencode-sample', '--once'], { from: 'user' });
    expect(runIngester).toHaveBeenCalledWith({ once: true, logPath: 'history/ooda_status.jsonl', debug: false, source: sampleSource, log: true });
  });
});
