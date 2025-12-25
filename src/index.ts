#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { createPrdCommand } from './commands/prd.js';
import { handleError } from './lib/io.js';

export async function run(argv = process.argv.slice(2)): Promise<number> {
  const program = new Command();
  program
    .name('pm')
    .description('pm CLI scaffold')
    .option('--json', 'Emit JSON output')
    .option('--verbose', 'Emit debug logs to stderr')
    .showHelpAfterError();

  program.addCommand(createPrdCommand());

  try {
    await program.parseAsync(argv, { from: 'user' });
    return 0;
  } catch (err) {
    const opts = program.opts<{ json?: boolean }>();
    return handleError(err, Boolean(opts.json));
  }
}

// Run if invoked as main script (handles both direct and symlinked execution)
const scriptPath = realpathSync(process.argv[1]);
const modulePath = fileURLToPath(import.meta.url);

if (scriptPath === modulePath) {
  run()
    .then((code) => {
      process.exit(code);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
