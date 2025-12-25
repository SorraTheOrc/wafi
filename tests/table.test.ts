import { describe, expect, it } from 'vitest';
import { renderInProgressIssuesTable } from '../src/lib/table.js';

describe('renderInProgressIssuesTable', () => {
  it('renders required columns and rows', () => {
    const out = renderInProgressIssuesTable([
      {
        id: 'wf-1',
        title: 'First',
        priority: 2,
        assignee: 'alice',
        dependency_count: 3,
      },
      {
        id: 'wf-2',
        title: 'Second',
        priority: 0,
        assignee: '',
        dependency_count: 0,
      },
    ]);

    expect(out).toContain('ID');
    expect(out).toContain('Title');
    expect(out).toContain('Priority');
    expect(out).toContain('Blockers');
    expect(out).toContain('Assignee');

    expect(out).toMatch(/wf-1/);
    expect(out).toMatch(/First/);
    expect(out).toMatch(/2/);
    expect(out).toMatch(/3/);
    expect(out).toMatch(/alice/);
  });

  it('returns empty string for empty input', () => {
    expect(renderInProgressIssuesTable([])).toBe('');
  });
});
