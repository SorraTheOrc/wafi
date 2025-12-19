import { readFileSync, writeFileSync } from 'fs';
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

test('prd accepts prompt via arg', async () => {
  const outPath = tmpFile(`prompt-arg-${Date.now()}.md`);
  const prompt = 'Write a PRD for adding input modes.';
  const { exitCode, stdout } = await execa(CLI[0], [...CLI.slice(1), 'prd', '--out', outPath, '--prompt', prompt, '--json']);
  expect(exitCode).toBe(0);
  const payload = JSON.parse(stdout.trim());
  expect(payload.prompt.source).toBe('arg');
  expect(payload.prompt.length).toBe(prompt.length);
  expect(readFileSync(outPath, 'utf8')).toContain(prompt);
});

test('prd accepts prompt via file', async () => {
  const outPath = tmpFile(`prompt-file-${Date.now()}.md`);
  const promptPath = tmpFile(`prompt-${Date.now()}.txt`);
  const prompt = 'Prompt from file.';
  writeFileSync(promptPath, prompt, 'utf8');

  const { exitCode, stdout } = await execa(CLI[0], [...CLI.slice(1), 'prd', '--out', outPath, '--prompt-file', promptPath, '--json']);
  expect(exitCode).toBe(0);
  const payload = JSON.parse(stdout.trim());
  expect(payload.prompt.source).toBe('file');
  expect(payload.prompt.length).toBe(prompt.length);
  expect(readFileSync(outPath, 'utf8')).toContain(prompt);
});

test('prd accepts prompt via stdin when --prompt -', async () => {
  const outPath = tmpFile(`prompt-stdin-${Date.now()}.md`);
  const prompt = 'Prompt via stdin.';
  const { exitCode, stdout } = await execa(CLI[0], [...CLI.slice(1), 'prd', '--out', outPath, '--prompt', '-', '--json'], {
    input: prompt,
  });
  expect(exitCode).toBe(0);
  const payload = JSON.parse(stdout.trim());
  expect(payload.prompt.source).toBe('stdin');
  expect(payload.prompt.length).toBe(prompt.length);
  expect(readFileSync(outPath, 'utf8')).toContain(prompt);
});

test('prd errors if both --prompt and --prompt-file provided', async () => {
  const outPath = tmpFile(`prompt-both-${Date.now()}.md`);
  const promptPath = tmpFile(`prompt-both-${Date.now()}.txt`);
  writeFileSync(promptPath, 'file prompt', 'utf8');

  const { exitCode, stderr } = await execa(CLI[0], [...CLI.slice(1), 'prd', '--out', outPath, '--prompt', 'arg prompt', '--prompt-file', promptPath], {
    reject: false,
  });
  expect(exitCode).toBe(2);
  expect(stderr).toContain('Use only one of --prompt or --prompt-file');
});

test('prd json output', async () => {
  const outPath = tmpFile(`stub-json-${Date.now()}.md`);
  const { exitCode, stdout } = await execa(CLI[0], [...CLI.slice(1), 'prd', '--out', outPath, '--json']);
  expect(exitCode).toBe(0);
  const payload = JSON.parse(stdout.trim());
  expect(payload.out).toBe(outPath);
  expect(payload.stub).toBe(true);
});
