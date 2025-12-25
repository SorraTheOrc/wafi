import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

function pad2(num: number): string {
  return String(num).padStart(2, '0');
}

function formatTimestampUtc(date: Date): string {
  return [
    date.getUTCFullYear(),
    pad2(date.getUTCMonth() + 1),
    pad2(date.getUTCDate()),
    'T',
    pad2(date.getUTCHours()),
    pad2(date.getUTCMinutes()),
    pad2(date.getUTCSeconds()),
  ].join('');
}

function readPackageVersion(): string {
  const pkgPath = fileURLToPath(new URL('../../package.json', import.meta.url));
  const raw = readFileSync(pkgPath, 'utf8');
  const parsed = JSON.parse(raw) as { version?: string };
  if (!parsed.version) throw new Error('package.json missing version');
  return parsed.version;
}

function hasGitDir(): boolean {
  // Quick existence check to avoid spawning git in release artifacts.
  const gitDir = fileURLToPath(new URL('../../.git', import.meta.url));
  return existsSync(gitDir);
}

function tryGetGitShortHash(): string | null {
  if (!hasGitDir()) return null;

  const res = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8', timeout: 2000 });
  if (res.status !== 0) return null;
  const out = String(res.stdout ?? '').trim();
  return out.length > 0 ? out : null;
}

function isExactGitTag(tag: string): boolean {
  if (!hasGitDir()) return false;

  // Use git describe --exact-match instead of parsing tag lists.
  const res = spawnSync('git', ['describe', '--tags', '--exact-match'], { encoding: 'utf8', timeout: 2000 });
  if (res.status !== 0) return false;
  return String(res.stdout ?? '').trim() === tag;
}

export type VersionMode = 'auto' | 'release' | 'dev';

export function getCliVersion(mode: VersionMode = 'auto', now = new Date()): string {
  const envMode = (process.env.WAIF_VERSION_MODE || '').toLowerCase();
  const effectiveMode: VersionMode =
    envMode === 'release' || envMode === 'dev' || envMode === 'auto' ? (envMode as VersionMode) : mode;

  const packageVersion = readPackageVersion();
  if (effectiveMode === 'release') {
    return `v${packageVersion}`;
  }

  // auto mode:
  // - If we're in a release artifact without .git, treat as release.
  // - If we're on an exact tag matching v<packageVersion>, treat as release.
  // - Otherwise treat as dev (unreleased working tree).
  if (effectiveMode === 'auto') {
    if (!hasGitDir()) {
      return `v${packageVersion}`;
    }
    if (isExactGitTag(`v${packageVersion}`)) {
      return `v${packageVersion}`;
    }
  }

  const gitHash = effectiveMode === 'dev' || effectiveMode === 'auto' ? tryGetGitShortHash() : null;
  const isDev = effectiveMode === 'dev' || effectiveMode === 'auto';
  if (!isDev) {
    return `v${packageVersion}`;
  }

  const stamp = formatTimestampUtc(now);
  const suffix = gitHash ? `${stamp}.${gitHash}` : stamp;
  return `v0.0.0-dev+${suffix}`;
}
