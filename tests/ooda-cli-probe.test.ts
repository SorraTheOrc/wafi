import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createOodaCommand } from '../src/commands/ooda.js';

describe('ooda CLI probe opt-in', () => {
  beforeEach(() => {
    // nothing
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs probeOnce when --probe --once provided', async () => {
    const probeSpy = vi.fn().mockReturnValue({ rows: [] });
    const cmd = createOodaCommand({ probe: probeSpy, isOpencodeEnabled: () => true });
    await cmd.parse(['node', 'ooda', '--probe', '--once'], { from: 'user' });
    expect(probeSpy).toHaveBeenCalled();
  });
});
