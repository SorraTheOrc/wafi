import { chmodSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execa } from 'execa';
import { describe, expect, it } from 'vitest';

const CLI = [process.execPath, 'dist/index.js'];

function makeFakeBd(binDir: string, issues: Record<string, any>) {
  const bdPath = join(binDir, 'bd');

  const script = [
    `#!${process.execPath}`,
    '',
    `const issues = ${JSON.stringify(issues, null, 2)};`,
    'const args = process.argv.slice(2);',
    '',
    "if (args[0] === '--version') {",
    "  process.stdout.write('bd 0.0.0\\n');",
    '  process.exit(0);',
    '}',
    '',
    "if (args[0] === 'show') {",
    '  const id = args[1];',
    "  const json = args.includes('--json');",
    '  if (!json) {',
    "    process.stderr.write('Expected --json\\n');",
    '    process.exit(2);',
    '  }',
    '',
    '  if (!Object.prototype.hasOwnProperty.call(issues, id)) {',
    "    process.stderr.write('no issue found\\n');",
    '    process.exit(1);',
    '  }',
    '',
    "  process.stdout.write(JSON.stringify(issues[id]) + '\\n');",
    '  process.exit(0);',
    '}',
    '',
    "process.stderr.write('Unsupported bd args: ' + args.join(' ') + '\\n');",
    'process.exit(2);',
    '',
  ].join('\n');

  writeFileSync(bdPath, script, { encoding: 'utf8' });
  chmodSync(bdPath, 0o755);
  return bdPath;
}

describe('waif show (integration)', () => {
  it('emits issue JSON with --json', async () => {
    const binDir = mkdtempSync(join(tmpdir(), 'waif-bd-'));

    makeFakeBd(binDir, {
      'wf-123': {
        id: 'wf-123',
        title: 'Demo',
        status: 'open',
        priority: 2,
        assignee: 'alice',
        dependencies: [{ depends_on_id: 'wf-1', dependency_type: 'blocks', status: 'open' }],
        children: [{ id: 'wf-2', title: 'Child', status: 'open', priority: 3 }],
      },
    });

    const { exitCode, stdout } = await execa(CLI[0], [...CLI.slice(1), 'show', 'wf-123', '--json'], {
      env: {
        ...process.env,
        PATH: binDir,
      },
    });

    expect(exitCode).toBe(0);
    const payload = JSON.parse(stdout.trim());
    expect(payload.id).toBe('wf-123');
    expect(payload.title).toBe('Demo');
  });

  it('exits nonzero and prints friendly error when issue is missing', async () => {
    const binDir = mkdtempSync(join(tmpdir(), 'waif-bd-'));
    makeFakeBd(binDir, { 'wf-present': { id: 'wf-present', title: 'Present', status: 'open', priority: 2 } });

    const { exitCode, stderr } = await execa(CLI[0], [...CLI.slice(1), 'show', 'wf-missing'], {
      env: {
        ...process.env,
        PATH: binDir,
      },
      reject: false,
    });

    expect(exitCode).toBe(1);
    expect(stderr).toContain('Issue wf-missing not found');
  });
});
