import { execa } from 'execa';
import { describe, expect, it } from 'vitest';

const CLI = [process.execPath, 'dist/index.js'];

describe('waif in-progress', () => {
  it('prints a table of in-progress issues with per-issue blocker sections', async () => {
    const envPayload = JSON.stringify([
      { id: 'wf-ip1', title: 'First', status: 'in_progress', priority: 2 },
      { id: 'wf-ip2', title: 'Second', status: 'in_progress', priority: 1, assignee: 'alice' },
    ]);

    const { exitCode, stdout } = await execa(CLI[0], [...CLI.slice(1), 'in-progress'], {
      env: {
        WAIF_IN_PROGRESS_JSON: envPayload,
        PATH: '',
      },
    });

    expect(exitCode).toBe(0);
    expect(stdout).toContain('# In Progress');
    expect(stdout).toContain('wf-ip1');
    expect(stdout).toContain('wf-ip2');
    expect(stdout).toContain('Type / Status / Title');
    expect(stdout).not.toContain('No blockers');
    expect(stdout).not.toContain('No children');
  });

  it('renders indented blocker and child sub-tables when present', async () => {
    const envPayload = JSON.stringify([
      {
        id: 'wf-ip1',
        title: 'Active',
        status: 'in_progress',
        dependencies: [
          { id: 'wf-blocker-open', dependency_type: 'blocks', status: 'in_progress', title: 'Blocker One' },
          { id: 'wf-blocker-closed', dependency_type: 'blocks', status: 'closed', title: 'Closed Blocker' },
          { id: 'wf-blocker-unknown', dependency_type: 'blocks', title: 'Unknown Blocker' },
        ],
        dependents: [
          { id: 'wf-child-1', dependency_type: 'parent-child', status: 'in_progress', title: 'Child 1' },
          { id: 'wf-child-closed', dependency_type: 'parent-child', status: 'closed', title: 'Closed Child' },
        ],
      },
    ]);

    const { exitCode, stdout } = await execa(CLI[0], [...CLI.slice(1), 'in-progress'], {
      env: {
        WAIF_IN_PROGRESS_JSON: envPayload,
        PATH: '',
      },
    });

    expect(exitCode).toBe(0);
    expect(stdout).toContain('wf-blocker-open');
    expect(stdout).toContain('wf-blocker-unknown');
    expect(stdout).not.toContain('wf-blocker-closed');
    const blockerTableIndex = stdout.indexOf('    ID');
    expect(blockerTableIndex).toBeGreaterThan(stdout.indexOf('wf-ip1'));
    expect(stdout).toContain('  Children');
    expect(stdout).toContain('wf-child-1');
    expect(stdout).not.toContain('wf-child-closed');
  });

  it('supports --json output', async () => {
    const envPayload = JSON.stringify([{ id: 'wf-ip1', title: 'First', status: 'in_progress' }]);

    const { exitCode, stdout } = await execa(CLI[0], [...CLI.slice(1), 'in-progress', '--json'], {
      env: {
        WAIF_IN_PROGRESS_JSON: envPayload,
        PATH: '',
      },
    });

    expect(exitCode).toBe(0);
    const payload = JSON.parse(stdout.trim());
    expect(Array.isArray(payload)).toBe(true);
    expect(payload).toHaveLength(1);
    expect(payload[0].id).toBe('wf-ip1');
  });

  it('prints a friendly message when none exist', async () => {
    const { exitCode, stdout } = await execa(CLI[0], [...CLI.slice(1), 'in-progress'], {
      env: {
        WAIF_IN_PROGRESS_JSON: JSON.stringify([]),
        PATH: '',
      },
    });

    expect(exitCode).toBe(0);
    expect(stdout).toContain('# In Progress');
    expect(stdout).toContain('No in-progress issues');
  });
});
