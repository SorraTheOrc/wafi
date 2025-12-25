import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { Command } from 'commander';
import { CliError, PrdResult } from '../types.js';
import { emitJson, logStdout } from '../lib/io.js';

function writeStub(outPath: string, verbose: boolean) {
  const parent = dirname(outPath);
  if (!existsSync(parent)) {
    if (verbose) {
      process.stderr.write(`[debug] creating directory ${parent}\n`);
    }
    mkdirSync(parent, { recursive: true });
  }

  const stub = `# PRD\n\n## Summary\n\nTBD\n`;
  writeFileSync(outPath, stub, { encoding: 'utf8' });
}

export function createPrdCommand() {
  const cmd = new Command('prd');
  cmd
    .description('PRD generation commands')
    .option('--out <path>', 'Path to write PRD stub')
    .option('--json', 'Emit JSON output')
    .option('--verbose', 'Emit debug logs to stderr')
    .action((options, command) => {
      const { out, json: localJson, verbose: localVerbose } = options as { out?: string; json?: boolean; verbose?: boolean };
      const jsonOutput = Boolean(localJson ?? command.parent?.getOptionValue('json'));
      const verbose = Boolean(localVerbose ?? command.parent?.getOptionValue('verbose'));

      if (!out) {
        // Commander shows help and exit code 1 by default for missing required option; align to 2
        throw new CliError('Missing required option --out', 2);
      }

      const resolved = resolve(out as string);
      if (verbose) {
        process.stderr.write(`[debug] writing stub to ${resolved}\n`);
      }

      try {
        writeStub(resolved, verbose);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to write stub';
        throw new CliError(msg, 1);
      }

      const result: PrdResult = { out: resolved, stub: true };
      if (jsonOutput) {
        emitJson(result);
      } else {
        logStdout(`Wrote PRD stub to ${resolved}`);
      }
    });

  return cmd;
}
