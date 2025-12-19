import { tmpdir } from 'os';
import { join } from 'path';
import { writeFileSync } from 'fs';
import { execa } from 'execa';
import { describe, expect, it } from 'vitest';

const CLI = ['node', 'dist/index.js'];

function makeIssues(path: string, issues: any[]) {
  writeFileSync(path, issues.map((i) => JSON.stringify(i)).join('\n') + '\n', 'utf8');
}

describe('waif next', () => {
  it('picks highest bv score when provided', async () => {
    const tmpIssues = join(tmpdir(), `issues-${Date.now()}.jsonl`);
    makeIssues(tmpIssues, [
      { id: 'wf-1', title: 'First', status: 'open', priority: 2 },
      { id: 'wf-2', title: 'Second', status: 'open', priority: 1 },
    ]);

    const bvPayload = JSON.stringify({
      items: [
        { id: 'wf-1', score: 10, rank: 2, rationale: 'lower' },
        { id: 'wf-2', score: 20, rank: 1, rationale: 'higher' },
      ],
    });

    const { exitCode, stdout } = await execa(CLI[0], [...CLI.slice(1), 'next', '--json'], {
      env: {
        WAIF_ISSUES_PATH: tmpIssues,
        WAIF_BV_PRIORITY_JSON: bvPayload,
      },
    });

    expect(exitCode).toBe(0);
    const payload = JSON.parse(stdout.trim());
    expect(payload.id).toBe('wf-2');
    expect(payload.waif.score).toBe(20);
    expect(payload.waif.metadata.bvSource).toBe('env');
  });

  it('falls back to priority/created_at when no bv score', async () => {
    const tmpIssues = join(tmpdir(), `issues-${Date.now() + 1}.jsonl`);
    makeIssues(tmpIssues, [
      { id: 'wf-1', title: 'First', status: 'open', priority: 2, created_at: '2024-01-01T00:00:00Z' },
      { id: 'wf-2', title: 'Second', status: 'open', priority: 1, created_at: '2024-01-02T00:00:00Z' },
    ]);

    const { exitCode, stdout } = await execa(CLI[0], [...CLI.slice(1), 'next', '--json'], {
      env: { WAIF_ISSUES_PATH: tmpIssues },
    });

    expect(exitCode).toBe(0);
    const payload = JSON.parse(stdout.trim());
    expect(payload.id).toBe('wf-2');
    expect(payload.waif.rationale).toContain('priority');
  });

  it('errors when no eligible issues', async () => {
    const tmpIssues = join(tmpdir(), `issues-${Date.now() + 2}.jsonl`);
    makeIssues(tmpIssues, [
      { id: 'wf-1', status: 'closed' },
    ]);

    const { exitCode, stderr } = await execa(CLI[0], [...CLI.slice(1), 'next'], {
      env: { WAIF_ISSUES_PATH: tmpIssues },
      reject: false,
    });

    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/No eligible issues/);
  });
});
