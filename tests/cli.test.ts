import { readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execa } from 'execa';
import { expect, test } from 'vitest';

const CLI = ['node', 'dist/index.js'];

function tmpFile(name: string) {
  return join(tmpdir(), name);
}

test('waif --help shows prd/next/recent', async () => {
  const { exitCode, stdout } = await execa(CLI[0], [...CLI.slice(1), '--help']);
  expect(exitCode).toBe(0);
  expect(stdout).toContain('prd');
  expect(stdout).toContain('next');
  expect(stdout).toContain('recent');
});

test('waif --version prints release semver in release mode', async () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
  const { exitCode, stdout } = await execa(CLI[0], [...CLI.slice(1), '--version'], {
    env: { WAIF_VERSION_MODE: 'release' },
  });
  expect(exitCode).toBe(0);
  expect(stdout.trim()).toBe(`v${pkg.version}`);
});

test('waif -v works', async () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
  const { exitCode, stdout } = await execa(CLI[0], [...CLI.slice(1), '-v'], {
    env: { WAIF_VERSION_MODE: 'release' },
  });
  expect(exitCode).toBe(0);
  expect(stdout.trim()).toBe(`v${pkg.version}`);
});

test('waif --version can emit dev stamp', async () => {
  const { exitCode, stdout } = await execa(CLI[0], [...CLI.slice(1), '--version'], {
    env: { WAIF_VERSION_MODE: 'dev' },
  });
  expect(exitCode).toBe(0);
  expect(stdout.trim()).toMatch(/^v0\.0\.0-dev\+\d{8}T\d{6}(\.[0-9a-f]+)?$/);
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
