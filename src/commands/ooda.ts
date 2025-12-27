import { spawnSync } from 'node:child_process';
import { Command } from 'commander';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import yaml from 'yaml';
import { emitJson, logStdout } from '../lib/io.js';
import { CliError } from '../types.js';
import { loadAgentMap } from '../lib/opencode.js';
import { runIngester, OODA_STATUS_LOG } from '../lib/ooda-ingester.js';



interface PaneRow {
  pane: string;
  title: string;
  pid?: string;
  stat?: string;
  pcpu?: string;
  status: 'Busy' | 'Free';
  reason: string;
}

interface PaneSourceRow {
  pane: string; // human-friendly agent label or raw pane id
  id?: string; // original pane id from tmux (session:window.pane)
  title: string;
  pid?: string;
  session?: string;
  window?: string;
}

interface ProbeSource {
  rows: PaneSourceRow[];
  raw?: string;
  error?: string;
}

function runCmd(cmd: string, args: string[]): { stdout: string; stderr: string; status: number } {
  const res = spawnSync(cmd, args, { encoding: 'utf8' });
  return { stdout: res.stdout ?? '', stderr: res.stderr ?? '', status: res.status ?? 0 };
}

export function getAgentFromProc(pid: string | undefined): string | undefined {
  if (!pid) return undefined;
  try {
    // Read environ for BD_ACTOR or WAIF_AGENT
    const envPath = `/proc/${pid}/environ`;
    const data = readFileSync(envPath, 'utf8');
    const parts = data.split('\0');
    for (const p of parts) {
      if (p.startsWith('BD_ACTOR=')) return p.split('=')[1];
      if (p.startsWith('WAIF_AGENT=')) return p.split('=')[1];
      if (p.startsWith('OPENCODE_AGENT=')) return p.split('=')[1];
    }
  } catch (e) {
    // ignore (non-linux or permission)
  }

  try {
    // Fallback: inspect cmdline for typical flags (e.g., --agent <name>, opencode --agent <name>, waif startWork --actor <name>)
    const cmdPath = `/proc/${pid}/cmdline`;
    const data = readFileSync(cmdPath, 'utf8');
    if (data) {
      const parts = data.split('\0').filter(Boolean);
      for (let i = 0; i < parts.length; i += 1) {
        const t = parts[i];
        if ((t === '--agent' || t === '--actor' || t === '--opencode-agent') && parts[i + 1]) return parts[i + 1];
        if (t === 'opencode' && parts[i + 1] === '--agent' && parts[i + 2]) return parts[i + 2];
        if (t === 'waif' && parts[i + 1] === 'startWork' && parts[i + 2] === '--actor' && parts[i + 3]) return parts[i + 3];
      }
    }
  } catch (e) {
    // ignore
  }

  return undefined;
}

function listPanes(): ProbeSource {
  // Use window_name so the agent identity (window) is available rather than the numeric window_index
  const res = runCmd('tmux', ['list-panes', '-a', '-F', '#{session_name}:#{window_name}.#{pane_index}\t#{pane_title}\t#{pane_pid}']);
  if (res.status !== 0) return { rows: [], raw: res.stdout ?? '', error: res.stderr || res.stdout || 'tmux list-panes failed' };

  // Load workflow agent definitions (best-effort)
  let workflowAgents: Record<string, { name: string; label?: string; window?: string }> = {};
  try {
    const cfgPath = process.env.WORKFLOW_AGENTS_CONFIG || 'config/workflow_agents.yaml';
    const txt = readFileSync(cfgPath, 'utf8');
    const parsed: any = yaml.parse(txt) || {};
    const list: any[] = Array.isArray(parsed?.agents) ? parsed.agents : [];
    for (const a of list) {
      if (a && a.name) workflowAgents[a.name] = { name: a.name, label: a.label, window: a.window };
    }
  } catch (e) {
    // ignore
  }

  // Opencode agent map fallback
  let agentMap: Record<string, string> = {};
  try {
    agentMap = loadAgentMap();
  } catch (e) {
    // ignore
  }

  const rows = res.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [pane, title = '', pid = ''] = line.split('\t');
      const [sessionPart, windowPart] = (pane || '').split(':');
      const windowName = (windowPart || '').split('.')?.[0] || '';

      // 1) Try process env/cmdline via /proc
      const procAgent = getAgentFromProc(pid && pid !== '-' && pid !== '-1' ? pid : undefined);
      if (procAgent) return { pane: procAgent, id: pane, title, pid: pid && pid !== '-' && pid !== '-1' ? pid : undefined, session: sessionPart, window: windowName } as any;

      // 2) Match pane title against workflow agents (label or name)
      const tLower = (title || '').toLowerCase();
      for (const k of Object.keys(workflowAgents)) {
        const a = workflowAgents[k];
        if (a.label && tLower.startsWith(String(a.label).toLowerCase())) return { pane: a.name, id: pane, title, pid: pid && pid !== '-' && pid !== '-1' ? pid : undefined, session: sessionPart, window: windowName } as any;
        if (String(a.name).toLowerCase() === tLower || tLower.startsWith(String(a.name).toLowerCase())) return { pane: a.name, id: pane, title, pid: pid && pid !== '-' && pid !== '-1' ? pid : undefined, session: sessionPart, window: windowName } as any;
      }

      // 3) If window maps to exactly one workflow agent, use it
      const windowCandidates = Object.values(workflowAgents).filter((a) => a.window === windowName);
      if (windowCandidates.length === 1) return { pane: windowCandidates[0].name, id: pane, title, pid: pid && pid !== '-' && pid !== '-1' ? pid : undefined, session: sessionPart, window: windowName } as any;

      // 4) Fallback to opencode map by windowName or raw windowName
      const mapped = agentMap[windowName] || windowName;
      return { pane: mapped, id: pane, title, pid: pid && pid !== '-' && pid !== '-1' ? pid : undefined, session: sessionPart, window: windowName } as any;
    });
  return { rows, raw: res.stdout };
}

