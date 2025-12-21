import { stdin as processStdin } from 'process';
import { Command } from 'commander';
import { CliError } from '../types.js';
import { emitJson, logStdout } from '../lib/io.js';
import { getClient, isEnabled } from '../lib/opencode.js';

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
    .argument('[prompt]', 'Prompt text, or - to read stdin')
    .option('--agent <name>', 'Agent name to use (default: Map)')
    .option('--json', 'Emit JSON output')
    .action(async (promptArg: string | undefined, options: any, command: Command) => {
      const jsonOutput = Boolean(options.json ?? command.parent?.getOptionValue('json'));
      const agent = options.agent || 'Map';

      let promptText: string | undefined;
      if (promptArg === '-') {
        promptText = await readStdin();
      } else if (typeof promptArg === 'string') {
        promptText = promptArg;
      }

      if (!promptText) {
        throw new CliError('Missing prompt. Provide as argument or use - to read stdin', 2);
      }

      // If OpenCode integration is enabled and available, use it.
      if (isEnabled()) {
        const client = await getClient();
        if (client && typeof client.ask === 'function') {
          try {
            const res = await client.ask(agent, promptText);
            const md = res?.markdown ?? String(res);
            if (jsonOutput) {
              emitJson({ agent, promptLength: promptText.length, responseMarkdown: md });
            } else {
              logStdout(md);
            }
            return;
          } catch (e) {
            // Fall through to placeholder
          }
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
