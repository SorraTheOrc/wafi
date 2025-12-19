import { readFileSync } from 'fs';
import { resolve } from 'path';
import { spawnSync } from 'child_process';
import { Command } from 'commander';
import { CliError } from '../types.js';
import { emitJson, logStdout } from '../lib/io.js';
import { renderInProgressIssuesTable } from '../lib/table.js';

interface Issue {
  id: string;
  title?: string;
  description?: string;
  status?: string;
  priority?: number;
  created_at?: string;
  dependencies?: Array<{ type?: string; depends_on_id?: string }>; // best-effort shape
  [key: string]: unknown;
}

type BvPriorityEntry = { id: string; score?: number; rank?: number; rationale?: string };

type IssuesSource = 'bd' | 'jsonl' | 'env';
type BvSource = 'bv' | 'env' | 'none';

type LoadResult = { issues: Issue[]; source: IssuesSource };
type BvResult = { scores: Map<string, BvPriorityEntry>; source: BvSource };

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

function loadInProgressIssues(verbose: boolean): Issue[] {
  const envJson = process.env.WAIF_IN_PROGRESS_JSON;
  if (envJson) {
    try {
      const parsed = JSON.parse(envJson);
      if (Array.isArray(parsed)) return parsed as Issue[];
    } catch (e) {
      if (verbose) process.stderr.write(`[debug] failed to parse WAIF_IN_PROGRESS_JSON: ${(e as Error).message}\n`);
    }
    return [];
  }

  if (!isCliAvailable('bd')) return [];
  try {
    const out = runBd(['list', '--status', 'in_progress', '--json']);
    const parsed = JSON.parse(out);
    if (Array.isArray(parsed)) return parsed as Issue[];
  } catch (e) {
    if (verbose) process.stderr.write(`[debug] bd list in_progress failed: ${(e as Error).message}\n`);
  }
  return [];
}

function runBv(args: string[], timeout = 30000): string {
  return runSpawn('bv', args, timeout).stdout;
}

function isCliAvailable(cmd: string): boolean {
  const res = spawnSync(cmd, ['--version'], { encoding: 'utf8', timeout: 2000 });
  if (res.error) return false;
  if (typeof res.status === 'number' && res.status !== 0) return false;
  return true;
}

function parseIssuesFromJsonl(path: string, verbose: boolean): Issue[] {
  const resolved = resolve(path);
  if (verbose) process.stderr.write(`[debug] loading issues from ${resolved}\n`);
  const raw = readFileSync(resolved, 'utf8');
  return raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as Issue;
      } catch (e) {
        if (verbose) process.stderr.write(`[debug] skipping unparsable line: ${line}\n`);
        return null;
      }
    })
    .filter((v): v is Issue => Boolean(v));
}

function loadIssues(verbose: boolean): LoadResult {
  const envPath = process.env.WAIF_ISSUES_PATH;
  if (envPath) {
    return { issues: parseIssuesFromJsonl(envPath, verbose), source: 'env' };
  }

  if (isCliAvailable('bd')) {
    try {
      const out = runBd(['ready', '--json']);
      const parsed = JSON.parse(out);
      if (Array.isArray(parsed)) {
        return { issues: parsed as Issue[], source: 'bd' };
      }
    } catch (e) {
      if (verbose) process.stderr.write(`[debug] bd ready failed: ${(e as Error).message}\n`);
    }
  }

  // fallback to jsonl file
  return { issues: parseIssuesFromJsonl('.beads/issues.jsonl', verbose), source: 'jsonl' };
}

function loadBvScores(verbose: boolean): BvResult {
  // Env override for tests or offline usage
  const envJson = process.env.WAIF_BV_PRIORITY_JSON;
  if (envJson) {
    try {
      const parsed = JSON.parse(envJson);
      const scores = Array.isArray(parsed)
        ? (parsed as BvPriorityEntry[])
        : Array.isArray(parsed?.items)
          ? (parsed.items as BvPriorityEntry[])
          : [];
      const map = new Map(scores.filter((s) => s.id).map((s) => [s.id, s] as const));
      return { scores: map, source: 'env' };
    } catch (e) {
      if (verbose) process.stderr.write(`[debug] failed to parse WAIF_BV_PRIORITY_JSON: ${(e as Error).message}\n`);
    }
  }

  if (isCliAvailable('bv')) {
    try {
      const out = runBv(['--robot-priority', '--json']);
      const parsed = JSON.parse(out);
      const items = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.items) ? parsed.items : [];
      const map = new Map((items as BvPriorityEntry[]).filter((s) => s.id).map((s) => [s.id, s] as const));
      return { scores: map, source: 'bv' };
    } catch (e) {
      if (verbose) process.stderr.write(`[debug] bv priority unavailable: ${(e as Error).message}\n`);
    }
  }

  return { scores: new Map(), source: 'none' };
}