function psStats(pid: string): { stat?: string; pcpu?: string } {
  const res = runCmd('ps', ['-p', pid, '-o', 'stat=', '-o', 'pcpu=']);
  if (res.status !== 0) return {};
  const [stat = '', pcpu = ''] = res.stdout.trim().split(/\s+/, 2);
  return { stat, pcpu };
}

export function classify(title: string, stat?: string, pcpu?: string): { status: 'Busy' | 'Free'; reason: string } {
  const lower = title.toLowerCase();
  if (
    lower.includes('busy') ||
    lower.includes('in_progress') ||
    lower.includes('running') ||
    lower.includes('agent') ||
    /[a-z]+-[a-z0-9.]+/.test(lower)
  ) {
    return { status: 'Busy', reason: 'keyword' };
  }
  if (!lower.trim() || lower.includes('idle')) {
    return { status: 'Free', reason: 'idle-title' };
  }
  if (stat || pcpu) {
    const cpuInt = pcpu ? parseInt(pcpu.split('.')[0], 10) || 0 : 0;
    if (cpuInt > 0) return { status: 'Busy', reason: 'process-cpu' };
    if (stat && stat[0] && stat[0] !== 'S' && stat[0] !== 'I') return { status: 'Busy', reason: 'process-state' };
    return { status: 'Free', reason: 'process-idle' };
  }
  return { status: 'Free', reason: 'fallback' };
}

function computeWidths(rows: PaneRow[]): { agent: number; status: number; title: number } {
  const headerAgent = 'Agent';
  const headerStatus = 'Status';
  const headerTitle = 'Title';
  let agent = headerAgent.length;
  let status = headerStatus.length;
  let title = headerTitle.length;

  for (const r of rows) {
    agent = Math.max(agent, r.pane.length);
    status = Math.max(status, r.status.length);
  }

  const termCols = process.stdout.isTTY && typeof process.stdout.columns === 'number' ? process.stdout.columns : Number(process.env.COLUMNS || 0) || 120;
  const padding = 6;
  const computedTitle = termCols - agent - status - padding;
  if (computedTitle > title) title = computedTitle;
  if (title < 10) title = 10;

  return { agent, status, title };
}

function truncateField(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  if (maxLen <= 1) return text.slice(0, maxLen);
  return `${text.slice(0, maxLen - 1)}…`;
}

function renderTable(rows: PaneRow[]): string {
  const widths = computeWidths(rows);
  const header = `${'Agent'.padEnd(widths.agent)} | ${'Status'.padEnd(widths.status)} | ${'Title'.padEnd(widths.title)}`;
  const sep = `${'-'.repeat(widths.agent)}-+-${'-'.repeat(widths.status)}-+-${'-'.repeat(widths.title)}`;
  const body = rows
    .map((r) => `${r.pane.padEnd(widths.agent)} | ${r.status.padEnd(widths.status)} | ${truncateField(r.title, widths.title).padEnd(widths.title)}`)
    .join('\n');
  return `${header}\n${sep}\n${body}`;
}

function sampleRows(): PaneRow[] {
  const samples: PaneSourceRow[] = [
    { pane: 'map:0.0', title: 'Map busy wf-cvz' },
    { pane: 'forge:1.0', title: 'Forge idle' },
    { pane: 'ship:2.0', title: 'ship running tests' },
    { pane: 'sentinel:3.1', title: 'idle' },
  ];
  return samples.map((s) => {
    const { status, reason } = classify(s.title);
    return { ...s, status, reason };
  });
}

