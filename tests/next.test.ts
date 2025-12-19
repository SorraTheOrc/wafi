import { tmpdir } from 'os';
import { join } from 'path';
import { writeFileSync } from 'fs';
import { execa } from 'execa';
import { describe, expect, it } from 'vitest';

const CLI = [process.execPath, 'dist/index.js'];

function makeIssues(path: string, issues: any[]) {
  writeFileSync(path, issues.map((i) => JSON.stringify(i)).join('\n') + '\n', 'utf8');
}

describe('waif next', () => {
  it('prints in-progress table before recommendation', async () => {
    const tmpIssues = join(tmpdir(), `issues-${Date.now()}-inprogress.jsonl`);
    makeIssues(tmpIssues, [
      { id: 'wf-1', title: 'First', status: 'open', priority: 2 },
      { id: 'wf-2', title: 'Second', status: 'open', priority: 1 },
    ]);

    const inProgressPayload = JSON.stringify([
      {
        id: 'wf-ip1',
        title: 'In progress one',
        status: 'in_progress',
        priority: 0,
        assignee: 'alice',
        // With full dependency objects present, waif should display *actual* blockers.
        dependencies: [
          { id: 'wf-d1', dependency_type: 'blocks', status: 'open' },
          { id: 'wf-d2', dependency_type: 'blocks', status: 'closed' },
          { id: 'wf-parent', dependency_type: 'parent-child', status: 'in_progress' },
        ],
      },
    ]);

    const { exitCode, stdout } = await execa(CLI[0], [...CLI.slice(1), 'next'], {
      env: {
        WAIF_ISSUES_PATH: tmpIssues,
        WAIF_IN_PROGRESS_JSON: inProgressPayload,
        PATH: '',
      },
    });

    expect(exitCode).toBe(0);

    const idxInProgress = stdout.indexOf('# In Progress');
    const idxSummary = stdout.indexOf('# Recommended Summary');
    const idxDetail = stdout.indexOf('# Recommended Detail');

    expect(idxInProgress).toBeGreaterThanOrEqual(0);
    expect(idxSummary).toBeGreaterThan(idxInProgress);
    expect(idxDetail).toBeGreaterThan(idxSummary);

    // in-progress table
    expect(stdout).toContain('wf-ip1');
    const inProgressLine = stdout
      .split('\n')
      .find((l) => l.includes('wf-ip1') && !l.includes('ID'));
    expect(inProgressLine).toBeTruthy();
    expect(inProgressLine).toMatch(/wf-ip1\s+❓\s+🚧\s+In progress one\s+0\s+1\s+0\s+alice/);

    // summary table contains the chosen issue
    expect(stdout).toContain('wf-2');

    // rationale line should not be printed in human output anymore
    expect(stdout).not.toContain('priority 1');
  });

  it('omits in-progress section when none exist', async () => {
    const tmpIssues = join(tmpdir(), `issues-${Date.now()}-noinprogress.jsonl`);
    makeIssues(tmpIssues, [{ id: 'wf-1', title: 'First', status: 'open', priority: 2 }]);

    const { exitCode, stdout } = await execa(CLI[0], [...CLI.slice(1), 'next'], {
      env: {
        WAIF_ISSUES_PATH: tmpIssues,
        WAIF_IN_PROGRESS_JSON: JSON.stringify([]),
        PATH: '',
      },
    });

    expect(exitCode).toBe(0);
    expect(stdout).not.toContain('# In Progress');
    expect(stdout).toContain('# Recommended Summary');
    expect(stdout).toContain('# Recommended Detail');
  });

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
        PATH: '',
      },
    });

    expect(exitCode).toBe(0);
    const payload = JSON.parse(stdout.trim());
    expect(payload.id).toBe('wf-2');
    expect(payload.waif.score).toBe(20);
    expect(payload.waif.metadata.bvSource).toBe('env');

    // JSON output should not include human sections
    expect(stdout).not.toContain('== Recommended Summary ==');
  });

  it('falls back to priority/created_at when no bv score', async () => {
    const tmpIssues = join(tmpdir(), `issues-${Date.now() + 1}.jsonl`);
    makeIssues(tmpIssues, [
      { id: 'wf-1', title: 'First', status: 'open', priority: 2, created_at: '2024-01-01T00:00:00Z' },
      { id: 'wf-2', title: 'Second', status: 'open', priority: 1, created_at: '2024-01-02T00:00:00Z' },
    ]);

    const { exitCode, stdout } = await execa(CLI[0], [...CLI.slice(1), 'next', '--json'], {
      env: { WAIF_ISSUES_PATH: tmpIssues, PATH: '' },
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
      env: { WAIF_ISSUES_PATH: tmpIssues, PATH: '' },
      reject: false,
    });

    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/No eligible issues/);
  });
});