function isBlocked(issue: Issue): boolean {
  if (!issue.dependencies || !Array.isArray(issue.dependencies)) return false;
  return issue.dependencies.some((d) => (d?.type || '').toLowerCase() === 'blocks');
}

function eligible(issue: Issue): boolean {
  const status = (issue.status || '').toLowerCase();
  if (!(status === 'open' || status === 'in_progress')) return false;
  return !isBlocked(issue);
}

function computeScore(issue: Issue, bv: BvResult): { score: number; rationale: string; metadata: Record<string, unknown> } {
  const bvEntry = bv.scores.get(issue.id);
  if (bvEntry && typeof bvEntry.score === 'number') {
    return {
      score: bvEntry.score,
      rationale: bvEntry.rationale || 'bv priority score',
      metadata: { source: bv.source, rank: bvEntry.rank ?? null },
    };
  }

  const priority = typeof issue.priority === 'number' ? issue.priority : 2;
  const createdAt = issue.created_at ? Date.parse(issue.created_at) : Number.MAX_SAFE_INTEGER;
  const priorityScore = (5 - priority) * 1_000_000;
  const recencyScore = createdAt === Number.MAX_SAFE_INTEGER ? 0 : -createdAt / 1000;
  const score = priorityScore + recencyScore;
  const rationaleParts = [`priority ${priority}`];
  if (createdAt !== Number.MAX_SAFE_INTEGER) rationaleParts.push('earlier created');
  return {
    score,
    rationale: rationaleParts.join(' + '),
    metadata: { priority, created_at: issue.created_at ?? null, tie_break: 'created_at' },
  };
}

function selectTop(issues: Issue[], bv: BvResult, verbose: boolean) {
  const candidates = issues.filter(eligible);
  if (!candidates.length) {
    throw new CliError('No eligible issues found (need open, unblocked issues)', 1);
  }
  const scored = candidates.map((issue) => {
    const { score, rationale, metadata } = computeScore(issue, bv);
    return { issue, score, rationale, metadata };
  });
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.issue.id.localeCompare(b.issue.id);
  });
  if (verbose) {
    scored.slice(0, 5).forEach((s, idx) => {
      process.stderr.write(`[debug] rank ${idx + 1}: ${s.issue.id} score=${s.score} (${s.rationale})\n`);
    });
  }
  return scored[0];
}

export function createNextCommand() {
  const cmd = new Command('next');
  cmd
    .description('Return the single best open, unblocked issue to work on now')
    .option('--json', 'Emit JSON output')
    .option('--verbose', 'Emit debug logs to stderr')
    .action((options, command) => {
      const jsonOutput = Boolean(options.json ?? command.parent?.getOptionValue('json'));
      const verbose = Boolean(options.verbose ?? command.parent?.getOptionValue('verbose'));

      const { issues, source } = loadIssues(verbose);
      const bv = loadBvScores(verbose);
      const top = selectTop(issues, bv, verbose);
      const waif = {
        score: top.score,
        rationale: top.rationale,
        rank: 1,
        metadata: { ...top.metadata, issuesSource: source, bvSource: bv.source },
      };

      if (jsonOutput) {
        const payload = { ...top.issue, waif };
        emitJson(payload);
      } else {
        const inProgress = loadInProgressIssues(verbose);
        if (inProgress.length) {
          logStdout('In Progress');
          logStdout(renderInProgressIssuesTable(inProgress));
          logStdout('');
        }

        let rendered: string | null = null;
        if (isCliAvailable('bd')) {
          try {
            const shown = runBd(['show', top.issue.id]);
            rendered = `${top.rationale}\n${shown.trim()}`;
          } catch (e) {
            if (verbose) process.stderr.write(`[debug] bd show failed: ${(e as Error).message}\n`);
          }
        }
        if (!rendered) {
          const title = top.issue.title ?? '(no title)';
          rendered = `${top.issue.id}: ${title} — ${top.rationale}`;
        }
        logStdout(rendered);
      }

    });

  return cmd;
}
