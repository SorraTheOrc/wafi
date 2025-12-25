#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { createPrdCommand } from './commands/prd.js';
import { createNextCommand } from './commands/next.js';
import { createRecentCommand } from './commands/recent.js';
import { handleError, logStdout } from './lib/io.js';
import { getCliVersion } from './lib/version.js';


export async function run(argv = process.argv.slice(2)): Promise<number> {
  // Handle version fast-path before commander parses or commands execute.
  if (argv[0] === '--version' || argv[0] === '-v') {
    logStdout(getCliVersion());
    return 0;
  }

  const program = new Command();
  program
    .name('waif')
    .description('WAIF CLI scaffold (Workflow Alien Intelligence)')
    .option('--json', 'Emit JSON output')
    .option('--verbose', 'Emit debug logs to stderr')
    .showHelpAfterError();

  program.addCommand(createPrdCommand());
  program.addCommand(createNextCommand());
  program.addCommand(createRecentCommand());

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
