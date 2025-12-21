import { renderIssueTitle } from './issueTitle.js';

export type IssueForTable = {
  id: string;
  title?: string;
  status?: string;
  issue_type?: string;
  priority?: number;
  assignee?: string;
  dependency_count?: number;
  dependent_count?: number;
  // We support both shapes:
  // - bd show: dependencies[] entries are issue-like objects w/ dependency_type + status
  // - older/jsonl-ish: dependencies[] entries are edge-like objects w/ type + depends_on_id
  dependencies?: Array<{ id?: string; status?: string; dependency_type?: string; type?: string; depends_on_id?: string }>;
};

function isTerminalStatus(status: string): boolean {
  const normalized = status.toLowerCase();
  return normalized === 'closed' || normalized === 'done' || normalized === 'tombstone';
}

function computeBlockersCount(issue: IssueForTable): number {
  const deps = issue.dependencies;
  if (deps && Array.isArray(deps) && deps.length > 0) {
    return deps.filter((d) => {
      const rel = String(d?.dependency_type ?? d?.type ?? '').toLowerCase();
      if (rel !== 'blocks') return false;
      const status = String(d?.status ?? '').toLowerCase();
      return status.length === 0 ? true : !isTerminalStatus(status);
    }).length;
  }

  // Fallback: Beads list output exposes only total dependency count.
  if (typeof issue.dependency_count === 'number') return issue.dependency_count;

  return 0;
}

function computeBlocksCount(issue: IssueForTable): number {
  if (typeof issue.dependent_count === 'number') return issue.dependent_count;
  return 0;
}

function padRight(value: string, width: number): string {
  if (value.length >= width) return value;
  return value + ' '.repeat(width - value.length);
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  if (max <= 1) return value.slice(0, max);
  return value.slice(0, max - 1) + '…';
}

type RenderIssuesTableOptions = {
  color?: {
    enabled: boolean;
    blockedRow: string;
    reset: string;
  };
  sort?: 'id' | 'none';
};

export function renderIssuesTable(issues: IssueForTable[], options: RenderIssuesTableOptions = {}): string {
  if (!issues.length) return '';

  const sortMode = options.sort ?? 'id';

  const rows = issues
    .map((i) => {
      const blockers = computeBlockersCount(i);
      const blocks = computeBlocksCount(i);
      return {
        id: i.id,
        title: renderIssueTitle(i, 0),
            priority: typeof i.priority === 'number' ? String(i.priority) : '',
        blockers: String(blockers),
        blocks: String(blocks),
        assignee: typeof i.assignee === 'string' ? i.assignee : '',
      };
    });

  if (sortMode === 'id') {
    rows.sort((a, b) => a.id.localeCompare(b.id));
  }

  const headers = {
    id: 'ID',
    title: 'Type / Status / Title',
    priority: 'Priority',
    blockers: 'Blockers',
    blocks: 'Blocks',
    assignee: 'Assignee',
  };

  // Base column contents lengths (minimums derived from header or content)
  const baseWidths = {
    id: Math.max(headers.id.length, ...rows.map((r) => r.id.length)),
    title: Math.max(headers.title.length, ...rows.map((r) => r.title.length)),
    priority: Math.max(headers.priority.length, ...rows.map((r) => r.priority.length)),
    blockers: Math.max(headers.blockers.length, ...rows.map((r) => r.blockers.length)),
    blocks: Math.max(headers.blocks.length, ...rows.map((r) => r.blocks.length)),
    assignee: Math.max(headers.assignee.length, ...rows.map((r) => r.assignee.length)),
  };

  // Determine available terminal width. If unavailable, fall back to a sane default.
  const termWidth = (typeof process !== 'undefined' && process.stdout && typeof process.stdout.columns === 'number')
    ? process.stdout.columns
    : 120;

  // Columns in display order (left-to-right). Title is mandatory; others may be dropped from the right.
  const colOrder: Array<keyof typeof baseWidths> = ['id', 'title', 'priority', 'blockers', 'blocks', 'assignee'];

  // Minimum width constraints
  const minTitleWidth = 4; // allow truncation like 'a…'
  const sep = '  ';

  // Start with desired widths equal to baseWidths but cap title with a reasonable max.
  const maxTitleCap = 60;
  const desiredWidths: Record<string, number> = {
    id: baseWidths.id,
    title: Math.min(maxTitleCap, baseWidths.title),
    priority: baseWidths.priority,
    blockers: baseWidths.blockers,
    blocks: baseWidths.blocks,
    assignee: baseWidths.assignee,
  };

  // Helper to compute total line width for a given set of visible columns
  function totalWidthFor(visibleCols: string[]) {
    const colsWidth = visibleCols.reduce((sum, c) => sum + desiredWidths[c], 0);
    const gaps = Math.max(0, visibleCols.length - 1) * sep.length;
    return colsWidth + gaps;
  }

  // Determine which columns to show. Always include 'id' and 'title'. Drop from the right until fits.
  const visibleCols = [...colOrder];

  // Ensure title has at least header length initially
  if (desiredWidths.title < headers.title.length) desiredWidths.title = headers.title.length;

  // Reduce title width to fit if necessary, but do not drop it.
  while (totalWidthFor(visibleCols) > termWidth) {
    // Try to drop the rightmost non-mandatory column (not 'id' or 'title')
    const droppable = visibleCols.slice().reverse().find((c) => c !== 'title' && c !== 'id');
    if (droppable) {
      const idx = visibleCols.indexOf(droppable);
      visibleCols.splice(idx, 1);
      continue;
    }

    // If no droppable columns remain, attempt to shrink the title down to minTitleWidth
    if (desiredWidths.title > minTitleWidth) {
      desiredWidths.title = Math.max(minTitleWidth, desiredWidths.title - 1);
      continue;
    }

    // As a last resort, if even minimal title + id don't fit, fall back to truncating aggressively (allow overflow)
    break;
  }

  // Recompute widths for columns that remain. Ensure title does not exceed its desired width.
  const widths: Record<string, number> = {} as any;
  for (const c of visibleCols) {
    widths[c] = desiredWidths[c];
  }

  const dash = (w: number) => '-'.repeat(Math.max(3, w));

  const lines: string[] = [];
  const headerCols: string[] = [];
  for (const c of visibleCols) {
    headerCols.push(padRight((headers as any)[c], widths[c]));
  }
  lines.push(headerCols.join(sep));

  const dashCols: string[] = [];
  for (const c of visibleCols) {
    dashCols.push(dash(widths[c]));
  }
  lines.push(dashCols.join(sep));

  for (const r of rows) {
    const rowCols: string[] = [];
    for (const c of visibleCols) {
      let val = '';
      if (c === 'title') val = truncate(r.title, widths.title);
      else val = (r as any)[c] ?? '';
      rowCols.push(padRight(val, widths[c]));
    }

    const rawLine = rowCols.join(sep);

    const blockersNumber = Number((r as any).blockers);
    const color = options.color;
    if (color?.enabled && Number.isFinite(blockersNumber) && blockersNumber > 0) {
      lines.push(`${color.blockedRow}${rawLine}${color.reset}`);
    } else {
      lines.push(rawLine);
    }
  }

  return lines.join('\n');
}

export function renderInProgressIssuesTable(issues: IssueForTable[]): string {
  return renderIssuesTable(issues);
}
