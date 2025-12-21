import { expect, test } from 'vitest';
import { run } from '../src/index.js';

const DISABLE_OPEN_CODE = '0';

test('ask command prints markdown response', async () => {
  process.env.OPENCODE_ENABLED = DISABLE_OPEN_CODE;
  const code = await run(['ask', 'Hello world']);
  expect(code).toBe(0);
});

test('ask requires prompt', async () => {
  process.env.OPENCODE_ENABLED = DISABLE_OPEN_CODE;
  const code = await run(['ask']);
  expect(code).toBe(2);
});
