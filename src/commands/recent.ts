import { readFileSync } from 'fs';
import { resolve } from 'path';
import { spawnSync } from 'child_process';
import { Command } from 'commander';
import { CliError } from '../types.js';
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
  dependencies?: Array<{ type?: string; depends_on_id?: string }>;
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

function runBd(args: string[], timeout = 30000): string {
  return runSpawn('bd', args, timeout).stdout;
}

function isCliAvailable(cmd: string): boolean {
  const res = spawnSync(cmd, ['--version'], { encoding: 'utf8', timeout: 2000 });
  if (res.error) return false;
  if (typeof res.status === 'number' && res.status !== 0) return false;
  return true;
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

function loadIssues(): LoadResult {
  const envPath = process.env.WAIF_ISSUES_PATH;
  if (envPath) {
    return { issues: parseIssuesFromJsonl(envPath), source: 'env' };
  }

  if (isCliAvailable('bd')) {
    try {
      const out = runBd(['list', '--json']);
      const parsed = JSON.parse(out);
      if (Array.isArray(parsed)) return { issues: parsed as Issue[], source: 'bd' };
    } catch {
      // fall through
    }
  }

  return { issues: parseIssuesFromJsonl('.beads/issues.jsonl'), source: 'jsonl' };
}

function parseDate(value: unknown): number {
  if (typeof value !== 'string') return Number.NaN;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : Number.NaN;
}

function mostRecentTimestamp(issue: Issue): number {
  const updated = parseDate(issue.updated_at);
  if (Number.isFinite(updated)) return updated;
  const created = parseDate(issue.created_at);
  if (Number.isFinite(created)) return created;
  return -Infinity;
}

function selectRecent(issues: Issue[], n: number): Issue[] {
  const sorted = issues
    .filter((i) => Boolean(i?.id))
    .slice()
    .sort((a, b) => {
      const at = mostRecentTimestamp(a);
      const bt = mostRecentTimestamp(b);
      if (bt !== at) return bt - at;
      return a.id.localeCompare(b.id);
    });
  return sorted.slice(0, n);
}

function fetchFullIssuesIfPossible(issues: Issue[], source: IssuesSource): Issue[] {
  if (source !== 'bd') return issues;
  if (!isCliAvailable('bd')) return issues;

  const full: Issue[] = [];
  for (const issue of issues) {
    try {
      const out = runBd(['show', issue.id, '--json']);
      const parsed = JSON.parse(out);
      if (parsed && typeof parsed === 'object') {
        full.push(parsed as Issue);
      } else {
        full.push(issue);
      }
    } catch {
      full.push(issue);
    }
  }
  return full;
}

export function createRecentCommand() {
  const cmd = new Command('recent');
  cmd
    .description('List the most recently modified beads issues')
    .option('-n, --n <count>', 'How many issues to return (default: 3)', '3')
    .option('--json', 'Emit JSON output')
    .option('--verbose', 'Emit debug logs to stderr')
    .action((options, command) => {
      const jsonOutput = Boolean(options.json ?? command.parent?.getOptionValue('json'));

      const nRaw = options.n as string | undefined;
      const n = nRaw ? Number.parseInt(nRaw, 10) : 3;
      if (!Number.isFinite(n) || n <= 0) {
        throw new CliError(`Invalid --n value: ${nRaw}`, 2);
      }

      const { issues, source } = loadIssues();
      const selected = selectRecent(issues, n);
      if (!selected.length) {
        throw new CliError('No issues found', 1);
      }

      if (jsonOutput) {
        emitJson(fetchFullIssuesIfPossible(selected, source));
        return;
      }

      logStdout('# Recent Issues');
      logStdout('');
      logStdout(renderIssuesTable(selected, { sort: 'none' }));
    });

  return cmd;
}
