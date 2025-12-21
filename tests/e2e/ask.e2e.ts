import { expect, test } from 'vitest';
import { run } from '../../src/index.js';

// E2E test that hits a real OpenCode server. Only runs when OPENCODE_E2E=1
const enabled = process.env.OPENCODE_E2E === '1';

(test as any).skipUnless = (condition: boolean) => (condition ? test : test.skip);

(test as any).skipUnless(enabled)('e2e: waif ask uses real OpenCode server', async () => {
  // Warm up: ensure server is up
  process.env.OPENCODE_ENABLED = '1';
  const code = await run(['ask', 'E2E test prompt', '--agent', 'Map']);
  expect(code).toBe(0);
});
