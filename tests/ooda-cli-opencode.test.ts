import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createOodaCommand } from '../src/commands/ooda.js';
import { OODA_STATUS_LOG } from '../src/lib/ooda-ingester.js';

describe('ooda CLI selects opencode ingester by default when enabled', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls runIngester with defaults', async () => {
    const runSpy = vi.fn().mockResolvedValue(undefined);
    const cmd = createOodaCommand({ runOpencode: runSpy, isOpencodeEnabled: () => true });
    await cmd.parse(['node', 'ooda'], { from: 'user' });
    expect(runSpy).toHaveBeenCalledWith({ once: false, logPath: OODA_STATUS_LOG });
  });

  it('forwards --once and --log to ingester', async () => {
    const runSpy = vi.fn().mockResolvedValue(undefined);
    const cmd = createOodaCommand({ runOpencode: runSpy, isOpencodeEnabled: () => true });
    await cmd.parse(['node', 'ooda', '--once', '--log', './tmp/test.jsonl'], { from: 'user' });
    expect(runSpy).toHaveBeenCalledWith({ once: true, logPath: './tmp/test.jsonl' });
  });
});
