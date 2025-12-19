import { describe, expect, it } from 'vitest';
import { renderIssuesTable } from '../src/lib/table.js';

describe('renderIssuesTable', () => {
  it('renders required columns and rows', () => {
    const out = renderIssuesTable([
      {
        id: 'wf-1',
        title: 'First',
        priority: 2,
        assignee: 'alice',
        dependency_count: 3,
        dependent_count: 1,
      },
      {
        id: 'wf-2',
        title: 'Second',
        priority: 0,
        assignee: '',
        dependency_count: 0,
        dependent_count: 0,
      },
    ]);

    expect(out).toContain('ID');
    expect(out).toContain('Title');
    expect(out).toContain('Priority');
    expect(out).toContain('Blockers');
    expect(out).toContain('Blocks');
    expect(out).toContain('Assignee');

    expect(out).toMatch(/wf-1/);
    expect(out).toMatch(/First/);
    expect(out).toMatch(/2/);
    expect(out).toMatch(/3/);
    expect(out).toMatch(/1/);
    expect(out).toMatch(/alice/);
  });

  it('colors rows red when blocked', () => {
    const out = renderIssuesTable(
      [
        {
          id: 'wf-1',
          title: 'Blocked',
          dependency_count: 1,
        },
      ],
      { color: { enabled: true, blockedRow: '\u001b[31m', reset: '\u001b[0m' } },
    );

    expect(out).toContain('\u001b[31m');
    expect(out).toContain('wf-1');
    expect(out).toContain('\u001b[0m');
  });

  it('returns empty string for empty input', () => {
    expect(renderIssuesTable([])).toBe('');
  });
});
