import { Command } from 'commander';
import type { Mock } from 'vitest';
import { describe, expect, it, vi } from 'vitest';
import { createShowCommand } from '../src/commands/show.js';
import { showIssue } from '../src/lib/bd.js';

vi.mock('../src/lib/bd.js', () => ({
  showIssue: vi.fn(),
}));

function createTestProgram() {
  const program = new Command();
  program.exitOverride();
  program.addCommand(createShowCommand());
  return program;
}

describe('waif show', () => {
  it('prints main issue, blockers, and children tables', async () => {
    (showIssue as unknown as Mock).mockReturnValue({
      id: 'wf-123',
      title: 'Demo',
      status: 'open',
      priority: 2,
      assignee: 'alice',
      dependencies: [
        { depends_on_id: 'wf-1', dependency_type: 'blocks', status: 'open' },
        { depends_on_id: 'wf-2', dependency_type: 'parent-child' },
      ],
      children: [{ id: 'wf-2', title: 'Child', status: 'open', priority: 3 }],
    });

    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true as any);

    const program = createTestProgram();
    await program.parseAsync(['show', 'wf-123'], { from: 'user' });

    const output = stdoutSpy.mock.calls.map((c) => c[0]).join('');
    expect(output).toContain('wf-123');
    expect(output).toContain('Blockers');
    expect(output).toContain('Children');
    expect(output).toContain('wf-1');
    expect(output).toContain('wf-2');

    stdoutSpy.mockRestore();
  });

  it('errors when issue not found', async () => {
    (showIssue as unknown as Mock).mockImplementation(() => {
      const err: any = new Error('bd show failed');
      err.exitCode = 1;
      throw err;
    });

    const program = createTestProgram();

    await expect(program.parseAsync(['show', 'wf-missing'], { from: 'user' })).rejects.toThrow(/bd show failed/);
  });
});
