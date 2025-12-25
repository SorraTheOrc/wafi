import { execa } from 'execa';
import { describe, expect, it } from 'vitest';

const CLI = [process.execPath, 'dist/index.js'];

describe('waif in-progress', () => {
  it('prints a table of in-progress issues', async () => {
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
