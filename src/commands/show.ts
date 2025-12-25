import { Command } from 'commander';
import { CliError } from '../types.js';
import { emitJson, logStdout } from '../lib/io.js';
import { showIssue } from '../lib/bd.js';
import { renderIssuesTable } from '../lib/table.js';

interface Issue {
  id: string;
  title?: string;
  status?: string;
  priority?: number;
  assignee?: string;
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

function renderBlockers(issue: Issue): string {
  const blockers = getBlockingDependencies(issue);
  if (!blockers.length) return '';

  const rendered = renderIssuesTable(blockers, { sort: 'id' });
  const indented = rendered
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n');
  return `  Blockers\n${indented}`;
}

function renderChildren(issue: Issue): string {
  const dependents = Array.isArray(issue.dependents)
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
          dependencies: Array.isArray(dep?.dependencies) ? (dep?.dependencies as Issue['dependencies']) : undefined,
        }))
        .filter((child) => Boolean(child.id))
    : [];

  const childrenField = Array.isArray(issue.children)
    ? issue.children
        .map((child) => ({
          id: child?.id ?? child?.depends_on_id ?? '',
          title: child?.title,
          status: typeof child?.status === 'string' ? child?.status : undefined,
          priority: typeof child?.priority === 'number' ? child?.priority : undefined,
          assignee: typeof child?.assignee === 'string' ? child?.assignee : undefined,
          dependency_count: typeof child?.dependency_count === 'number' ? child?.dependency_count : undefined,
          dependent_count: typeof child?.dependent_count === 'number' ? child?.dependent_count : undefined,
          dependencies: Array.isArray(child?.dependencies) ? (child?.dependencies as Issue['dependencies']) : undefined,
        }))
        .filter((child) => {
          if (!child.id) return false;
          const status = String(child.status ?? '').toLowerCase();
          if (status.length > 0 && TERMINAL_STATUSES.has(status)) return false;
          return true;
        })
    : [];

  const children = dependents.length ? dependents : childrenField;

  if (!children.length) return '';

  const rendered = renderIssuesTable(children as Issue[], { sort: 'id' });
  const indented = rendered
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n');
  return `  Children\n${indented}`;
}

export function createShowCommand() {
  const cmd = new Command('show');
  cmd
    .description('Show a beads issue with blockers and children')
    .argument('<id>', 'Beads issue id')
    .option('--json', 'Emit JSON output')
    .option('--verbose', 'Emit debug logs to stderr')
    .action((id: string, options, command) => {
      const jsonOutput = Boolean(options.json ?? command.parent?.getOptionValue('json'));
      if (!id) {
        throw new CliError('issue id is required', 2);
      }

      let issue: Issue;
      try {
        const out = showIssue(id);
        issue = Array.isArray(out) ? (out[0] as Issue) : (out as Issue);
      } catch (e) {
        const err = e as any;
        const rawMsg = err?.stderr || err?.message || String(err);
        const exitCode = typeof err?.exitCode === 'number' ? err.exitCode : 1;
        if (rawMsg && /no issue found/i.test(rawMsg)) {
          throw new CliError(`Issue ${id} not found`, exitCode);
        }
        throw new CliError(`bd show failed for ${id}: ${rawMsg}`, exitCode);
      }

      if (jsonOutput) {
        emitJson(issue);
        return;
      }

      const main = renderIssuesTable([issue], { sort: 'none' });
      logStdout(main);

      const blockersSection = renderBlockers(issue);
      if (blockersSection) {
        logStdout(blockersSection);
      }

      const childrenSection = renderChildren(issue);
      if (childrenSection) {
        logStdout(childrenSection);
      }
    });

  return cmd;
}
