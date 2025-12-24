import { spawnSync } from 'node:child_process';
import { Command } from 'commander';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { emitJson, logStdout } from '../lib/io.js';
import { CliError } from '../types.js';

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
  pane: string;
  title: string;
  pid?: string;
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

function listPanes(): ProbeSource {
  const res = runCmd('tmux', ['list-panes', '-a', '-F', '#{session_name}:#{window_index}.#{pane_index}\t#{pane_title}\t#{pane_pid}']);
  if (res.status !== 0) return { rows: [], raw: res.stdout ?? '', error: res.stderr || res.stdout || 'tmux list-panes failed' };
  const rows = res.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [pane, title = '', pid = ''] = line.split('\t');
      return { pane, title, pid: pid && pid !== '-' && pid !== '-1' ? pid : undefined } as PaneSourceRow;
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

export function createOodaCommand() {
  const cmd = new Command('ooda');
  cmd
    .description('Probe tmux panes and classify Busy/Free')
    .option('--once', 'Run a single probe and exit')
    .option('--interval <seconds>', 'Poll interval in seconds', (v) => parseInt(v, 10), 5)
    .option('--log <path>', 'Log path (default history/ooda_probe_<ts>.txt)')
    .option('--no-log', 'Disable logging')
    .option('--sample', 'Use built-in sample data (no tmux)')
    .action(async (options, command) => {
      const jsonOutput = Boolean(options.json ?? command.parent?.getOptionValue('json'));
      const interval = Number(options.interval ?? 5) || 5;
      const logEnabled = options.log !== false && options.log !== null && options.log !== undefined;
      const logPath = options.log || `history/ooda_probe_${Math.floor(Date.now() / 1000)}.txt`;
      const useSample = Boolean(options.sample);
      const once = Boolean(options.once);

      const runCycle = () => {
        const { rows, raw } = probeOnce(useSample);
        const table = renderTable(rows);
        if (jsonOutput) {
          emitJson({ rows });
        } else {
          logStdout(table);
        }
        if (logEnabled) {
          logProbe(logPath, rows, raw);
        }
        return rows;
      };

      if (once) {
        runCycle();
        return;
      }

      let stableCycles = 0;
      let lastFingerprint = '';
      let currentInterval = interval;
      const maxBackoff = 60;
      const backoffCycles = 12;
      const jitterMax = 1;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const rows = runCycle();
        const fingerprint = rows.map((r) => `${r.pane}|${r.status}|${r.title}|${r.reason}`).join(';');
        if (fingerprint === lastFingerprint) {
          stableCycles += 1;
          if (stableCycles >= backoffCycles) currentInterval = maxBackoff;
        } else {
          stableCycles = 0;
          currentInterval = interval;
          lastFingerprint = fingerprint;
        }
        const jitter = Math.floor(Math.random() * (jitterMax + 1));
        await new Promise((resolve) => setTimeout(resolve, (currentInterval + jitter) * 1000));
      }
    });
  return cmd;
}