function probeOnce(useSample: boolean): { rows: PaneRow[]; raw?: string } {
  const rows: PaneRow[] = [];
  const base: ProbeSource = useSample ? { rows: sampleRows(), raw: undefined, error: undefined } : listPanes();
  if (base.error) throw new CliError(`tmux probe failed: ${base.error}`, 1);

  for (const row of base.rows) {
    const { stat, pcpu } = row.pid ? psStats(row.pid) : {};
    const { status, reason } = classify(row.title, stat, pcpu);
    rows.push({ pane: row.pane, title: row.title, pid: row.pid, stat, pcpu, status, reason });
  }
  return { rows, raw: base.raw };
}

function logProbe(logPath: string, rows: PaneRow[], raw?: string): void {
  const ts = new Date().toISOString();
  const dir = dirname(logPath);
  if (dir && dir !== '.') mkdirSync(dir, { recursive: true });
  const header = existsSync(logPath) ? '' : '# ooda probe log\n';
  const body = rows
    .map(
      (r) =>
        `pane=${r.pane}\tstatus=${r.status}\ttitle=${r.title}\tpid=${r.pid ?? ''}\tstat=${r.stat ?? ''}\tpcpu=${r.pcpu ?? ''}\treason=${r.reason}`,
    )
    .join('\n');
  const rawLine = raw ? `tmux\t${raw.replace(/\n/g, '\\n')}` : '';
  writeFileSync(logPath, `${header}\n[${ts}]\n${rawLine}\n${body}\n`, { flag: 'a' });
}

function createSampleOpencodeSource() {
  const sampleEvents = [
    {
      type: 'session.created',
      payload: {
        session: { id: 's-1', status: 'running' },
        agent: { name: 'map' },
        message: { content: 'booting' },
        timestamp: '2024-01-01T00:00:00Z',
      },
    },
    { type: 'message.updated', payload: { agent: { name: 'forge' }, message: { content: 'done' } } },
    { type: 'session.deleted', payload: { agent: { name: 'map' }, reason: 'complete' } },
  ];
  return {
    subscribe: async (_options: any, handler: (payload: any) => void) => {
      for (const ev of sampleEvents) handler(ev);
      return () => {};
    },
  };
}

function createFileOpencodeSource(path: string) {
  try {
    const txt = readFileSync(path, 'utf8');
    const events = txt
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch (e) {
          return { type: 'unknown', payload: { line } };
        }
      });
    return {
      subscribe: async (_options: any, handler: (payload: any) => void) => {
        for (const ev of events) handler(ev);
        return () => {};
      },
    };
  } catch (e: any) {
    throw new CliError(`Failed to read mock events file: ${e?.message || e}`, 1);
  }
}

export function createOodaCommand(
  deps: {
    runIngester?: typeof runIngester;
    sampleSourceFactory?: () => any;
    isOpencodeEnabled?: () => boolean;
  } = {},
) {
  const runIngest = deps.runIngester ?? runIngester;
  const sampleSourceFactory = deps.sampleSourceFactory ?? createSampleOpencodeSource;
  const opencodeEnabled = deps.isOpencodeEnabled ?? (() => true);

  const cmd = new Command('ooda');
  cmd
    .description('Subscribe to OpenCode events')
    .option('--once', 'Exit after first received event')
    .option('--log <path>', 'OpenCode event log path')
    .option('--no-log', 'Disable logging')
    .option('--sample', 'Use built-in sample OpenCode events (alias: --opencode-sample)')
    .option('--opencode-sample', 'Use sample OpenCode events (no server)')
    .option('--mock <path>', 'Use mock NDJSON events file for OpenCode')
    .option('--opencode-debug', 'Log redacted raw OpenCode events to stderr (alias: --verbose)')
    .action(async (options, command) => {
      const once = Boolean(options.once);
      const logEnabled = options.log !== false;
      const logPathForIngestor = options.log || OODA_STATUS_LOG;
      const debug = Boolean(options.opencodeDebug || options.verbose || command.parent?.getOptionValue('verbose'));
      const useSample = Boolean(options.sample || options.opencodeSample);

      if (!opencodeEnabled()) {
        throw new CliError('OpenCode ingestion is disabled', 1);
      }

      const source = useSample
        ? sampleSourceFactory()
        : options.mock
          ? createFileOpencodeSource(options.mock)
          : undefined;

      await runIngest({
        once,
        logPath: logPathForIngestor,
        debug,
        source,
        log: logEnabled,
      });
    });
  return cmd;
}
