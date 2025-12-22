import { readFileSync } from 'fs';
import { resolve } from 'path';
import { spawnSync } from 'child_process';
import { Command } from 'commander';
import { emitJson, logStdout } from '../lib/io.js';
import { renderIssuesTable } from '../lib/table.js';

interface Issue {
  id: string;
  title?: string;
  description?: string;
  status?: string;
  priority?: number;
  created_at?: string;
  updated_at?: string;
  assignee?: string;
  dependency_count?: number;
  dependent_count?: number;
  dependencies?: Array<{
    id?: string;
    title?: string;
    status?: string;
    dependency_type?: string;
    type?: string;
    depends_on_id?: string;
    priority?: number;
    assignee?: string;
    dependency_count?: number;
    dependent_count?: number;
    dependencies?: Issue['dependencies'];
  }>;
  dependents?: Array<{
    id?: string;
    title?: string;
    status?: string;
    dependency_type?: string;
    type?: string;
    depends_on_id?: string;
    priority?: number;
    assignee?: string;
    dependency_count?: number;
    dependent_count?: number;
    dependencies?: Issue['dependencies'];
  }>;

  [key: string]: unknown;
}

type IssuesSource = 'bd' | 'jsonl' | 'env';

type LoadResult = { issues: Issue[]; source: IssuesSource };

function runSpawn(cmd: string, args: string[], timeout = 30000): { stdout: string } {
  const res = spawnSync(cmd, args, { encoding: 'utf8', timeout });
  if (res.error) {
    const err: any = new Error(`${cmd} spawn error: ${res.error.message}`);
    (err as any).original = res.error;
    throw err;
  }
  if (res.status !== 0) {
    const stderr = res.stderr ? String(res.stderr) : '';
    const stdout = res.stdout ? String(res.stdout) : '';
    const err: any = new Error(`${cmd} exited ${res.status}: ${stderr || stdout}`);
    err.exitCode = res.status;
    err.stdout = stdout;
    err.stderr = stderr;
    throw err;
  }
  return { stdout: res.stdout ?? '' };
}

function isCliAvailable(cmd: string): boolean {
  const res = spawnSync(cmd, ['--version'], { encoding: 'utf8', timeout: 2000 });
  if (res.error) return false;
  if (typeof res.status === 'number' && res.status !== 0) return false;
  return true;
}

function runBd(args: string[], timeout = 30000): string {
  return runSpawn('bd', args, timeout).stdout;
}

function parseIssuesFromJsonl(path: string): Issue[] {
  const raw = readFileSync(resolve(path), 'utf8');
  return raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as Issue;
      } catch {
        return null;
      }
    })
    .filter((v): v is Issue => Boolean(v));
}

function enrichIssuesWithDependencies(issues: Issue[], verbose: boolean): Issue[] {
  if (!issues.length) return issues;

  try {
    const ids = issues.map((i) => i.id).filter(Boolean);
    if (!ids.length) return issues;

    const chunkSize = 40;
    const hydrated = new Map<string, Issue>();

    for (let idx = 0; idx < ids.length; idx += chunkSize) {
      const chunk = ids.slice(idx, idx + chunkSize);
      const out = runBd(['show', ...chunk, '--json']);
      const parsed = JSON.parse(out);
      const list = Array.isArray(parsed) ? (parsed as Issue[]) : [parsed as Issue];
      for (const issue of list) {
        if (issue?.id) hydrated.set(issue.id, issue);
      }
    }

    return issues.map((issue) => {
      const full = hydrated.get(issue.id);
      return full ? { ...issue, ...full } : issue;
    });
  } catch (e) {
    if (verbose) process.stderr.write(`[debug] bd show enrichment failed: ${(e as Error).message}\n`);
    return issues;
  }
}

function loadInProgressIssues(verbose: boolean): LoadResult {
  const envJson = process.env.WAIF_IN_PROGRESS_JSON;
  if (envJson) {
    try {
      const parsed = JSON.parse(envJson);
      if (Array.isArray(parsed)) return { issues: parsed as Issue[], source: 'env' };
    } catch (e) {
      if (verbose) process.stderr.write(`[debug] failed to parse WAIF_IN_PROGRESS_JSON: ${(e as Error).message}\n`);
    }
    return { issues: [], source: 'env' };
  }

  if (isCliAvailable('bd')) {
    try {
      const out = runBd(['list', '--status', 'in_progress', '--json']);
      const parsed = JSON.parse(out);
      if (Array.isArray(parsed)) {
        const issues = enrichIssuesWithDependencies(parsed as Issue[], verbose);
        return { issues, source: 'bd' };
      }
    } catch (e) {
      if (verbose) process.stderr.write(`[debug] bd list in_progress failed: ${(e as Error).message}\n`);
    }
  }

  try {
    const issues = parseIssuesFromJsonl('.beads/issues.jsonl').filter(
      (i) => String(i.status ?? '').toLowerCase() === 'in_progress',
    );
    return { issues, source: 'jsonl' };
  } catch (e) {
    if (verbose) {
      process.stderr.write(`[debug] failed to read .beads/issues.jsonl: ${(e as Error).message}\n`);
    }
    return { issues: [], source: 'jsonl' };
  }
}

