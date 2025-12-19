import { describe, expect, it } from 'vitest';
import { renderIssueTitle } from '../src/lib/issueTitle.js';
import { getDefaultSymbols } from '../src/lib/symbols.js';

describe('renderIssueTitle', () => {
  it('renders type + status + title using the default config', () => {
    const symbols = getDefaultSymbols();

    expect(renderIssueTitle({ issue_type: 'feature', status: 'open', title: 'Hello' })).toBe(
      `${symbols.issueType.feature} ${symbols.status.open} Hello`,
    );
    expect(renderIssueTitle({ issue_type: 'bug', status: 'in_progress', title: 'Fix it' })).toBe(
      `${symbols.issueType.bug} ${symbols.status.in_progress} Fix it`,
    );
    expect(renderIssueTitle({ issue_type: 'task', status: 'done', title: 'Ship' })).toBe(
      `${symbols.issueType.task} ${symbols.status.done} Ship`,
    );
    expect(renderIssueTitle({ issue_type: 'epic', status: 'closed', title: 'Big' })).toBe(
      `${symbols.issueType.epic} ${symbols.status.closed} Big`,
    );
    expect(renderIssueTitle({ issue_type: 'chore', status: 'tombstone', title: 'Cleanup' })).toBe(
      `${symbols.issueType.chore} ${symbols.status.tombstone} Cleanup`,
    );
  });

  it('normalizes keys and falls back when unknown', () => {
    const symbols = getDefaultSymbols();

    expect(renderIssueTitle({ issue_type: 'FEATURE', status: 'Open', title: 'Hello' })).toBe(
      `${symbols.issueType.feature} ${symbols.status.open} Hello`,
    );
    expect(renderIssueTitle({ issue_type: 'weird', status: 'unknown', title: 'Hello' })).toBe(
      `${symbols.fallback?.issueType ?? '?'} ${symbols.fallback?.status ?? '?'} Hello`,
    );
  });

  it('does not truncate when maxLen <= 0', () => {
    const symbols = getDefaultSymbols();

    const s = renderIssueTitle({ issue_type: 'feature', status: 'open', title: 'A'.repeat(50) }, 0);
    expect(s).toBe(`${symbols.issueType.feature} ${symbols.status.open} ${'A'.repeat(50)}`);
  });

  it('truncates with ellipsis and never exceeds maxLen', () => {
    const symbols = getDefaultSymbols();
    const issue = { issue_type: 'feature', status: 'open', title: 'abcdefghijklmnopqrstuvwxyz' };

    const s10 = renderIssueTitle(issue, 10);
    expect(s10.length).toBeLessThanOrEqual(10);
    expect(s10).toContain('...');

    const prefix = `${symbols.issueType.feature} ${symbols.status.open} `;
    const exact = renderIssueTitle({ issue_type: 'feature', status: 'open', title: 'abc' }, (prefix + 'abc').length);
    expect(exact).toBe(prefix + 'abc');
  });

  it('handles very small maxLen values', () => {
    const issue = { issue_type: 'feature', status: 'open', title: 'Hello' };

    expect(renderIssueTitle(issue, 1)).toBe('.');
    expect(renderIssueTitle(issue, 2)).toBe('..');
    expect(renderIssueTitle(issue, 3)).toBe('...');

    const s4 = renderIssueTitle(issue, 4);
    expect(s4.length).toBe(4);
  });
});
