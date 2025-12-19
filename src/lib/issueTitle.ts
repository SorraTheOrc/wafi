import type { SymbolsConfig } from './symbols.js';
import { getDefaultSymbols } from './symbols.js';

export type IssueLikeForTitle = {
  title?: string;
  status?: string;
  issue_type?: string;
};

function normalizeKey(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function truncateTitleKeepingPrefix(prefix: string, title: string, maxLen: number): string {
  const full = prefix + title;
  if (maxLen <= 0) return full;
  if (full.length <= maxLen) return full;

  // Ensure returned length never exceeds maxLen.
  // If the prefix itself is too long, truncate the prefix.
  if (prefix.length >= maxLen) {
    if (maxLen <= 3) return '.'.repeat(maxLen);
    return prefix.slice(0, maxLen - 3) + '...';
  }

  const remaining = maxLen - prefix.length;
  if (remaining <= 3) return prefix + '.'.repeat(remaining);
  return prefix + title.slice(0, remaining - 3) + '...';
}

export function renderIssueTitle(issue: IssueLikeForTitle, maxLen = 0, symbols?: SymbolsConfig): string {
  const cfg = symbols ?? getDefaultSymbols();

  const issueTypeKey = normalizeKey(issue.issue_type);
  const statusKey = normalizeKey(issue.status);

  const typeSym = cfg.issueType[issueTypeKey] ?? cfg.fallback?.issueType ?? '?';
  const statusSym = cfg.status[statusKey] ?? cfg.fallback?.status ?? '?';

  const title = String(issue.title ?? '(no title)');
  const prefix = `${typeSym} ${statusSym} `;

  return truncateTitleKeepingPrefix(prefix, title, maxLen);
}