const TERMINAL_STATUSES = new Set(['closed', 'done', 'tombstone']);

function getBlockingDependencies(issue: Issue): Issue[] {
  if (!issue?.dependencies || !Array.isArray(issue.dependencies)) return [];

  const blockers: Issue[] = [];
  for (const dep of issue.dependencies) {
    if (!dep) continue;
    const dependencyType = String(dep.dependency_type ?? dep.type ?? '').toLowerCase();
    if (dependencyType !== 'blocks') continue;
    const depId = dep.id || dep.depends_on_id;
    if (!depId) continue;

    const status = String(dep.status ?? '').toLowerCase();
    if (status.length > 0 && TERMINAL_STATUSES.has(status)) continue;

    blockers.push({
      id: depId,
      title: dep.title,
      status: typeof dep.status === 'string' ? dep.status : undefined,
      priority: typeof dep.priority === 'number' ? dep.priority : undefined,
      assignee: typeof dep.assignee === 'string' ? dep.assignee : undefined,
      dependency_count: typeof dep.dependency_count === 'number' ? dep.dependency_count : undefined,
      dependent_count: typeof dep.dependent_count === 'number' ? dep.dependent_count : undefined,
      dependencies: Array.isArray(dep.dependencies) ? (dep.dependencies as Issue['dependencies']) : undefined,
    });
  }
  return blockers;
}

function renderBlockersForIssue(issue: Issue): string {
  const blockers = getBlockingDependencies(issue);
  if (!blockers.length) return '';

  const rendered = renderIssuesTable(blockers, { sort: 'id' });
  const indented = rendered
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n');
  return `  Blockers\n${indented}`;
}







function renderChildrenForIssue(issue: Issue): string {
  const children = Array.isArray(issue.dependents)
    ? issue.dependents
        .filter((dep) => {
          const relation = String(dep?.dependency_type ?? dep?.type ?? '').toLowerCase();
          if (relation !== 'parent-child') return false;
          const status = String(dep?.status ?? '').toLowerCase();
          if (status.length > 0 && TERMINAL_STATUSES.has(status)) return false;
          return true;
        })
        .map((dep) => ({
          id: dep?.id ?? dep?.depends_on_id ?? '',
          title: dep?.title,
          status: typeof dep?.status === 'string' ? dep?.status : undefined,
          priority: typeof dep?.priority === 'number' ? dep?.priority : undefined,
          assignee: typeof dep?.assignee === 'string' ? dep?.assignee : undefined,
          dependency_count: typeof dep?.dependency_count === 'number' ? dep?.dependency_count : undefined,
          dependent_count: typeof dep?.dependent_count === 'number' ? dep?.dependent_count : undefined,
          dependencies: Array.isArray(dep?.dependencies)
            ? (dep?.dependencies as Issue['dependencies'])
            : undefined,
        }))
        .filter((child) => Boolean(child.id))
    : [];

  if (!children.length) return '';

  const rendered = renderIssuesTable(children as Issue[], { sort: 'id' });
  const indented = rendered
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n');
  return `  Children\n${indented}`;
}

function renderIssuesTableWithRelatedSections(issues: Issue[]): string {
  const baseTable = renderIssuesTable(issues);
  if (!baseTable) return '';

  const lines = baseTable.split('\n');
  if (lines.length <= 2) return baseTable;

  const headerLines = lines.slice(0, 2);
  const rowLines = lines.slice(2);
  const sortedIssues = [...issues].sort((a, b) => a.id.localeCompare(b.id));

  if (rowLines.length !== sortedIssues.length) {
    // Fallback to original behavior to avoid mismatched output.
    const fallbackSections = sortedIssues
      .map((issue) => {
        const sections = [issue.id];
        const blockers = renderBlockersForIssue(issue);
        if (blockers) sections.push(blockers);
        const children = renderChildrenForIssue(issue);
        if (children) sections.push(children);
        return sections.join('\n');
      })
      .join('\n\n');
    return `${baseTable}\n\n${fallbackSections}`;
  }

  const combined: string[] = [...headerLines];
  for (let idx = 0; idx < sortedIssues.length; idx += 1) {
    combined.push(rowLines[idx]);
    const blockers = renderBlockersForIssue(sortedIssues[idx]);
    if (blockers) combined.push(blockers);
    const children = renderChildrenForIssue(sortedIssues[idx]);
    if (children) combined.push(children);
    combined.push('');
  }

  return combined.join('\n').trimEnd();
}

export function createInProgressCommand() {
  const cmd = new Command('in-progress');
  cmd
    .description('List all in-progress beads issues')
    .option('--json', 'Emit JSON output')
    .option('--verbose', 'Emit debug logs to stderr')
    .action((options, command) => {
      const jsonOutput = Boolean(options.json ?? command.parent?.getOptionValue('json'));
      const verbose = Boolean(options.verbose ?? command.parent?.getOptionValue('verbose'));

      const { issues } = loadInProgressIssues(verbose);

      if (jsonOutput) {
        emitJson(issues);
        return;
      }

      logStdout('# In Progress');
      logStdout('');
      if (!issues.length) {
        logStdout('No in-progress issues.');
        return;
      }

      logStdout(renderIssuesTableWithRelatedSections(issues));
    });

  return cmd;
}
