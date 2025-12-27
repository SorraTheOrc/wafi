import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createOodaCommand } from '../src/commands/ooda.js';
import { OODA_STATUS_LOG } from '../src/lib/ooda-ingester.js';

describe('ooda CLI (opencode-only)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls runIngester with defaults', async () => {
    const runSpy = vi.fn().mockResolvedValue(undefined);
    const cmd = createOodaCommand({ runIngester: runSpy, isOpencodeEnabled: () => true });
    await cmd.parseAsync(['node', 'ooda'], { from: 'user' });
    expect(runSpy).toHaveBeenCalledWith({ once: false, logPath: OODA_STATUS_LOG, debug: false, source: undefined, log: true });
  });

  it('forwards --once and --log to ingester', async () => {
    const runSpy = vi.fn().mockResolvedValue(undefined);
    const cmd = createOodaCommand({ runIngester: runSpy, isOpencodeEnabled: () => true });
    await cmd.parseAsync(['node', 'ooda', '--once', '--log', './tmp/test.jsonl'], { from: 'user' });
    expect(runSpy).toHaveBeenCalledWith({ once: true, logPath: './tmp/test.jsonl', debug: false, source: undefined, log: true });
  });

  it('uses sample source when --sample provided', async () => {
    const runSpy = vi.fn().mockResolvedValue(undefined);
    const sampleSource = { subscribe: vi.fn() };
    const cmd = createOodaCommand({ runIngester: runSpy, isOpencodeEnabled: () => true, sampleSourceFactory: () => sampleSource });
    await cmd.parseAsync(['node', 'ooda', '--sample', '--once'], { from: 'user' });
    expect(runSpy).toHaveBeenCalledWith({
      once: true,
      logPath: OODA_STATUS_LOG,
      debug: false,
      source: sampleSource,
      log: true,
    });
  });
});
