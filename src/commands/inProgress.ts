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
      if (Array.isArray(parsed)) return { issues: parsed as Issue[], source: 'bd' };
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

      const { issues, source } = loadInProgressIssues(verbose);

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

      logStdout(renderIssuesTable(issues));
    });

  return cmd;
}
