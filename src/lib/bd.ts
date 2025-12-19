import { spawnSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

function runBdSync(args: string[], input?: string, timeout = 30000) {
  const res = spawnSync('bd', args, { encoding: 'utf8', input, timeout });
  if (res.error) {
    const err: any = new Error(`bd spawn error: ${res.error.message}`);
    // attach original error for callers
    (err as any).original = res.error;
    throw err;
  }

  if (res.status !== 0) {
    const stderr = res.stderr ? String(res.stderr) : '';
    const stdout = res.stdout ? String(res.stdout) : '';
    const err: any = new Error(`bd exited ${res.status}: ${stderr || stdout}`);
    err.exitCode = res.status;
    err.stdout = stdout;
    err.stderr = stderr;
    throw err;
  }

  return res.stdout ?? '';
}

export function isBdAvailable(): boolean {
  try {
    // "bd --version" may print to stdout or stderr; just check that the command runs
    spawnSync('bd', ['--version'], { encoding: 'utf8', timeout: 2000 });
    return true;
  } catch (e) {
    return false;
  }
}

export function showIssue(issueId: string): any {
  const out = runBdSync(['show', issueId, '--json']);
  try {
    return JSON.parse(out);
  } catch (e) {
    const err: any = new Error('Failed to parse bd show --json output');
    err.raw = out;
    throw err;
  }
}

export function updateIssueAddPrdLink(issueId: string, prdPath: string): { updated: boolean; method: 'bd' | 'jsonl' } {
  // Prefer bd CLI
  if (isBdAvailable()) {
    // Fetch current issue and description
    const issue = showIssue(issueId);
    const curDesc = (issue.description ?? '') as string;
    const linkLine = `Linked PRD: ${prdPath}`;
    if (curDesc.includes(linkLine)) {
      return { updated: false, method: 'bd' };
    }

    const newDesc = curDesc.trim().length > 0 ? `${curDesc.trim()}\n\n${linkLine}` : linkLine;
    // bd update <id> --body-file - (read from stdin)
    try {
      runBdSync(['update', issueId, '--body-file', '-'], newDesc);
      return { updated: true, method: 'bd' };
    } catch (e) {
      // bubble up to allow caller to fallback
      throw e;
    }
  }

  // Fallback: edit .beads/issues.jsonl
  const jsonlPath = resolve('.beads', 'issues.jsonl');
  const raw = readFileSync(jsonlPath, { encoding: 'utf8' });
  const lines = raw.split(/\r?\n/).filter(Boolean);
  let changed = false;
  const outLines = lines.map((l) => {
    try {
      const obj = JSON.parse(l);
      if (obj.id === issueId) {
        const cur = obj.description ?? '';
        const linkLine = `Linked PRD: ${prdPath}`;
        if (!cur.includes(linkLine)) {
          obj.description = (String(cur).trim().length > 0 ? `${String(cur).trim()}\n\n${linkLine}` : linkLine);
          changed = true;
        }
        return JSON.stringify(obj);
      }
      return l;
    } catch (e) {
      return l;
    }
  });

  if (changed) {
    writeFileSync(jsonlPath, outLines.join('\n') + '\n', { encoding: 'utf8' });
    return { updated: true, method: 'jsonl' };
  }

  return { updated: false, method: 'jsonl' };
}
