import { readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execa } from 'execa';
import { expect, test } from 'vitest';

const CLI = ['node', 'dist/index.js'];

function tmpFile(name: string) {
  return join(tmpdir(), name);
}

test('waif --help shows prd', async () => {
  const { exitCode, stdout } = await execa(CLI[0], [...CLI.slice(1), '--help']);
  expect(exitCode).toBe(0);
  expect(stdout).toContain('prd');
});

test('waif prd --help works', async () => {
  const { exitCode, stdout } = await execa(CLI[0], [...CLI.slice(1), 'prd', '--help']);
  expect(exitCode).toBe(0);
  expect(stdout).toContain('--out');
});

test('waif: missing --out exits 2', async () => {
  const { exitCode, stderr } = await execa(CLI[0], [...CLI.slice(1), 'prd'], { reject: false });
  expect(exitCode).toBe(2);
  expect(stderr).toMatch(/--out|Missing/);
});

test('prd writes stub and reports human output', async () => {
  const outPath = tmpFile(`stub-${Date.now()}.md`);
  const { exitCode, stdout } = await execa(CLI[0], [...CLI.slice(1), 'prd', '--out', outPath]);
  expect(exitCode).toBe(0);
  expect(readFileSync(outPath, 'utf8')).toMatch(/^# PRD/);
  expect(stdout).toContain('Wrote PRD stub');
});

test('prd json output', async () => {
  const outPath = tmpFile(`stub-json-${Date.now()}.md`);
  const { exitCode, stdout } = await execa(CLI[0], [...CLI.slice(1), 'prd', '--out', outPath, '--json']);
  expect(exitCode).toBe(0);
  const payload = JSON.parse(stdout.trim());
  expect(payload.out).toBe(outPath);
  expect(payload.stub).toBe(true);
});
