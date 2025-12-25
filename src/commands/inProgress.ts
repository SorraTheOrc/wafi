import { readFileSync } from 'fs';
import { resolve } from 'path';
import { spawnSync } from 'child_process';
import { Command } from 'commander';
import { emitJson, logStdout } from '../lib/io.js';
import { renderIssuesTable } from '../lib/table.js';
import {
  renderBlockersSection,
  renderChildrenSection,
  type IssueWithRelations,
} from '../lib/relations.js';

interface Issue extends IssueWithRelations {
  id: string;
  description?: string;
  created_at?: string;
  updated_at?: string;
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
        const blockers = renderBlockersSection(issue);
        if (blockers) sections.push(blockers);
        const children = renderChildrenSection(issue);
        if (children) sections.push(children);
        return sections.join('\n');
      })
      .join('\n\n');
    return `${baseTable}\n\n${fallbackSections}`;
  }

  const combined: string[] = [...headerLines];
  for (let idx = 0; idx < sortedIssues.length; idx += 1) {
    combined.push(rowLines[idx]);
    const blockers = renderBlockersSection(sortedIssues[idx]);
    if (blockers) combined.push(blockers);
    const children = renderChildrenSection(sortedIssues[idx]);
    if (children) combined.push(children);
    combined.push('');
  }

  return combined.join('\n').trimEnd();
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
