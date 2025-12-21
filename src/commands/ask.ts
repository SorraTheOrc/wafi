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
    .option('--agent <name>', 'Agent name to use (default: map)')
    .option('--json', 'Emit JSON output')
    .action(async (promptArg: string | string[] | undefined, options: any, command: Command) => {
      const jsonOutput = Boolean(options.json ?? command.parent?.getOptionValue('json'));
      const map = loadAgentMap();
      let agent = options.agent || process.env.OPENCODE_DEFAULT_AGENT || 'map';

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

      const promptWords = promptText.trim().split(/\s+/);
      const firstWord = promptWords[0];
      if (!options.agent && firstWord && map[firstWord]) {
        agent = firstWord;
        promptWords.shift();
        promptText = promptWords.join(' ').trim();
        if (!promptText) {
          throw new CliError('Missing prompt after removing agent name', 2);
        }
      }

      const mappedAgent = map[agent] || agent;

      // If OpenCode integration is enabled and available, ensure client and use it.
      if (isEnabled()) {
        const client = await ensureClient();
        if (client && typeof client.ask === 'function') {
          try {
            const res = await client.ask(mappedAgent, promptText);
            const md = res?.markdown ?? String(res);
            const prefixed = `${mappedAgent} answers:\n${md}`;
            if (jsonOutput) {
              emitJson({ agent: mappedAgent, promptLength: promptText.length, responseMarkdown: prefixed });
            } else {
              logStdout(prefixed);
            }
            if (/OpenCode error:/i.test(md)) {
              process.exitCode = 1;
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
      const md = `# Response from ${mappedAgent}\n\n${promptText}\n`;
      const prefixed = `${mappedAgent} answers:\n${md}`;

      if (jsonOutput) {
        emitJson({ agent: mappedAgent, promptLength: promptText.length, responseMarkdown: prefixed });
      } else {
        logStdout(prefixed);
      }
    });

  return cmd;
}
