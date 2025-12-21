import { stdin as processStdin } from 'process';
import { Command } from 'commander';
import { CliError } from '../types.js';
import { emitJson, logStdout } from '../lib/io.js';
import { ensureClient, isEnabled, loadAgentMap } from '../lib/opencode.js';

function readStdin(timeoutMs = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    processStdin.setEncoding('utf8');

    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for stdin after ${timeoutMs}ms`));
    }, timeoutMs);

    processStdin.on('data', (chunk) => {
      data += chunk;
    });
    processStdin.on('end', () => {
      clearTimeout(timeout);
      resolve(data);
    });
    processStdin.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

export function createAskCommand() {
  const cmd = new Command('ask');
  cmd
    .description('One-shot agent ask command')
    .argument('[prompt...]', 'Prompt text, or - to read stdin (variadic)')
    .option('--agent <name>', 'Agent name to use (default: Map)')
    .option('--json', 'Emit JSON output')
    .action(async (promptArg: string | string[] | undefined, options: any, command: Command) => {
      const jsonOutput = Boolean(options.json ?? command.parent?.getOptionValue('json'));
      const agent = options.agent || 'Map';

      let promptText: string | undefined;
      if (Array.isArray(promptArg)) {
        if (promptArg.length === 1 && promptArg[0] === '-') {
          promptText = await readStdin();
        } else {
          promptText = promptArg.join(' ').trim();
        }
      } else if (promptArg === '-') {
        promptText = await readStdin();
      } else if (typeof promptArg === 'string') {
        promptText = promptArg;
      }

      if (!promptText) {
        throw new CliError('Missing prompt. Provide as argument or use - to read stdin', 2);
      }

      // If OpenCode integration is enabled and available, ensure client and use it.
      if (isEnabled()) {
        const client = await ensureClient();
        if (client && typeof client.ask === 'function') {
          const map = loadAgentMap();
          const mappedAgent = map[agent] || agent;
          try {
            const res = await client.ask(mappedAgent, promptText);
            const md = res?.markdown ?? String(res);
            if (jsonOutput) {
              emitJson({ agent: mappedAgent, promptLength: promptText.length, responseMarkdown: md });
            } else {
              logStdout(md);
            }
            return;
          } catch (e) {
            process.stderr.write(`[warn] OpenCode ask failed: ${e instanceof Error ? e.message : String(e)}\n`);
            // Fall through to placeholder
          }
        } else {
          process.stderr.write('[debug] OpenCode client unavailable, falling back to placeholder.\n');
        }
      }

      // Fallback placeholder implementation for MVP: echo back a Markdown formatted response.
      const md = `# Response from ${agent}\n\n${promptText}\n`;

      if (jsonOutput) {
        emitJson({ agent, promptLength: promptText.length, responseMarkdown: md });
      } else {
        logStdout(md);
      }
    });

  return cmd;
}
