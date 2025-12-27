import { describe, it, expect, vi } from 'vitest';
import { createOodaCommand } from '../src/commands/ooda.js';


describe('ooda command', () => {
  it('always uses opencode ingester when enabled', async () => {
    const runIngester = vi.fn().mockResolvedValue(undefined);
    const cmd = createOodaCommand({ runIngester, isOpencodeEnabled: () => true });

    await cmd.parseAsync(['node', 'waif', 'ooda', '--once']);

    expect(runIngester).toHaveBeenCalledTimes(1);
  });
});
