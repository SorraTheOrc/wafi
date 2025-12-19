import { describe, expect, it } from 'vitest';
import { renderIssueTitle } from '../src/lib/issueTitle.js';

describe('renderIssueTitle', () => {
  it('renders type + status + title with default symbols', () => {
    expect(renderIssueTitle({ issue_type: 'feature', status: 'open', title: 'Hello' })).toBe('✨ ⭕ Hello');
    expect(renderIssueTitle({ issue_type: 'bug', status: 'in_progress', title: 'Fix it' })).toBe('🐛 🚧 Fix it');
    expect(renderIssueTitle({ issue_type: 'task', status: 'done', title: 'Ship' })).toBe('🧩 ✅ Ship');
    expect(renderIssueTitle({ issue_type: 'epic', status: 'closed', title: 'Big' })).toBe('🗺️ ✓ Big');
    expect(renderIssueTitle({ issue_type: 'chore', status: 'tombstone', title: 'Cleanup' })).toBe('🧹 🪦 Cleanup');
  });

  it('normalizes keys and falls back when unknown', () => {
    expect(renderIssueTitle({ issue_type: 'FEATURE', status: 'Open', title: 'Hello' })).toBe('✨ ⭕ Hello');
    expect(renderIssueTitle({ issue_type: 'weird', status: 'unknown', title: 'Hello' })).toBe('❓ ❓ Hello');
  });

  it('does not truncate when maxLen <= 0', () => {
    const s = renderIssueTitle({ issue_type: 'feature', status: 'open', title: 'A'.repeat(50) }, 0);
    expect(s).toBe(`✨ ⭕ ${'A'.repeat(50)}`);
  });

  it('truncates with ellipsis and never exceeds maxLen', () => {
    const issue = { issue_type: 'feature', status: 'open', title: 'abcdefghijklmnopqrstuvwxyz' };

    const s10 = renderIssueTitle(issue, 10);
    expect(s10.length).toBeLessThanOrEqual(10);
    expect(s10).toContain('...');

    const exact = renderIssueTitle({ issue_type: 'feature', status: 'open', title: 'abc' }, '✨ ⭕ abc'.length);
    expect(exact).toBe('✨ ⭕ abc');
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
