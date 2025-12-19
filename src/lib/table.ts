export type IssueForTable = {
  id: string;
  title?: string;
  priority?: number;
  assignee?: string;
  dependency_count?: number;
  dependent_count?: number;
  dependencies?: Array<{ type?: string; depends_on_id?: string }>;
};

function computeBlockersCount(issue: IssueForTable): number {
  if (typeof issue.dependency_count === 'number') return issue.dependency_count;

  const deps = issue.dependencies;
  if (!deps || !Array.isArray(deps)) return 0;
  return deps.filter((d) => (d?.type || '').toLowerCase() === 'blocks').length;
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
};

export function renderIssuesTable(issues: IssueForTable[], options: RenderIssuesTableOptions = {}): string {
  if (!issues.length) return '';

  const rows = issues
    .map((i) => {
      const blockers = computeBlockersCount(i);
      const blocks = computeBlocksCount(i);
      return {
        id: i.id,
        title: i.title ?? '(no title)',
        priority: typeof i.priority === 'number' ? String(i.priority) : '',
        blockers: String(blockers),
        blocks: String(blocks),
        assignee: typeof i.assignee === 'string' ? i.assignee : '',
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  const maxTitleWidth = 60;

  const headers = {
    id: 'ID',
    title: 'Title',
    priority: 'Priority',
    blockers: 'Blockers',
    blocks: 'Blocks',
    assignee: 'Assignee',
  };

  const widths = {
    id: Math.max(headers.id.length, ...rows.map((r) => r.id.length)),
    title: Math.min(
      maxTitleWidth,
      Math.max(headers.title.length, ...rows.map((r) => r.title.length)),
    ),
    priority: Math.max(headers.priority.length, ...rows.map((r) => r.priority.length)),
    blockers: Math.max(headers.blockers.length, ...rows.map((r) => r.blockers.length)),
    blocks: Math.max(headers.blocks.length, ...rows.map((r) => r.blocks.length)),
    assignee: Math.max(headers.assignee.length, ...rows.map((r) => r.assignee.length)),
  };

  const dash = (w: number) => '-'.repeat(Math.max(3, w));

  const lines: string[] = [];
  lines.push(
    [
      padRight(headers.id, widths.id),
      padRight(headers.title, widths.title),
      padRight(headers.priority, widths.priority),
      padRight(headers.blockers, widths.blockers),
      padRight(headers.blocks, widths.blocks),
      padRight(headers.assignee, widths.assignee),
    ].join('  '),
  );
  lines.push(
    [
      dash(widths.id),
      dash(widths.title),
      dash(widths.priority),
      dash(widths.blockers),
      dash(widths.blocks),
      dash(widths.assignee),
    ].join('  '),
  );

  for (const r of rows) {
    const rawLine = [
      padRight(r.id, widths.id),
      padRight(truncate(r.title, widths.title), widths.title),
      padRight(r.priority, widths.priority),
      padRight(r.blockers, widths.blockers),
      padRight(r.blocks, widths.blocks),
      padRight(r.assignee, widths.assignee),
    ].join('  ');

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
