import { tmpdir } from 'os';
import { join } from 'path';
import { writeFileSync } from 'fs';
import { execa } from 'execa';
import { describe, expect, it } from 'vitest';

const CLI = [process.execPath, 'dist/index.js'];

function makeIssues(path: string, issues: any[]) {
  writeFileSync(path, issues.map((i) => JSON.stringify(i)).join('\n') + '\n', 'utf8');
}

describe('waif recent', () => {
  it('defaults to 3 most recently updated issues (human output)', async () => {
    const tmpIssues = join(tmpdir(), `issues-${Date.now()}-recent.jsonl`);
    makeIssues(tmpIssues, [
      { id: 'wf-1', title: 'Old', updated_at: '2024-01-01T00:00:00Z', priority: 2, status: 'open' },
      { id: 'wf-2', title: 'Newest', updated_at: '2024-01-04T00:00:00Z', priority: 2, status: 'in_progress' },
      { id: 'wf-3', title: 'Middle', updated_at: '2024-01-03T00:00:00Z', priority: 2, status: 'open' },
      { id: 'wf-4', title: 'Older', updated_at: '2024-01-02T00:00:00Z', priority: 2, status: 'closed' },
    ]);

    const { exitCode, stdout } = await execa(CLI[0], [...CLI.slice(1), 'recent'], {
      env: { WAIF_ISSUES_PATH: tmpIssues, PATH: '' },
    });

    expect(exitCode).toBe(0);
    expect(stdout).toContain('# Recent Issues');
    expect(stdout).toContain('Type / Status / Title');

    const idx2 = stdout.indexOf('wf-2');
    const idx3 = stdout.indexOf('wf-3');
    const idx4 = stdout.indexOf('wf-4');
    const idx1 = stdout.indexOf('wf-1');

    expect(idx2).toBeGreaterThanOrEqual(0);
    expect(idx3).toBeGreaterThan(idx2);
    expect(idx4).toBeGreaterThan(idx3);
    expect(idx1).toBe(-1);
  });

  it('supports --n and --json', async () => {
    const tmpIssues = join(tmpdir(), `issues-${Date.now()}-recent-json.jsonl`);
    makeIssues(tmpIssues, [
      { id: 'wf-a', title: 'A', updated_at: '2024-01-01T00:00:00Z', description: 'a-desc' },
      { id: 'wf-b', title: 'B', updated_at: '2024-01-03T00:00:00Z', description: 'b-desc' },
      { id: 'wf-c', title: 'C', updated_at: '2024-01-02T00:00:00Z', description: 'c-desc' },
    ]);

    const { exitCode, stdout } = await execa(CLI[0], [...CLI.slice(1), 'recent', '--n', '2', '--json'], {
      env: { WAIF_ISSUES_PATH: tmpIssues, PATH: '' },
    });

    expect(exitCode).toBe(0);
    const payload = JSON.parse(stdout.trim());
    expect(Array.isArray(payload)).toBe(true);
    expect(payload).toHaveLength(2);
    expect(payload[0].id).toBe('wf-b');
    expect(payload[0].description).toBe('b-desc');
    expect(payload[1].id).toBe('wf-c');
  });

  it('errors on invalid --n', async () => {
    const tmpIssues = join(tmpdir(), `issues-${Date.now()}-recent-invalid.jsonl`);
    makeIssues(tmpIssues, [{ id: 'wf-1', updated_at: '2024-01-01T00:00:00Z' }]);

    const { exitCode, stderr } = await execa(CLI[0], [...CLI.slice(1), 'recent', '--n', '0'], {
      env: { WAIF_ISSUES_PATH: tmpIssues, PATH: '' },
      reject: false,
    });

    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/Invalid --n/);
  });
});
