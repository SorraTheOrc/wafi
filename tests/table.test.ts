import { describe, expect, it } from 'vitest';
import { getDefaultSymbols } from '../src/lib/symbols.js';
import { renderIssuesTable } from '../src/lib/table.js';

describe('renderIssuesTable', () => {
  it('renders required columns and rows', () => {
    const symbols = getDefaultSymbols();
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
    expect(out).toContain('Type / Status / Title');
    expect(out).toContain('Priority');
    expect(out).toContain('Blocks');
    expect(out).toContain('Assignee');

    expect(out).toMatch(/wf-1/);
    expect(out).toContain(`${symbols.fallback?.issueType ?? '?'} ${symbols.fallback?.status ?? '?'} First`);
    expect(out).toMatch(/2/);
    expect(out).toMatch(/0/);
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
    const symbols = getDefaultSymbols();
    expect(out).toContain(`${symbols.fallback?.issueType ?? '?'} ${symbols.fallback?.status ?? '?'} Blocked`);
  });

  it('does not include a separate status column', () => {
    const symbols = getDefaultSymbols();
    const out = renderIssuesTable(
      [
        { id: 'wf-1', title: 'First', status: 'open', priority: 2 },
        { id: 'wf-2', title: 'Second', status: 'in_progress', priority: 1 },
      ],
      { sort: 'none' },
    );

    expect(out).toContain('Type / Status / Title');

    const headerLine = out.split('\n')[0] ?? '';
    const headerCols = headerLine.split(/\s{2,}/);
    expect(headerCols).toEqual([
      'ID',
      'Type / Status / Title',
      'Priority',
      'Blocks',
      'Assignee',
    ]);

    expect(out).toContain(`${symbols.fallback?.issueType ?? '?'} ${symbols.status.open} First`);
    expect(out).toContain(`${symbols.fallback?.issueType ?? '?'} ${symbols.status.in_progress} Second`);
  });

  it('returns empty string for empty input', () => {
    expect(renderIssuesTable([])).toBe('');
  });
});
