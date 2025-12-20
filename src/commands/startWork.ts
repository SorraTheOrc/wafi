import { Command } from 'commander';
import { spawnSync } from 'child_process';
import { logStdout } from '../lib/io.js';

export function createStartWorkCommand() {
  const cmd = new Command('startWork');
  cmd
    .description('Start the agent runtime in this pane (sets prompt and pane title)')
    .argument('<agent>', 'Agent name')
    .option('--norc', 'Do not load user shell rc/profile (bash: --noprofile --norc)')
    .option('--env <key=value...>', 'Set additional environment variables before starting shell')
    .option('--init <command...>', 'Run initialization command(s) before starting shell')
    .action((agent: string, options: { norc?: boolean; env?: string[]; init?: string[] }) => {
      // If inside tmux, set the pane title to the agent name.
      try {
        if (process.env.TMUX) {
          // Best-effort: call tmux to set the pane title.
          spawnSync('tmux', ['select-pane', '-T', agent], { stdio: 'ignore' });
        }
      } catch (e) {
        // ignore failures
      }

      // Print welcome message
      logStdout(`Welcome to waif agent: ${agent}`);
      logStdout(`Role: ${agent}`);
      logStdout('Type commands as usual. The prompt has been set to `waif> `');

      // Apply env overrides
      const env = { ...process.env, PS1: 'waif> ', PROMPT_COMMAND: '' } as Record<string, string>;
      for (const kv of options.env ?? []) {
        const idx = kv.indexOf('=');
        if (idx > 0) {
          const k = kv.slice(0, idx);
          const v = kv.slice(idx + 1);
          env[k] = v;
        }
      }

      // Run initialization commands (in a non-interactive shell) before launching the main shell
      if (options.init && options.init.length > 0) {
        const initCmd = options.init.join(' ');
        const initRes = spawnSync(env.SHELL ?? 'bash', ['-lc', initCmd], { stdio: 'inherit', env });
        if ((initRes.status ?? 0) !== 0) {
          process.exit(initRes.status ?? 1);
        }
      }

      // Launch an interactive shell replacing this process so the prompt and environment apply.
      const shell = process.env.SHELL ?? 'bash';
      const isBash = shell.endsWith('bash');
      const args = isBash
        ? options.norc
          ? ['--noprofile', '--norc', '-i']
          : ['-i']
        : ['-i'];

      const res = spawnSync(shell, args, { stdio: 'inherit', env });
      process.exit(res.status ?? 0);
    });

  return cmd;
}
