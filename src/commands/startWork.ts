import { Command } from 'commander';
import { spawnSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
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
      const shell = process.env.SHELL ?? 'bash';
      const shellName = shell.split('/').pop() ?? shell;
      const paneTitle = `${agent} (${shellName})`;

      // If inside tmux, set the pane title and enable pane borders so the title is visible.
      try {
        if (process.env.TMUX) {
          spawnSync('tmux', ['set-option', '-g', 'pane-border-status', 'top'], { stdio: 'ignore' });
          spawnSync('tmux', ['set-option', '-g', 'pane-border-format', '#{pane_title}'], { stdio: 'ignore' });
          spawnSync('tmux', ['select-pane', '-T', paneTitle], { stdio: 'ignore' });
        }
      } catch (e) {
        // ignore failures
      }

      // Best-effort terminal title (helps tmux pick up pane_title for some configs)
      try {
        process.stdout.write(`\u001b]2;${paneTitle}\u0007`);
      } catch (e) {
        // ignore failures
      }

      // Print welcome message
      logStdout(`Hi, I'm the agent named ${agent}`);

      // Apply env overrides
      const env = {
        ...process.env,
        WAIF_AGENT: agent,
        WAIF_PANE_TITLE: paneTitle,
        WAIF_PROMPT: `${agent}> `,
        WAIF_PROMPT_COMMAND: '',
        PS1: `${agent}> `,
        PROMPT_COMMAND: '',
      } as Record<string, string>;
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
      const isBash = shell.endsWith('bash');
      let args: string[] = ['-i'];
      let cleanupDir: string | undefined;

      if (isBash) {
        cleanupDir = mkdtempSync(join(tmpdir(), 'waif-shell-'));
        const rcFile = join(cleanupDir, 'bashrc');
        const rcLines: string[] = [];

        if (!options.norc) {
          rcLines.push('[ -f /etc/bashrc ] && . /etc/bashrc');
          rcLines.push('[ -f ~/.bashrc ] && . ~/.bashrc');
        }

        rcLines.push('PS1="${WAIF_PROMPT:-waif> }"');
        rcLines.push('if [ -n "${WAIF_PROMPT_COMMAND+x}" ]; then PROMPT_COMMAND="${WAIF_PROMPT_COMMAND}"; else unset PROMPT_COMMAND; fi');
        rcLines.push('printf "\x1b]2;%s\x07" "${WAIF_PANE_TITLE:-$WAIF_AGENT}"');

        writeFileSync(rcFile, rcLines.join('\n') + '\n', { encoding: 'utf8', mode: 0o600 });
        args = ['--rcfile', rcFile, '-i'];
      } else if (options.norc) {
        args = ['-i'];
      }

      const res = spawnSync(shell, args, { stdio: 'inherit', env });

      if (cleanupDir) {
        try {
          rmSync(cleanupDir, { recursive: true, force: true });
        } catch (e) {
          // ignore cleanup errors
        }
      }

      process.exit(res.status ?? 0);
    });

  return cmd;
}
