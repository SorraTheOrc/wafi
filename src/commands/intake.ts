import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { Command } from 'commander';
import { CliError } from '../types.js';
import { emitJson, logStdout } from '../lib/io.js';
import * as bdLib from '../lib/bd.js';

function ensureParent(outPath: string, verbose: boolean) {
  const parent = dirname(outPath);
  if (!existsSync(parent)) {
    if (verbose) process.stderr.write(`[debug] creating directory ${parent}\n`);
    mkdirSync(parent, { recursive: true });
  }
}

function defaultPrdForIssue(issueId: string, title?: string, description?: string) {
  return `<!-- Source issue: ${issueId} -->\n**Source issue: ${issueId}**\n\n${title ? `- **Title:** ${title}\n\n` : ''}${description ? `- **Issue description:**\n\n${description}\n\n` : ''}---\n\n# PRD\n\n## Summary\n\nTBD\n`;
}

export function createIntakeCommand() {
  const cmd = new Command('intake');
  cmd
    .description('Create an intake beads issue and optionally write a PRD')
    .option('--title <text>', 'Issue title')
    .option('--desc <text>', 'Issue description')
    .option('--prd <path>', 'Write a PRD file and link it')
    .option('--json', 'Emit JSON output')
    .option('--verbose', 'Emit debug logs to stderr')
    .action((options, command) => {
      const { title, desc, prd, json: localJson, verbose: localVerbose } = options as { title?: string; desc?: string; prd?: string; json?: boolean; verbose?: boolean };
      const jsonOutput = Boolean(localJson ?? command.parent?.getOptionValue('json'));
      const verbose = Boolean(localVerbose ?? command.parent?.getOptionValue('verbose'));

      if (!title) {
        throw new CliError('Missing required option --title', 2);
      }

      // Create the issue via bd or fallback to editing .beads/issues.jsonl
      let createdId: string | null = null;
      try {
        if (bdLib.isBdAvailable()) {
          // bd create "Title" --description "..." --json
          const out = (bdLib as any).runBdSync(['create', title, '--description', desc ?? '', '--json']);
          const parsed = JSON.parse(out);
          createdId = parsed.id || parsed.issue?.id || parsed.issue_id || parsed["id"];
          if (!createdId && Array.isArray(parsed) && parsed.length > 0 && parsed[0].id) createdId = parsed[0].id;
        } else {
          // fallback: append to .beads/issues.jsonl with a generated id
          const jsonlPath = resolve('.beads', 'issues.jsonl');
          const raw = (require('fs').readFileSync(jsonlPath, 'utf8') || '').split(/\r?\n/).filter(Boolean);
          // generate a simple id "wf-local-<timestamp>"
          const gen = `wf-local-${Date.now()}`;
          const obj = { id: gen, title: title, description: desc ?? '', status: 'open', priority: 2, issue_type: 'task', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
          raw.push(JSON.stringify(obj));
          require('fs').writeFileSync(jsonlPath, raw.join('\n') + '\n', 'utf8');
          createdId = gen;
        }
      } catch (e) {
        throw new CliError(`Failed to create beads issue: ${e instanceof Error ? e.message : String(e)}`, 1);
      }

      // If PRD requested, write it and cross-link
      let prdPathResolved: string | null = null;
      let linked = false;
      let linkMethod: 'bd' | 'jsonl' | 'none' = 'none';
      if (prd) {
        try {
          const resolved = resolve(prd);
          ensureParent(resolved, verbose);
          const content = defaultPrdForIssue(createdId as string, title, desc);
          writeFileSync(resolved, content, { encoding: 'utf8' });
          prdPathResolved = resolved;

          // Update beads issue with link
          try {
            const res = bdLib.updateIssueAddPrdLink(createdId as string, resolved);
            linked = res.updated;
            linkMethod = res.method;
          } catch (e) {
            if (verbose) process.stderr.write(`[debug] failed to update beads issue ${createdId}: ${e instanceof Error ? e.message : String(e)}\n`);
            linked = false;
            linkMethod = 'none';
          }
        } catch (e) {
          throw new CliError(`Failed to write PRD: ${e instanceof Error ? e.message : String(e)}`, 1);
        }
      }

      const result = { id: createdId, prd: prdPathResolved, linked };
      if (jsonOutput) {
        emitJson(result);
      } else {
        logStdout(`Created beads issue ${createdId}`);
        if (prdPathResolved) {
          logStdout(`Wrote PRD to ${prdPathResolved}`);
          if (linked) {
            logStdout(`Updated beads issue ${createdId} with PRD link (${linkMethod})`);
          } else {
            logStdout(`Did not update beads issue ${createdId}. To link manually run:`);
            logStdout(`  bd update ${createdId} --body-file - < ${prdPathResolved}`);
          }
        }
      }
    });

  return cmd;
}
