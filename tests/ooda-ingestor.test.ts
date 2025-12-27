import { describe, it, expect, vi } from 'vitest';
import { createOodaCommand } from '../src/commands/ooda.js';


describe('ooda command', () => {
  it('defaults to opencode ingestor when enabled and no --probe', async () => {
    const runOpencode = vi.fn().mockResolvedValue(undefined);
    const probe = vi.fn();
    const cmd = createOodaCommand({ runOpencode, probe, isOpencodeEnabled: () => true });

    await cmd.parseAsync(['node', 'waif', 'ooda', '--once']);

    expect(runOpencode).toHaveBeenCalledTimes(1);
    expect(probe).not.toHaveBeenCalled();
  });

  it('runs probe when --probe provided', async () => {
    const runOpencode = vi.fn();
    const probe = vi.fn().mockReturnValue({ rows: [], raw: '' });
    const cmd = createOodaCommand({ runOpencode, probe, isOpencodeEnabled: () => true });

    await cmd.parseAsync(['node', 'waif', 'ooda', '--probe', '--once']);

    expect(probe).toHaveBeenCalledTimes(1);
    expect(runOpencode).not.toHaveBeenCalled();
  });
});
