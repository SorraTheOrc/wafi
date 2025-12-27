import { describe, it, expect, vi, afterEach } from 'vitest';
import { createOodaCommand } from '../src/commands/ooda.js';

describe('ooda CLI OpenCode selection', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls runOpencodeIngestor with once=false, sample=false when enabled and no flags', async () => {
    const runOpencode = vi.fn().mockResolvedValue(undefined);
    const cmd = createOodaCommand({ runOpencode, isOpencodeEnabled: () => true });

    await cmd.parseAsync(['node', 'ooda', 'ooda']);

    expect(runOpencode).toHaveBeenCalled();
    const call = runOpencode.mock.calls[0][0] || {};
    expect(call.once).toBe(false);
    expect(call.sample).toBe(false);
    // when no --log provided, logPath should default to DEFAULT_OPENCODE_LOG inside module behavior; we only assert call shape here
  });

  it('forwards --once and --sample to runOpencodeIngestor', async () => {
    const runOpencode = vi.fn().mockResolvedValue(undefined);
    const cmd = createOodaCommand({ runOpencode, isOpencodeEnabled: () => true });

    await cmd.parseAsync(['node', 'ooda', 'ooda', '--once', '--sample']);

    expect(runOpencode).toHaveBeenCalled();
    const call = runOpencode.mock.calls[0][0] || {};
    expect(call.once).toBe(true);
    expect(call.sample).toBe(true);
  });
});
