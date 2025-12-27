import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createOodaCommand } from '../src/commands/ooda.js';
import * as opencodeLib from '../src/lib/opencode.js';
import { OODA_STATUS_LOG } from '../src/lib/ooda-ingester.js';

describe('ooda CLI selects opencode ingester by default when enabled', () => {
  let spy: any;
  beforeEach(() => {
    spy = vi.spyOn(opencodeLib, 'isEnabled').mockReturnValue(true);
  });
  afterEach(() => {
    spy.mockRestore();
    vi.restoreAllMocks();
  });

  it('calls runIngester with defaults', async () => {
    const runSpy = vi.fn().mockResolvedValue(undefined);
    const cmd = createOodaCommand({ runOpencode: runSpy, isOpencodeEnabled: () => true });
    await cmd.parse(['node', 'ooda'], { from: 'user' });
    expect(runSpy).toHaveBeenCalledWith({ once: false, sample: false, logPath: OODA_STATUS_LOG, mockPath: undefined });
  });

  it('forwards --once --sample --mock to ingester', async () => {
    const runSpy = vi.fn().mockResolvedValue(undefined);
    const cmd = createOodaCommand({ runOpencode: runSpy, isOpencodeEnabled: () => true });
    await cmd.parse(['node', 'ooda', '--once', '--sample', '--log', './tmp/test.jsonl', '--mock', './m.jsonl'], { from: 'user' });
    expect(runSpy).toHaveBeenCalledWith({ once: true, sample: true, logPath: './tmp/test.jsonl', mockPath: './m.jsonl' });
  });
});
