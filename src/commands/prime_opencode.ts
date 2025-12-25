// Skeleton: waif prime opencode CLI command
// Purpose: register priming hooks for OpenCode lifecycle events and emit sample payloads

import { Command } from 'commander'

const program = new Command()

program
  .name('prime:opencode')
  .description('Register compact priming hooks for OpenCode sessions')
  .option('-i, --issue <id>', 'Beads issue id to prime with')
  .option('-b, --budget <tokens>', 'Token budget for priming', '1500')
  .action(async (opts) => {
    console.log('Prime opencode called with', opts)
    // TODO: implement: load issue context, run summarize(), register hooks via src/lib/hooks/opencode
  })

export default program
