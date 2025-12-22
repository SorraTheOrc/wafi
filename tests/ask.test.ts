import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { expect, test, beforeEach, afterEach } from 'vitest';
import { run } from '../src/index.js';

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env = { ...originalEnv };
});

afterEach(() => {
  process.env = { ...originalEnv };
});

test('ask command sends prompt to mapped tmux pane and logs', async () => {
  const logDir = mkdtempSync(join(tmpdir(), 'waif-ask-log-'));
  process.env.WAIF_LOG_DIR = logDir;
  process.env.WAIF_TMUX_PANES = 'waif-workflow:core.0\tMap (PM)';
  // ensure agent resolution uses default map -> Map (PM)
  const code = await run(['ask', 'Hello world']);
  expect(code).toBe(0);
  const logPath = join(logDir, 'ask.log');
  const log = readFileSync(logPath, 'utf8');
  expect(log).toContain('Hello world');
  rmSync(logDir, { recursive: true, force: true });
});

test('ask requires prompt', async () => {
  process.env.WAIF_TMUX_PANES = 'waif-workflow:core.0\tMap (PM)';
  const code = await run(['ask']);
  expect(code).toBe(2);
});
