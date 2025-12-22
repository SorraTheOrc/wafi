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

  const rows = issues.map((issue) => ({
    id: issue.id,
    title: renderIssueTitle(issue, 0),
    priority: typeof issue.priority === 'number' ? String(issue.priority) : '',
    blocks: String(computeBlocksCount(issue)),
    blockers: String(computeBlockersCount(issue)),
    assignee: typeof issue.assignee === 'string' ? issue.assignee : '',
  }));

  if (sortMode === 'id') {
    rows.sort((a, b) => a.id.localeCompare(b.id));
  }

  const headers = {
    id: 'ID',
    title: 'Type / Status / Title',
    priority: 'Priority',
    blocks: 'Blocks',
    assignee: 'Assignee',
  } as const;

  const baseWidths = {
    id: Math.max(headers.id.length, ...rows.map((r) => r.id.length)),
    title: Math.max(headers.title.length, ...rows.map((r) => r.title.length)),
    priority: Math.max(headers.priority.length, ...rows.map((r) => r.priority.length)),
    blocks: Math.max(headers.blocks.length, ...rows.map((r) => r.blocks.length)),
    assignee: Math.max(headers.assignee.length, ...rows.map((r) => r.assignee.length)),
  } as const;

  const termWidth = (typeof process !== 'undefined' && process.stdout && typeof process.stdout.columns === 'number')
    ? process.stdout.columns
    : 120;

  const colOrder: Array<keyof typeof baseWidths> = ['id', 'title', 'priority', 'blocks', 'assignee'];
  const minTitleWidth = 4;
  const sep = '  ';
  const maxTitleCap = 60;
  const desiredWidths: Record<keyof typeof baseWidths, number> = {
    id: baseWidths.id,
    title: Math.min(maxTitleCap, baseWidths.title),
    priority: baseWidths.priority,
    blocks: baseWidths.blocks,
    assignee: baseWidths.assignee,
  };

  if (desiredWidths.title < headers.title.length) desiredWidths.title = headers.title.length;

  const totalWidthFor = (visibleCols: Array<keyof typeof baseWidths>) => {
    const colsWidth = visibleCols.reduce((sum, c) => sum + desiredWidths[c], 0);
    const gaps = Math.max(0, visibleCols.length - 1) * sep.length;
    return colsWidth + gaps;
  };

  const visibleCols = [...colOrder];
  while (totalWidthFor(visibleCols) > termWidth) {
    const droppable = visibleCols.slice().reverse().find((c) => c !== 'title' && c !== 'id');
    if (droppable) {
      const idx = visibleCols.indexOf(droppable);
      visibleCols.splice(idx, 1);
      continue;
    }

    if (desiredWidths.title > minTitleWidth) {
      desiredWidths.title = Math.max(minTitleWidth, desiredWidths.title - 1);
      continue;
    }

    break;
  }

  const widths: Partial<Record<keyof typeof baseWidths, number>> = {};
  for (const c of visibleCols) {
    widths[c] = desiredWidths[c];
  }

  const dash = (w: number) => '-'.repeat(Math.max(3, w));

  const lines: string[] = [];
  const headerCols: string[] = [];
  for (const c of visibleCols) {
    headerCols.push(padRight(headers[c], widths[c]!));
  }
  lines.push(headerCols.join(sep));

  const dashCols: string[] = [];
  for (const c of visibleCols) {
    dashCols.push(dash(widths[c]!));
  }
  lines.push(dashCols.join(sep));

  for (const r of rows) {
    const rowCols: string[] = [];
    for (const c of visibleCols) {
      let val = '';
      if (c === 'title') val = truncate(r.title, widths.title!);
      else val = (r as any)[c] ?? '';
      rowCols.push(padRight(val, widths[c]!));
    }

    const rawLine = rowCols.join(sep);

    const blockersNumber = Number(r.blockers);
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
