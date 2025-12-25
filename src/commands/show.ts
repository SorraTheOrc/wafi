import { Command } from 'commander';
import { CliError } from '../types.js';
import { emitJson, logStdout } from '../lib/io.js';
import { showIssue } from '../lib/bd.js';
import { renderIssuesTable } from '../lib/table.js';
import {
  renderBlockersSection,
  renderChildrenSection,
  type IssueWithRelations,
} from '../lib/relations.js';

interface Issue extends IssueWithRelations {
  id: string;
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

      const blockersSection = renderBlockersSection(issue);
      if (blockersSection) {
        logStdout(blockersSection);
      }

      const childrenSection = renderChildrenSection(issue);
      if (childrenSection) {
        logStdout(childrenSection);
      }
    });

  return cmd;
}
