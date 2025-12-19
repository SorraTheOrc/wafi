import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { Command } from 'commander';
import { CliError, PrdResult } from '../types.js';
import { emitJson, logStdout } from '../lib/io.js';
import * as bdLib from '../lib/bd.js';

function ensureParent(outPath: string, verbose: boolean) {
  const parent = dirname(outPath);
  if (!existsSync(parent)) {
    if (verbose) {
      process.stderr.write(`[debug] creating directory ${parent}\n`);
    }
    mkdirSync(parent, { recursive: true });
  }
}

function buildPrdContent(seed?: { id: string; title?: string; description?: string }) {
  let content = `# PRD\n\n## Summary\n\nTBD\n\n`;
  if (seed) {
    content = `<!-- Seed Context (from ${seed.id}) -->\n` +
      `**Source issue: ${seed.id}**\n\n` +
      (seed.title ? `- **Title:** ${seed.title}\n` : '') +
      (seed.description ? `- **Issue description:**\n\n${seed.description}\n\n` : '') +
      `---\n\n` +
      content;
  }
  return content;
}

export function createPrdCommand() {
  const cmd = new Command('prd');
  cmd
    .description('PRD generation commands')
    .option('--out <path>', 'Path to write PRD stub')
    .option('--issue <id>', 'Beads issue id to seed PRD')
    .option('--json', 'Emit JSON output')
    .option('--verbose', 'Emit debug logs to stderr')
    .action((options, command) => {
      const { out, issue, json: localJson, verbose: localVerbose } = options as { out?: string; issue?: string; json?: boolean; verbose?: boolean };
      const jsonOutput = Boolean(localJson ?? command.parent?.getOptionValue('json'));
      const verbose = Boolean(localVerbose ?? command.parent?.getOptionValue('verbose'));

      if (!out) {
        throw new CliError('Missing required option --out', 2);
      }

      const resolved = resolve(out as string);
      if (verbose) {
        process.stderr.write(`[debug] prd --out resolved to ${resolved}\n`);
      }

      // Prepare seed
      let seed: { id: string; title?: string; description?: string } | undefined;
      if (issue) {
        try {
          const info = bdLib.showIssue(issue);
          seed = { id: info.id || issue, title: info.title, description: info.description };
        } catch (e) {
          // If bd is not available or show failed, surface error but allow PRD to be written without seed
          if (verbose) {
            process.stderr.write(`[debug] failed to fetch issue ${issue}: ${e instanceof Error ? e.message : String(e)}\n`);
          }
          throw new CliError(`Failed to fetch beads issue ${issue}: ${e instanceof Error ? e.message : String(e)}`, 1);
        }
      }

      try {
        ensureParent(resolved, verbose);
        const content = buildPrdContent(seed);
        writeFileSync(resolved, content, { encoding: 'utf8' });
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to write PRD';
        throw new CliError(msg, 1);
      }

      let updated = false;
      let updateMethod: 'bd' | 'jsonl' | 'none' = 'none';
      if (issue) {
        try {
          const res = bdLib.updateIssueAddPrdLink(issue, resolved);
          updated = res.updated;
          updateMethod = res.method;
        } catch (e) {
          if (verbose) {
            process.stderr.write(`[debug] failed to update beads issue ${issue}: ${e instanceof Error ? e.message : String(e)}\n`);
          }
          // leave updated=false but provide fallback instructions
          updated = false;
          updateMethod = 'none';
        }
      }

      // Determine stub flag: when no issue provided, we keep the previous "stub" behavior
      const isStub = !issue;
      const result: PrdResult = { out: resolved, stub: isStub };
      if (issue) {
        (result as any).sourceIssue = issue;
        (result as any).linked = updated;
        (result as any).linkMethod = updateMethod;
      }

      if (jsonOutput) {
        emitJson(result);
      } else {
        if (isStub) {
          logStdout(`Wrote PRD stub to ${resolved}`);
        } else {
          logStdout(`Wrote PRD to ${resolved}`);
        }

        if (issue) {
          if (updated) {
            logStdout(`Updated beads issue ${issue} with PRD link (${updateMethod})`);
          } else {
            logStdout(`Did not update beads issue ${issue}. To link manually run:`);
            logStdout(`  bd update ${issue} --body-file - < ${resolved}`);
          }
        }
      }
    });

  return cmd;
}
