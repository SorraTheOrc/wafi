import { describe, it, expect, vi, afterEach } from 'vitest';
import { createOodaCommand } from '../src/commands/ooda.js';

describe('ooda CLI probe selection', () => {
  afterEach(() => vi.restoreAllMocks());

  it('runs probe when --probe provided even if opencode enabled', async () => {
    const runOpencode = vi.fn();
    const probe = vi.fn().mockReturnValue({ rows: [], raw: '' });
    const cmd = createOodaCommand({ runOpencode, probe, isOpencodeEnabled: () => true });

    await cmd.parseAsync(['node', 'ooda', 'ooda', '--probe', '--once']);

    expect(probe).toHaveBeenCalledTimes(1);
    expect(runOpencode).not.toHaveBeenCalled();
  });
});
