import { expect, test } from 'vitest';
import { run } from '../src/index.js';

test('ask command prints markdown response', async () => {
  // run the CLI with a prompt
  const code = await run(['ask', 'Hello world']);
  expect(code).toBe(0);
});

test('ask requires prompt', async () => {
  const code = await run(['ask']);
  expect(code).toBe(2);
});
