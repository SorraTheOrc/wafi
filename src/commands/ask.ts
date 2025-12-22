import { stdin as processStdin } from 'process';
import { Command } from 'commander';
import {
  readFileSync,
  statSync,
  writeFileSync,
  mkdirSync,
  renameSync,
  existsSync,
} from 'fs';
import { resolve } from 'path';
import { spawnSync } from 'child_process';
import yaml from 'yaml';
import { CliError } from '../types.js';
import { emitJson, logStdout } from '../lib/io.js';
import { loadAgentMap } from '../lib/opencode.js';

type AgentConfig = {
  name: string;
  label?: string;
  window?: string;
};

type AgentLookup = Record<string, AgentConfig>;

const LOG_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const LOG_BACKUPS = 5;

function readStdin(timeoutMs = 5000): Promise<string> {
  return new Promise((resolveStdin, reject) => {
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
      resolveStdin(data);
    });
    processStdin.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

function getLogPaths() {
  const dir = process.env.WAIF_LOG_DIR
    ? resolve(process.env.WAIF_LOG_DIR)
    : resolve(process.env.HOME || '~', '.waif/logs');
  const file = resolve(dir, 'ask.log');
  return { dir, file };
}

function rotateLogs(filePath: string, maxBytes: number, backups: number) {
  if (!existsSync(filePath)) return;
  const stats = statSync(filePath);
  if (stats.size <= maxBytes) return;

  for (let i = backups; i >= 1; i -= 1) {
    const src = i === 1 ? filePath : `${filePath}.${i - 1}`;
    const dest = `${filePath}.${i}`;
    if (existsSync(src)) {
      try {
        renameSync(src, dest);
      } catch (e) {
        // Best effort rotation; continue
      }
    }
  }
}

function appendLog(agent: string, prompt: string) {
  const { dir, file } = getLogPaths();
  mkdirSync(dir, { recursive: true });
  rotateLogs(file, LOG_MAX_BYTES, LOG_BACKUPS);
  const entry = {
    timestamp: new Date().toISOString(),
    agent,
    prompt,
  };
  writeFileSync(file, JSON.stringify(entry) + '\n', { encoding: 'utf8', flag: 'a' });
}

function loadWorkflowAgents(): AgentLookup {
  const cfgPath = process.env.WORKFLOW_AGENTS_CONFIG || resolve('config/workflow_agents.yaml');
  try {
    const txt = readFileSync(cfgPath, 'utf8');
    const data = yaml.parse(txt);
    const list: any[] = Array.isArray(data?.agents) ? data.agents : [];
    const out: AgentLookup = {};
    for (const a of list) {
      if (typeof a?.name === 'string' && a.name.trim()) {
        out[a.name.trim()] = {
          name: a.name.trim(),
          label: typeof a.label === 'string' && a.label.trim() ? a.label.trim() : undefined,
          window: typeof a.window === 'string' && a.window.trim() ? a.window.trim() : undefined,
        };
      }
    }
    return out;
  } catch (e) {
    throw new CliError(`Unable to read workflow agents config at ${cfgPath}`, 1);
  }
}

function parsePaneEnv(line: string) {
  const [pane, title = ''] = line.split('\t');
  const [sessionPart, windowPart] = pane.split(':');
  return {
    id: pane,
    title: title.trim(),
    session: sessionPart,
    window: windowPart?.split('.')?.[0] ?? '',
  };
}

function listTmuxPanes(): Array<{ id: string; title: string; session: string; window: string }> {
  if (process.env.WAIF_TMUX_PANES) {
    return process.env.WAIF_TMUX_PANES.split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map(parsePaneEnv);
  }

  const tmuxBin = process.env.WAIF_TMUX_BIN || 'tmux';
  const res = spawnSync(tmuxBin, ['list-panes', '-a', '-F', '#{session_name}:#{window_name}.#{pane_index}\t#{pane_title}'], {
    encoding: 'utf8',
  });
  if (res.status !== 0) {
    throw new CliError('tmux not available. Hint: start workflow tmux session.', 1);
  }
  const lines = res.stdout.trim().split(/\r?\n/).filter(Boolean);
  return lines.map(parsePaneEnv);
}

function findPaneForAgent(agent: AgentConfig): string {
  const panes = listTmuxPanes();
  const session = process.env.WORKFLOW_TMUX_SESSION || 'waif-workflow';
  const targetTitle = agent.label || agent.name;
  const targetWindow = agent.window || 'core';

  const match =
    panes.find(
      (p) =>
        p.session === session &&
        p.window === targetWindow &&
        (p.title === targetTitle || p.title.toLowerCase().startsWith(targetTitle.toLowerCase())),
    ) ||
    panes.find(
      (p) => p.session === session && (p.title === targetTitle || p.title.toLowerCase().startsWith(targetTitle.toLowerCase())),
    );

  if (!match) {
    throw new CliError(
      `tmux pane for agent '${agent.name}' not found. Hint: start workflow tmux session or check agent mapping.`,
      1,
    );
  }
  return match.id;
}

function sendToPane(paneId: string, prompt: string) {
  // In tests or dry-run mode, skip real tmux send
  if (process.env.WAIF_TMUX_DRY_RUN === '1' || process.env.WAIF_TMUX_PANES) return;

  const tmuxBin = process.env.WAIF_TMUX_BIN || 'tmux';
  const res = spawnSync(tmuxBin, ['send-keys', '-t', paneId, 'opencode', 'C-m', prompt, 'C-m'], { encoding: 'utf8' });
  if (res.status !== 0) {
    const err = (res.stderr || res.stdout || '').toString().trim();
    throw new CliError(`Failed to send prompt to tmux pane${err ? `: ${err}` : ''}`, 1);
  }
}

export function createAskCommand() {
  const cmd = new Command('ask');
  cmd
    .description('One-shot agent ask command (tmux TUI inject) — matches pane title prefix')
    .argument('[prompt...]', 'Prompt text, or - to read stdin (variadic)')
    .option('--agent <name>', 'Agent name to use (default: map)')
    .option('--json', 'Emit JSON output')
    .action(async (promptArg: string | string[] | undefined, options: any, command: Command) => {
      const jsonOutput = Boolean(options.json ?? command.parent?.getOptionValue('json'));
      const map = loadAgentMap();
      const agents = loadWorkflowAgents();
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
      const lowerFirst = firstWord?.toLowerCase();

      if (!options.agent && firstWord) {
        if (map[firstWord]) {
          agent = firstWord;
          promptWords.shift();
        } else {
          const configMatch = Object.values(agents).find(
            (a) => a.name.toLowerCase() === lowerFirst || a.label?.toLowerCase() === lowerFirst,
          );
          if (configMatch) {
            agent = configMatch.name;
            promptWords.shift();
          }
        }
        promptText = promptWords.join(' ').trim();
        if (!promptText) {
          throw new CliError('Missing prompt after removing agent name', 2);
        }
      }

      const mappedAgent = map[agent] || agent;

      const agentCfg = agents[mappedAgent];
      if (!agentCfg) {
        throw new CliError(`Agent '${mappedAgent}' not defined in workflow_agents.yaml`, 1);
      }

      const paneId = findPaneForAgent(agentCfg);
      sendToPane(paneId, promptText);
      appendLog(agentCfg.name, promptText);

      if (jsonOutput) {
        const { file } = getLogPaths();
        emitJson({ agent: agentCfg.name, pane: paneId, promptLength: promptText.length, sent: true, logFile: file });
      } else {
        logStdout(`Sent prompt to agent '${agentCfg.name}' in pane ${paneId}`);
      }
    });

  return cmd;
}
